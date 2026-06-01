"""
Nova Poshta API proxy — публічний шар нашого бекенда поверх api.novaposhta.ua.

Чому через бекенд, а не прямо з фронта?
  • Прихований API-ключ (зберігається лише в БД admin_settings + .env fallback)
  • CORS не блокує (наш бекенд → НП → нам)
  • Можемо кешувати результати, фільтрувати, агрегувати тощо
  • Ключ керується з адмінки (Налаштування → Nova Poshta)

Endpoints:
  GET  /api/np/cities?q=Київ                       — автокомпліт міст
  GET  /api/np/warehouses?city_ref=…&q=…&type=…    — відділення/поштомати
  GET  /api/np/streets?settlement_ref=…&q=…        — пошук вулиць (courier mode)
  GET  /api/np/track/{ttn}                          — статус посилки за ТТН
  POST /api/np/price                                — оцінка вартості доставки
  GET  /api/np/nearest?lat=…&lng=…                  — найближче місто/відділення
  GET  /api/np/health                               — самодіагностика інтеграції

Довідник: https://developers.novaposhta.ua/documentation
"""
from __future__ import annotations

import os
import re
import time
import math
import logging
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

NP_ENDPOINT = "https://api.novaposhta.ua/v2.0/json/"
# .env fallback — використовується якщо в адмінці ще немає ключа
NP_API_KEY_ENV = os.environ.get("NOVA_POSHTA_API_KEY", "")

# Tiny in-process key cache (5 секунд) — щоб не бити в Mongo на кожен запит.
_KEY_CACHE: Dict[str, Any] = {"ts": 0.0, "key": NP_API_KEY_ENV, "sender_ref": ""}
_KEY_TTL_SEC = 5

# Reference до db, передається через build_np_router(db)
_DB_REF: Optional[AsyncIOMotorDatabase] = None

# Простий in-memory cache (TTL) — НП-cities майже не змінюються,
# тому 1 година більш ніж достатньо. Track-кеш коротший (60с).
_CITIES_CACHE: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
_WAREHOUSES_CACHE: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
_STREETS_CACHE: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
_TRACK_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
_PRICE_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
_CACHE_TTL_SEC = 60 * 60          # 1h for static-ish data
_TRACK_TTL_SEC = 60               # 1 min for tracking (статус швидко змінюється)
_PRICE_TTL_SEC = 60 * 5           # 5 min


async def _get_active_key() -> str:
    """Бере ключ з admin_settings (live), fallback — .env.
    Кешуємо 5с щоб не били Mongo на автокомпліті."""
    now = time.time()
    if (now - _KEY_CACHE["ts"]) < _KEY_TTL_SEC and _KEY_CACHE.get("key"):
        return str(_KEY_CACHE["key"])
    key = NP_API_KEY_ENV
    sender = ""
    if _DB_REF is not None:
        try:
            doc = await _DB_REF.admin_settings.find_one({"_id": "main"}, {"nova_poshta_api_key": 1, "nova_poshta_sender_city_ref": 1})
            if doc:
                k = (doc.get("nova_poshta_api_key") or "").strip()
                if k:
                    key = k
                s = (doc.get("nova_poshta_sender_city_ref") or "").strip()
                if s:
                    sender = s
        except Exception as e:
            logger.warning(f"[np] failed to load admin_settings key: {e}")
    _KEY_CACHE["ts"] = now
    _KEY_CACHE["key"] = key
    _KEY_CACHE["sender_ref"] = sender
    return key


async def _get_sender_ref() -> str:
    """Sender city ref — береться з admin settings → env → default Полтава."""
    await _get_active_key()  # populates sender too
    if _KEY_CACHE.get("sender_ref"):
        return str(_KEY_CACHE["sender_ref"])
    return os.environ.get("NP_SENDER_CITY_REF", "db5c8892-391c-11dd-90d9-001a92567626")


def invalidate_key_cache() -> None:
    """Викликається з admin_routes при оновленні ключа, щоб одразу підхопити."""
    _KEY_CACHE["ts"] = 0.0


async def _np_call(model: str, method: str, props: Dict[str, Any]) -> Any:
    key = await _get_active_key()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Nova Poshta API key is not configured. Adjust it in Admin → Налаштування.",
        )
    payload = {
        "apiKey": key,
        "modelName": model,
        "calledMethod": method,
        "methodProperties": props,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.post(NP_ENDPOINT, json=payload)
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Nova Poshta upstream error: {e}")
        data = r.json()
        if not data.get("success", False):
            errs = data.get("errors") or data.get("warnings") or ["Невідома помилка НП"]
            msg = "; ".join(str(x) for x in errs)
            if any("limit" in str(x).lower() for x in (errs or [])):
                raise HTTPException(status_code=429, detail=f"NP rate limit: {msg}")
            raise HTTPException(status_code=502, detail=msg)
        return data.get("data", [])


# ---------------------------- helpers ----------------------------

_WEIGHT_RX = re.compile(r"до\s+(\d+)\s*кг", re.IGNORECASE)


def _parse_weight_limit(description: str) -> Optional[int]:
    """Витягує число «до X кг» з описання відділення.
    Наприклад: "Відділення №3 (до 30 кг на одне місце)" → 30.
    """
    if not description:
        return None
    m = _WEIGHT_RX.search(description)
    if not m:
        return None
    try:
        return int(m.group(1))
    except (ValueError, TypeError):
        return None


def _is_postomat(raw: Dict[str, Any]) -> bool:
    """Визначає, чи це поштомат за категорією/типом НП."""
    cat = str(raw.get("CategoryOfWarehouse") or "").lower()
    typ = str(raw.get("TypeOfWarehouse") or "").lower()
    bln = str(raw.get("PostomatFor") or "").lower()
    name = str(raw.get("Description") or "").lower()
    if "postomat" in cat or "postomat" in typ:
        return True
    if "поштомат" in name or "пошт. мат" in name:
        return True
    if bln and bln not in ("0", "false", ""):
        return True
    return False


def _is_freight(raw: Dict[str, Any], weight_limit: Optional[int]) -> bool:
    """Великогабарит = відділення з вантажним відсіком (>= 1000кг).
    Часто описано як «до 1000 кг» або «до 30 т» або має CategoryOfWarehouse='Branch'+Freight."""
    if weight_limit is not None and weight_limit >= 200:
        return True
    cat = str(raw.get("CategoryOfWarehouse") or "").lower()
    if "freight" in cat or "cargo" in cat:
        return True
    name = str(raw.get("Description") or "").lower()
    if "вантаж" in name or "до 1000 кг" in name or "до 30 т" in name:
        return True
    return False


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# ---------------------------- Pydantic models ----------------------------

class PriceRequest(BaseModel):
    city_sender_ref: Optional[str] = None       # за замовчуванням — наш склад
    city_recipient_ref: str = Field(min_length=8)
    weight_kg: float = Field(gt=0)
    cost_uah: float = Field(ge=0)
    service_type: str = "WarehouseWarehouse"    # WarehouseDoors, DoorsWarehouse, DoorsDoors
    cargo_type: str = "Cargo"                   # Cargo, Parcel, Documents, TiresWheels, Pallet


# Sender city: Полтава за замовчуванням (звідки відправляємо).
# Якщо для конкретного бізнесу потрібен інший — переазначиться через admin_settings або .env.
DEFAULT_SENDER_CITY_REF = os.environ.get(
    "NP_SENDER_CITY_REF",
    "db5c8892-391c-11dd-90d9-001a92567626",  # Полтава
)


def build_np_router(db: Optional[AsyncIOMotorDatabase] = None) -> APIRouter:
    """Build NP router. Pass `db` so the key can be read live з admin_settings.
    Якщо db не передано — використовується .env-fallback (NOVA_POSHTA_API_KEY)."""
    global _DB_REF
    _DB_REF = db
    router = APIRouter(prefix="/np", tags=["nova-poshta"])

    # =================================================================
    # Health check — швидка діагностика інтеграції
    # =================================================================
    @router.get("/health")
    async def health():
        key = await _get_active_key()
        if not key:
            return {"ok": False, "configured": False, "message": "API key missing"}
        try:
            await _np_call("Address", "getCities", {"Page": "1", "Limit": "1"})
            return {"ok": True, "configured": True, "message": "Nova Poshta reachable"}
        except HTTPException as e:
            return {"ok": False, "configured": True, "message": str(e.detail)}

    # =================================================================
    # 1) CITIES — пошук міст / населених пунктів
    # =================================================================
    @router.get("/cities")
    async def cities(q: str = Query("", description="Підрядок назви міста"),
                     limit: int = Query(15, ge=1, le=50)):
        q_norm = (q or "").strip()
        if len(q_norm) < 1:
            return {"items": []}

        cache_key = f"{q_norm.lower()}::{limit}"
        now = time.time()
        cached = _CITIES_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _CACHE_TTL_SEC:
            return {"items": cached[1]}

        try:
            data = await _np_call(
                "Address", "searchSettlements",
                {"CityName": q_norm, "Limit": str(limit)},
            )
        except HTTPException:
            data = []

        items: List[Dict[str, Any]] = []
        if isinstance(data, list):
            for block in data:
                addresses = block.get("Addresses") if isinstance(block, dict) else None
                if not addresses:
                    continue
                for a in addresses:
                    items.append({
                        "ref": a.get("Ref") or a.get("DeliveryCity") or "",
                        "name": a.get("MainDescription") or a.get("Present") or "",
                        "area": a.get("Area") or "",
                        "region": a.get("Region") or "",
                        "settlement_type": a.get("SettlementTypeCode") or "",
                        "present": a.get("Present") or "",
                    })
                    if len(items) >= limit:
                        break
                if len(items) >= limit:
                    break

        # Fallback на Address.getCities
        if not items:
            try:
                data2 = await _np_call(
                    "Address", "getCities",
                    {"FindByString": q_norm, "Limit": str(limit)},
                )
                if isinstance(data2, list):
                    for c in data2[:limit]:
                        items.append({
                            "ref": c.get("Ref", ""),
                            "name": c.get("Description", ""),
                            "area": c.get("AreaDescription", ""),
                            "region": c.get("RegionsDescription", ""),
                            "settlement_type": c.get("SettlementTypeDescription", ""),
                            "present": (c.get("Description", "") + ", " + c.get("AreaDescription", "")).strip(", "),
                        })
            except HTTPException:
                pass

        _CITIES_CACHE[cache_key] = (now, items)
        return {"items": items}

    # =================================================================
    # 2) WAREHOUSES — список відділень + фільтр за типом + weight_limit
    # =================================================================
    @router.get("/warehouses")
    async def warehouses(
        city_ref: str = Query(..., description="Ref міста, отриманий з /cities"),
        q: str = Query("", description="Номер або підрядок назви"),
        type: str = Query(
            "all",
            description="all | branch | postomat | freight",
        ),
        limit: int = Query(50, ge=1, le=500),
    ):
        if not city_ref:
            raise HTTPException(status_code=400, detail="city_ref is required")

        q_norm = (q or "").strip()
        type_norm = (type or "all").lower()
        cache_key = f"{city_ref}::{q_norm.lower()}::{type_norm}::{limit}"
        now = time.time()
        cached = _WAREHOUSES_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _CACHE_TTL_SEC:
            return {"items": cached[1]}

        props: Dict[str, Any] = {"Limit": "500"}
        # Передаємо тільки SettlementRef — НП конвертує сам.
        props["SettlementRef"] = city_ref

        try:
            data = await _np_call("AddressGeneral", "getWarehouses", props)
        except HTTPException as e:
            # Не валимо UI на 502 з боку НП — повертаємо порожній список
            # та лишаємо запис в логах. UI просто покаже "Нічого не знайдено".
            logger.info(f"[np.warehouses] upstream failed for city_ref={city_ref}: {e.detail}")
            _WAREHOUSES_CACHE[cache_key] = (now, [])
            return {"items": []}

        items: List[Dict[str, Any]] = []
        if isinstance(data, list):
            for w in data:
                desc = w.get("Description") or ""
                weight_limit = _parse_weight_limit(desc)
                # Якщо НП повертає TotalMaxWeightAllowed — використовуємо його як точне
                total_max = w.get("TotalMaxWeightAllowed")
                if total_max:
                    try:
                        wval = float(str(total_max).replace(",", "."))
                        if wval > 0:
                            weight_limit = int(wval)
                    except (ValueError, TypeError):
                        pass

                is_pm = _is_postomat(w)
                is_fr = _is_freight(w, weight_limit)
                if is_pm:
                    kind = "postomat"
                elif is_fr:
                    kind = "freight"
                else:
                    kind = "branch"

                items.append({
                    "ref": w.get("Ref", ""),
                    "number": w.get("Number", ""),
                    "description": desc,
                    "short_address": w.get("ShortAddress", ""),
                    "type": w.get("CategoryOfWarehouse") or w.get("TypeOfWarehouse", ""),
                    "kind": kind,
                    "weight_limit": weight_limit,
                    "lat": float(w["Latitude"]) if w.get("Latitude") else None,
                    "lng": float(w["Longitude"]) if w.get("Longitude") else None,
                })

        # Фільтр за типом
        if type_norm == "postomat":
            items = [it for it in items if it["kind"] == "postomat"]
        elif type_norm == "branch":
            items = [it for it in items if it["kind"] == "branch"]
        elif type_norm == "freight":
            items = [it for it in items if it["kind"] == "freight"]

        # Локальна фільтрація за введеним q
        if q_norm:
            if q_norm.isdigit():
                items = [it for it in items if (it.get("number") or "").startswith(q_norm)]
            else:
                ql = q_norm.lower()
                items = [it for it in items if ql in (it["description"] + " " + it["short_address"]).lower()]

        def _sort_key(it: Dict[str, Any]):
            n = it.get("number") or ""
            try:
                return (0, int(n))
            except (TypeError, ValueError):
                return (1, n)
        items.sort(key=_sort_key)
        items = items[:limit]

        _WAREHOUSES_CACHE[cache_key] = (now, items)
        return {"items": items}

    # =================================================================
    # 3) STREETS — пошук вулиць для кур'єрської доставки
    # =================================================================
    @router.get("/streets")
    async def streets(
        settlement_ref: str = Query(..., description="Ref населеного пункту"),
        q: str = Query("", description="Підрядок назви вулиці"),
        limit: int = Query(20, ge=1, le=50),
    ):
        if not settlement_ref:
            raise HTTPException(status_code=400, detail="settlement_ref is required")
        q_norm = (q or "").strip()
        if not q_norm:
            return {"items": []}

        cache_key = f"{settlement_ref}::{q_norm.lower()}::{limit}"
        now = time.time()
        cached = _STREETS_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _CACHE_TTL_SEC:
            return {"items": cached[1]}

        try:
            data = await _np_call(
                "Address", "searchSettlementStreets",
                {
                    "StreetName": q_norm,
                    "SettlementRef": settlement_ref,
                    "Limit": str(limit),
                },
            )
        except HTTPException:
            data = []

        items: List[Dict[str, Any]] = []
        if isinstance(data, list):
            for block in data:
                addresses = block.get("Addresses") if isinstance(block, dict) else None
                if not addresses:
                    continue
                for s in addresses:
                    items.append({
                        "ref": s.get("SettlementStreetRef") or s.get("Ref") or "",
                        "name": s.get("Present") or s.get("MainDescription") or "",
                        "street_type": s.get("StreetsTypeDescription") or s.get("StreetsType") or "",
                    })
                    if len(items) >= limit:
                        break
                if len(items) >= limit:
                    break

        _STREETS_CACHE[cache_key] = (now, items)
        return {"items": items}

    # =================================================================
    # 4) TRACKING — статус посилки за ТТН
    # =================================================================
    @router.get("/track/{ttn}")
    async def track(ttn: str, phone: str = Query("", description="Опц. телефон отримувача")):
        ttn_norm = re.sub(r"\D", "", ttn or "")
        if not ttn_norm or len(ttn_norm) < 8:
            raise HTTPException(status_code=400, detail="Invalid TTN format")

        cache_key = f"{ttn_norm}::{phone}"
        now = time.time()
        cached = _TRACK_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _TRACK_TTL_SEC:
            return cached[1]

        props = {
            "Documents": [
                {"DocumentNumber": ttn_norm, "Phone": phone or ""},
            ],
        }
        data = await _np_call("TrackingDocument", "getStatusDocuments", props)
        if not isinstance(data, list) or not data:
            raise HTTPException(status_code=404, detail="ТТН не знайдено")
        d = data[0]

        # Status normalization
        result = {
            "ttn": ttn_norm,
            "status_code": d.get("StatusCode") or "",
            "status": d.get("Status") or "",
            "city_sender": d.get("CitySender") or "",
            "city_recipient": d.get("CityRecipient") or "",
            "warehouse_sender": d.get("WarehouseSender") or "",
            "warehouse_recipient": d.get("WarehouseRecipient") or "",
            "recipient_full_name": d.get("RecipientFullName") or "",
            "scheduled_delivery_date": d.get("ScheduledDeliveryDate") or "",
            "actual_delivery_date": d.get("ActualDeliveryDate") or "",
            "date_created": d.get("DateCreated") or "",
            "weight": d.get("DocumentWeight") or "",
            "cost": d.get("DocumentCost") or "",
            "service_type": d.get("ServiceType") or "",
            "amount_to_pay": d.get("AmountToPay") or "0",
            "payer_type": d.get("PayerType") or "",
            "payment_method": d.get("PaymentMethod") or "",
            "tracking_url": f"https://novaposhta.ua/tracking/?cargo_number={ttn_norm}",
        }
        _TRACK_CACHE[cache_key] = (now, result)
        return result

    # =================================================================
    # 5) PRICE — оцінка вартості доставки
    # =================================================================
    @router.post("/price")
    async def price(req: PriceRequest):
        sender = req.city_sender_ref or (await _get_sender_ref())
        cache_key = f"{sender}::{req.city_recipient_ref}::{req.weight_kg}::{req.cost_uah}::{req.service_type}::{req.cargo_type}"
        now = time.time()
        cached = _PRICE_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _PRICE_TTL_SEC:
            return cached[1]

        props = {
            "CitySender": sender,
            "CityRecipient": req.city_recipient_ref,
            "Weight": str(req.weight_kg),
            "ServiceType": req.service_type,
            "Cost": str(int(round(req.cost_uah))),
            "CargoType": req.cargo_type,
            "SeatsAmount": "1",
        }
        try:
            data = await _np_call("InternetDocument", "getDocumentPrice", props)
        except HTTPException as e:
            # Не валимо UI — повертаємо м'який null
            logger.info(f"[np.price] failed: {e.detail}")
            return {"ok": False, "cost": None, "cost_redelivery": None, "message": str(e.detail)}

        if not isinstance(data, list) or not data:
            return {"ok": False, "cost": None, "cost_redelivery": None, "message": "no price"}

        d = data[0]
        result = {
            "ok": True,
            "cost": float(d.get("Cost") or 0),
            "cost_redelivery": float(d.get("CostRedelivery") or 0),
            "assessed_cost": float(d.get("AssessedCost") or 0),
            "message": "ok",
        }
        _PRICE_CACHE[cache_key] = (now, result)
        return result

    # =================================================================
    # 6) NEAREST — найближче місто/відділення за координатами браузера
    # =================================================================
    @router.get("/nearest")
    async def nearest(
        lat: float = Query(..., ge=-90.0, le=90.0),
        lng: float = Query(..., ge=-180.0, le=180.0),
    ):
        """Пошук найближчого населеного пункту/відділення за координатами.

        Стратегія: спершу шукаємо великі міста-кандидати в радіусі 60км
        через геокодований запит (на жаль НП не має `nearestCity` метода),
        тому використовуємо bbox→shortlist→getWarehouses з реальними lat/lng.
        Як fallback — повертаємо «Полтава» (наш склад)."""

        # Hardcoded shortlist великих обласних центрів (lat,lng,name,ref).
        # Перевірено через офіційні Refs НП — стабільні.
        BIG_CITIES = [
            (50.4501, 30.5234, "Київ",     "8d5a980d-391c-11dd-90d9-001a92567626"),
            (49.8397, 24.0297, "Львів",    "db5c8895-391c-11dd-90d9-001a92567626"),
            (46.4825, 30.7233, "Одеса",    "db5c88f0-391c-11dd-90d9-001a92567626"),
            (49.9935, 36.2304, "Харків",   "db5c88f5-391c-11dd-90d9-001a92567626"),
            (48.9226, 24.7111, "Івано-Франківськ", "db5c889f-391c-11dd-90d9-001a92567626"),
            (49.5883, 34.5514, "Полтава",  DEFAULT_SENDER_CITY_REF),
            (48.4647, 35.0462, "Дніпро",   "db5c8896-391c-11dd-90d9-001a92567626"),
            (50.7472, 25.3254, "Луцьк",    "db5c8894-391c-11dd-90d9-001a92567626"),
            (49.2331, 28.4682, "Вінниця",  "db5c8893-391c-11dd-90d9-001a92567626"),
            (50.6199, 26.2516, "Рівне",    "db5c88ed-391c-11dd-90d9-001a92567626"),
            (46.6354, 32.6169, "Херсон",   "db5c88f4-391c-11dd-90d9-001a92567626"),
            (50.9077, 34.7981, "Суми",     "db5c88f1-391c-11dd-90d9-001a92567626"),
            (50.2547, 28.6587, "Житомир",  "db5c8898-391c-11dd-90d9-001a92567626"),
            (47.8378, 35.1383, "Запоріжжя", "db5c8897-391c-11dd-90d9-001a92567626"),
            (49.5535, 25.5948, "Тернопіль", "db5c88f2-391c-11dd-90d9-001a92567626"),
            (50.7472, 25.3254, "Чернівці", "db5c88f3-391c-11dd-90d9-001a92567626"),
        ]

        best = min(BIG_CITIES, key=lambda c: _haversine_km(lat, lng, c[0], c[1]))
        cand_lat, cand_lng, cand_name, _cand_ref = best
        distance = _haversine_km(lat, lng, cand_lat, cand_lng)

        # Резолвимо SettlementRef через searchSettlements (наш cities-endpoint).
        # warehouses() приймає SettlementRef → НП конвертує внутрішньо.
        cand_ref = ""
        try:
            live = await cities(q=cand_name, limit=5)
            for c in live.get("items", []):
                if (c.get("name") or "").strip().lower() == cand_name.lower():
                    cand_ref = c.get("ref") or ""
                    break
            if not cand_ref and live.get("items"):
                cand_ref = live["items"][0].get("ref") or ""
        except Exception:
            pass

        # Тепер беремо warehouses цього міста і шукаємо найближче за lat/lng
        nearest_wh = None
        try:
            if not cand_ref:
                raise ValueError("city ref not resolved")
            wh_resp = await warehouses(city_ref=cand_ref, q="", type="all", limit=500)
            whs = wh_resp.get("items", [])
            scored = []
            for w in whs:
                if w.get("lat") and w.get("lng"):
                    d = _haversine_km(lat, lng, w["lat"], w["lng"])
                    scored.append((d, w))
            if scored:
                scored.sort(key=lambda x: x[0])
                nearest_wh = {**scored[0][1], "distance_km": round(scored[0][0], 2)}
        except Exception as e:
            logger.info(f"[np.nearest] warehouses scan failed: {e}")

        return {
            "city": {
                "ref": cand_ref or _cand_ref,
                "name": cand_name,
                "lat": cand_lat,
                "lng": cand_lng,
                "distance_km": round(distance, 1),
            },
            "warehouse": nearest_wh,
        }

    return router
