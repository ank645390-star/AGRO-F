/**
 * Geo API client — обгортка над backend-проксі для Nova Poshta та Ukrposhta.
 * Працює без авторизації — всі ключі лежать на бекенді.
 */
import axios from "axios";

declare const process: { env: Record<string, string | undefined> };
const BACKEND_URL =
  (typeof process !== "undefined" && process.env.REACT_APP_BACKEND_URL) || "";

const api = axios.create({ baseURL: `${BACKEND_URL}/api`, timeout: 20000 });

export type NPCity = {
  ref: string;
  name: string;
  area: string;
  region: string;
  settlement_type: string;
  present: string;
};

export type WarehouseKind = "branch" | "postomat" | "freight";

export type NPWarehouse = {
  ref: string;
  number: string;
  description: string;
  short_address: string;
  type: string;
  kind: WarehouseKind;
  weight_limit: number | null;
  lat: number | null;
  lng: number | null;
};

export type NPStreet = {
  ref: string;
  name: string;
  street_type: string;
};

export type NPTrackingStatus = {
  ttn: string;
  status_code: string;
  status: string;
  city_sender: string;
  city_recipient: string;
  warehouse_sender: string;
  warehouse_recipient: string;
  recipient_full_name: string;
  scheduled_delivery_date: string;
  actual_delivery_date: string;
  date_created: string;
  weight: string;
  cost: string;
  service_type: string;
  amount_to_pay: string;
  payer_type: string;
  payment_method: string;
  tracking_url: string;
};

export type NPPriceResponse = {
  ok: boolean;
  cost: number | null;
  cost_redelivery: number | null;
  assessed_cost?: number;
  message: string;
};

export type NPNearestResponse = {
  city: {
    ref: string;
    name: string;
    lat: number;
    lng: number;
    distance_km: number;
  };
  warehouse: (NPWarehouse & { distance_km: number }) | null;
};

export async function searchCities(q: string, limit = 12): Promise<NPCity[]> {
  if (!q.trim()) return [];
  try {
    const { data } = await api.get<{ items: NPCity[] }>("/np/cities", {
      params: { q, limit },
    });
    return data.items || [];
  } catch (err) {
    console.warn("[geo-api] searchCities failed:", err);
    return [];
  }
}

export async function searchWarehouses(
  cityRef: string,
  q: string,
  limit = 50,
  type: WarehouseKind | "all" = "all",
): Promise<NPWarehouse[]> {
  if (!cityRef) return [];
  try {
    const { data } = await api.get<{ items: NPWarehouse[] }>("/np/warehouses", {
      params: { city_ref: cityRef, q, limit, type },
    });
    return data.items || [];
  } catch (err) {
    // Не валимо UI — повертаємо порожній список (502/429/тощо)
    console.warn("[geo-api] searchWarehouses failed:", err);
    return [];
  }
}

export async function searchStreets(
  settlementRef: string,
  q: string,
  limit = 20,
): Promise<NPStreet[]> {
  if (!settlementRef || !q.trim()) return [];
  try {
    const { data } = await api.get<{ items: NPStreet[] }>("/np/streets", {
      params: { settlement_ref: settlementRef, q, limit },
    });
    return data.items || [];
  } catch (err) {
    console.warn("[geo-api] searchStreets failed:", err);
    return [];
  }
}

export async function trackTtn(ttn: string, phone = ""): Promise<NPTrackingStatus | null> {
  const clean = (ttn || "").replace(/\D/g, "");
  if (!clean || clean.length < 8) return null;
  try {
    const { data } = await api.get<NPTrackingStatus>(`/np/track/${clean}`, {
      params: phone ? { phone } : undefined,
    });
    return data;
  } catch {
    return null;
  }
}

export async function estimatePrice(payload: {
  city_recipient_ref: string;
  weight_kg: number;
  cost_uah: number;
  service_type?: "WarehouseWarehouse" | "WarehouseDoors" | "DoorsWarehouse" | "DoorsDoors";
  cargo_type?: "Cargo" | "Parcel" | "Documents";
}): Promise<NPPriceResponse> {
  try {
    const { data } = await api.post<NPPriceResponse>("/np/price", {
      service_type: "WarehouseWarehouse",
      cargo_type: "Cargo",
      ...payload,
    });
    return data;
  } catch {
    return { ok: false, cost: null, cost_redelivery: null, message: "error" };
  }
}

export async function findNearest(lat: number, lng: number): Promise<NPNearestResponse | null> {
  try {
    const { data } = await api.get<NPNearestResponse>("/np/nearest", {
      params: { lat, lng },
    });
    return data;
  } catch {
    return null;
  }
}

/* ----------------------- Ukrposhta ----------------------- */
export type UPPostOffice = {
  postcode: string;
  name: string;
  city: string;
  address: string;
  region: string;
};

export async function fetchUkrposhtaByPostcode(postcode: string): Promise<UPPostOffice[]> {
  if (!/^\d{5}$/.test(postcode)) return [];
  try {
    const { data } = await api.get<{ items: UPPostOffice[] }>("/up/postoffices", {
      params: { postcode },
    });
    return data.items || [];
  } catch { return []; }
}

/* ----------------------- Recently Used (localStorage) ----------------------- */

const RU_CITIES_KEY = "tamis-np-recent-cities";
const RU_WAREHOUSES_KEY = "tamis-np-recent-warehouses";
const RU_LIMIT = 5;

function _readLS<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _writeLS<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, RU_LIMIT)));
  } catch { /* noop */ }
}

export function getRecentCities(): NPCity[] {
  return _readLS<NPCity>(RU_CITIES_KEY);
}

export function pushRecentCity(city: NPCity): void {
  if (!city || !city.ref) return;
  const existing = getRecentCities().filter((c) => c.ref !== city.ref);
  _writeLS(RU_CITIES_KEY, [city, ...existing]);
}

export function getRecentWarehouses(cityRef: string): NPWarehouse[] {
  const all = _readLS<NPWarehouse & { _cityRef?: string }>(RU_WAREHOUSES_KEY);
  return all.filter((w) => (w as any)._cityRef === cityRef);
}

export function pushRecentWarehouse(cityRef: string, w: NPWarehouse): void {
  if (!w || !w.ref) return;
  const all = _readLS<NPWarehouse & { _cityRef?: string }>(RU_WAREHOUSES_KEY);
  const filtered = all.filter((x) => x.ref !== w.ref);
  _writeLS(RU_WAREHOUSES_KEY, [{ ...w, _cityRef: cityRef } as any, ...filtered]);
}
