import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Seo from "../components/Seo";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import {
  fetchProfile,
  fetchAddresses,
  AddressDTO,
  createAddress,
  createOrder,
} from "../lib/profile-api";
import {
  fetchUkrposhtaByPostcode,
  UPPostOffice,
  estimatePrice,
  NPNearestResponse,
  NPWarehouse,
} from "../lib/geo-api";
import {
  isValidEmail,
  isValidUaPhone,
  progressiveFormatUaPhone,
  isValidUaZip,
} from "../lib/profile-utils";
import CityAutocomplete from "../components/checkout/CityAutocomplete";
import WarehouseAutocomplete from "../components/checkout/WarehouseAutocomplete";
import StreetAutocomplete from "../components/checkout/StreetAutocomplete";
import NearestWarehouseButton from "../components/checkout/NearestWarehouseButton";
import PaymentConfirmModal from "../components/checkout/PaymentConfirmModal";
import AuthModal from "../components/auth/AuthModal";
import { useContactInfo } from "../context/ContactInfoContext";
import { previewDiscount, type PreviewResponse } from "../lib/discounts-api";
import styles from "./checkout.module.css";

/* =================================================================
   /checkout — Оформлення замовлення (advanced NP)

   v2 features:
     • Auto-prefill contacts з акаунту / saved addresses
     • CityAutocomplete + WarehouseAutocomplete з типом (відділення/поштомат/вантаж)
     • StreetAutocomplete для кур'єрської доставки НП
     • «Найближче відділення» через HTML5 Geolocation
     • Розрахунок вартості доставки НП через /api/np/price
     • Попередження «до X кг» якщо обране відділення легше за реальну вагу замовлення
     • Multi-recipient: чекбокс «Замовлення для іншого отримувача»
     • Чекбокс «Зберегти цю адресу у профілі»
     • TTN tracking — посилання у success-overlay (для invoice-flow)
   ================================================================= */

type BuyerType = "individual" | "company";
type DeliveryType = "novaposhta" | "ukrposhta";
type NPMode = "branch" | "courier";
type PaymentType = "cod" | "invoice";

// Орієнтовна вага товару — 1.1 кг на 1 літр (агрохімія).
const KG_PER_LITER = 1.1;
// Fallback вага якщо обʼєм не вказано
const FALLBACK_KG_PER_UNIT = 1.0;

const Checkout: React.FC = () => {
  const { items, total, setQuantity, removeItem, clear } = useCart();
  const { user, isAuthed, logout } = useAuth();
  const { info: contactInfo } = useContactInfo();
  const navigate = useNavigate();

  /* ============ Identity (contacts) ============ */
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  /* ============ Recipient toggle (other person) ============ */
  const [otherRecipient, setOtherRecipient] = useState(false);
  const [recFirstName, setRecFirstName] = useState("");
  const [recLastName, setRecLastName] = useState("");
  const [recPhone, setRecPhone] = useState("");

  /* ============ Buyer / Delivery / Payment ============ */
  const [buyerType, setBuyerType] = useState<BuyerType>("individual");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("novaposhta");
  const [npMode, setNpMode] = useState<NPMode>("branch");
  const [paymentType, setPaymentType] = useState<PaymentType>("cod");

  /* ============ Address fields ============ */
  const [city, setCity] = useState("");
  const [cityRef, setCityRef] = useState<string>("");

  // Nova Poshta — branch
  const [warehouse, setWarehouse] = useState("");
  const [warehouseObj, setWarehouseObj] = useState<NPWarehouse | null>(null);

  // Nova Poshta — courier (street + house + apt)
  const [npStreetName, setNpStreetName] = useState("");
  const [npHouse, setNpHouse] = useState("");
  const [npApt, setNpApt] = useState("");

  // Ukrposhta
  const [upStreet, setUpStreet] = useState("");
  const [upZip, setUpZip] = useState("");
  const [upPostOffices, setUpPostOffices] = useState<UPPostOffice[]>([]);

  /* ============ Save address ============ */
  const [saveAddress, setSaveAddress] = useState(false);

  /* ============ Misc ============ */
  const [comment, setComment] = useState("");
  const [callBack, setCallBack] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  /* ============ Auth modal ============ */
  const [authModal, setAuthModal] = useState<{ open: boolean; tab: "login" | "register" }>({ open: false, tab: "login" });

  /* ============ Payment confirmation flow ============ */
  const [paymentModal, setPaymentModal] = useState(false);
  const [cardSuccess, setCardSuccess] = useState<null | { type: PaymentType; ref?: string; ttn?: string }>(null);

  /* ============ Saved addresses (authed) ============ */
  const [savedAddresses, setSavedAddresses] = useState<AddressDTO[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");

  /* ============================================================
     1) AUTO-PREFILL contacts from profile/auth
     ============================================================ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isAuthed && user) {
        if (!cancelled) {
          setFirstName(user.firstName || "");
          setLastName(user.lastName || "");
          setEmail(user.email || "");
          setPhone(user.phone || "");
        }
        return;
      }
      try {
        const p = await fetchProfile();
        if (cancelled) return;
        if (p.firstName) setFirstName(p.firstName);
        if (p.lastName) setLastName(p.lastName);
        if (p.email) setEmail(p.email);
        if (p.phone) setPhone(p.phone);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [isAuthed, user]);

  /* ============================================================
     2) Saved addresses for authed users
     ============================================================ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAuthed) {
        setSavedAddresses([]);
        setSelectedAddressId("");
        return;
      }
      try {
        const items = await fetchAddresses();
        if (cancelled) return;
        setSavedAddresses(items);
        const primary = items.find((a) => a.isPrimary) || items[0];
        if (primary) {
          applyAddress(primary);
          setSelectedAddressId(primary.id);
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  const applyAddress = (a: AddressDTO) => {
    // Recipient (auto-fill якщо інший отримувач не активований)
    setFirstName(a.firstName);
    setLastName(a.lastName);
    setPhone(a.phone);
    setCity(a.city);
    setCityRef(""); // користувач при редагуванні зможе обрати знову з автокомпліту
    setDeliveryType(a.carrier);
    if (a.carrier === "novaposhta") {
      setNpMode(a.deliveryMode || "branch");
      setWarehouse(a.branch || "");
      if (a.street) {
        // Парсимо назад street → name + house + apt (примітивно)
        setNpStreetName(a.street);
        setNpHouse("");
        setNpApt("");
      } else {
        setNpStreetName(""); setNpHouse(""); setNpApt("");
      }
    } else {
      setUpStreet(a.street || "");
      setUpZip(a.zip || "");
    }
  };

  const handleSelectAddress = (id: string) => {
    setSelectedAddressId(id);
    if (id === "__new") {
      setCity(""); setCityRef("");
      setWarehouse(""); setWarehouseObj(null);
      setNpStreetName(""); setNpHouse(""); setNpApt("");
      setUpStreet(""); setUpZip("");
      return;
    }
    const a = savedAddresses.find((x) => x.id === id);
    if (a) applyAddress(a);
  };

  /* ============================================================
     3) Ukrposhta — fetch post offices by ZIP
     ============================================================ */
  useEffect(() => {
    if (deliveryType !== "ukrposhta" || !isValidUaZip(upZip)) {
      setUpPostOffices([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const list = await fetchUkrposhtaByPostcode(upZip);
      if (!cancelled) setUpPostOffices(list);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [upZip, deliveryType]);

  /* ============================================================
     Helpers / Validation
     ============================================================ */
  const itemsCount = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);

  // Вага замовлення (приблизно)
  const totalWeightKg = useMemo(() => {
    let kg = 0;
    for (const it of items) {
      const v = parseFloat(String(it.volume || "0").replace(",", "."));
      const wPer = Number.isFinite(v) && v > 0 ? v * KG_PER_LITER : FALLBACK_KG_PER_UNIT;
      kg += wPer * it.quantity;
    }
    return Math.max(0.1, Math.round(kg * 10) / 10);
  }, [items]);

  // Попередження якщо обране відділення легше за вагу замовлення
  const weightWarning = useMemo(() => {
    if (deliveryType !== "novaposhta" || npMode !== "branch") return null;
    if (!warehouseObj || !warehouseObj.weight_limit) return null;
    if (totalWeightKg > warehouseObj.weight_limit) {
      return `Увага: вага замовлення ~${totalWeightKg} кг більша за ліміт цього ${warehouseObj.kind === "postomat" ? "поштомата" : "відділення"} (до ${warehouseObj.weight_limit} кг). Оберіть більше відділення.`;
    }
    return null;
  }, [deliveryType, npMode, warehouseObj, totalWeightKg]);

  // Estimate delivery cost (NP)
  const [deliveryCost, setDeliveryCost] = useState<number | null>(null);
  const [deliveryEstimating, setDeliveryEstimating] = useState(false);
  useEffect(() => {
    if (deliveryType !== "novaposhta" || !cityRef || items.length === 0) {
      setDeliveryCost(null);
      return;
    }
    let cancelled = false;
    setDeliveryEstimating(true);
    const t = setTimeout(async () => {
      try {
        const r = await estimatePrice({
          city_recipient_ref: cityRef,
          weight_kg: totalWeightKg,
          cost_uah: total,
          service_type: npMode === "courier" ? "WarehouseDoors" : "WarehouseWarehouse",
        });
        if (!cancelled) setDeliveryCost(r.ok && r.cost != null ? r.cost : null);
      } finally {
        if (!cancelled) setDeliveryEstimating(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [deliveryType, npMode, cityRef, totalWeightKg, total, items.length]);

  // Discount preview (existing)
  const [discountPreview, setDiscountPreview] = useState<PreviewResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) { setDiscountPreview(null); return; }
    const payload = items.map((i) => ({
      product_id: (i as any).productId || (i as any).product_id,
      slug: (i as any).slug,
      name: i.name,
      category: i.category || undefined,
      volume: i.volume || undefined,
      price: i.price,
      quantity: i.quantity,
    }));
    const t = setTimeout(() => {
      previewDiscount(payload)
        .then((r) => { if (!cancelled) setDiscountPreview(r); })
        .catch(() => { if (!cancelled) setDiscountPreview(null); });
    }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [items]);

  const discountAmount = discountPreview?.discount_total ?? 0;
  const grandTotalNoDelivery = discountPreview?.grand_total ?? total;
  const grandTotal = grandTotalNoDelivery + (deliveryCost || 0);
  const appliedRules = discountPreview?.applied_rules ?? [];
  const progressRules = discountPreview?.progress ?? [];
  const fmt = (n: number) => n.toLocaleString("uk-UA");

  /* ============ Apply nearest geolocation result ============ */
  const handleNearestResolved = (data: NPNearestResponse) => {
    setCity(data.city.name);
    setCityRef(data.city.ref);
    if (data.warehouse) {
      const wlabel = `№${data.warehouse.number} · ${data.warehouse.short_address || data.warehouse.description}`;
      setWarehouse(wlabel);
      setWarehouseObj(data.warehouse);
      setNpMode("branch");
    }
  };

  /* ============ Validation ============ */
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "Введіть ім'я";
    if (!lastName.trim()) e.lastName = "Введіть прізвище";
    if (!isValidEmail(email)) e.email = "Некоректна електронна пошта";
    if (!isValidUaPhone(phone)) e.phone = "Введіть коректний український номер";

    if (otherRecipient) {
      if (!recFirstName.trim()) e.recFirstName = "Введіть ім'я отримувача";
      if (!recLastName.trim()) e.recLastName = "Введіть прізвище отримувача";
      if (!isValidUaPhone(recPhone)) e.recPhone = "Введіть номер отримувача";
    }

    if (!city.trim()) e.city = "Виберіть населений пункт зі списку";
    if (deliveryType === "novaposhta") {
      if (npMode === "branch" && !warehouse.trim()) {
        e.warehouse = "Виберіть відділення зі списку";
      }
      if (npMode === "courier") {
        if (!npStreetName.trim()) e.npStreet = "Вкажіть вулицю";
        if (!npHouse.trim()) e.npHouse = "Будинок";
      }
    } else {
      if (!upStreet.trim()) e.upStreet = "Вкажіть вулицю та будинок";
      if (!isValidUaZip(upZip)) e.upZip = "Індекс має містити 5 цифр";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ============ Build final address string ============ */
  const buildAddress = (): string => {
    if (deliveryType === "novaposhta") {
      if (npMode === "branch") return warehouse;
      const parts: string[] = [npStreetName.trim()];
      if (npHouse.trim()) parts.push(npHouse.trim());
      const main = parts.filter(Boolean).join(", ");
      return npApt.trim() ? `${main}, кв. ${npApt.trim()}` : main;
    }
    return upStreet.trim();
  };

  /* ============ Submit handler ============ */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    if (!validate()) return;

    if (paymentType === "invoice") {
      setPaymentModal(true);
      return;
    }

    // COD flow: persist order + optionally save address
    setSubmitting(true);
    try {
      const addressStr = buildAddress();
      const recipientFirst = otherRecipient ? recFirstName : firstName;
      const recipientLast = otherRecipient ? recLastName : lastName;
      const recipientPhone = otherRecipient ? recPhone : phone;

      const order = await createOrder({
        carrier: deliveryType,
        delivery_mode: deliveryType === "novaposhta" ? npMode : null,
        city: city.trim(),
        address: addressStr,
        zip: deliveryType === "ukrposhta" ? upZip : null,
        recipient_first_name: recipientFirst.trim(),
        recipient_last_name: recipientLast.trim(),
        phone: recipientPhone.trim(),
        comment: comment.trim() || null,
        items: items.map((it) => ({
          product_id: (it as any).productId || (it as any).product_id || it.id,
          name: it.name,
          desc: it.category || null,
          photo: it.image || null,
          volume: it.volume || null,
          quantity: it.quantity,
          unit_price: it.price,
        })),
        delivery_cost: deliveryCost || 0,
      });

      // Save address (if requested)
      if (saveAddress && isAuthed) {
        try {
          await createAddress({
            carrier: deliveryType,
            title: deliveryType === "novaposhta"
              ? (npMode === "courier" ? `${city} — кур'єр` : `${city} — НП`)
              : `${city} — Укрпошта`,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            city: city.trim(),
            isPrimary: savedAddresses.length === 0,
            deliveryMode: deliveryType === "novaposhta" ? npMode : "branch",
            branch: deliveryType === "novaposhta" && npMode === "branch" ? warehouse : null,
            street: deliveryType === "ukrposhta"
              ? upStreet
              : (npMode === "courier" ? addressStr : null),
            zip: deliveryType === "ukrposhta" ? upZip : null,
          });
        } catch (saveErr) {
          console.warn("[checkout] save address failed", saveErr);
        }
      }

      await clear();
      setCardSuccess({ type: "cod", ref: order.number, ttn: order.ttn || undefined });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Не вдалося оформити замовлення";
      setErrors({ submit: String(msg) });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentConfirmed = async (payload: { transactionId: string; receiptName: string | null }) => {
    setPaymentModal(false);
    // У invoice-flow реально створити order ще не варто (це робить наступна ітерація CRM).
    // Для UX лишаємо референс.
    await clear();
    setCardSuccess({ type: "invoice", ref: payload.transactionId || payload.receiptName || undefined });
  };

  /* ============================================================
     RENDER
     ============================================================ */
  return (
    <div className={styles.page}>
      <Seo title="Оформлення замовлення" canonical="/checkout" noindex />
      <header className={styles.topRow}>
        <div className={styles.topRowInner}>
          <Link to="/" className={styles.backLink} data-testid="checkout-back">
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true">
              <path d="M7 1L1 7L7 13" stroke="#2C2C27" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Повернутися до кошика</span>
          </Link>

          <Link to="/" className={styles.logoWrap} aria-label="ТАМІС АГРО — на головну">
            <img loading="lazy" decoding="async" src="/logo@2x.png" alt="ТОРГОВИЙ ДІМ ТАМІС АГРО" width={128} height={90} />
          </Link>

          {isAuthed && user ? (
            <div className={styles.accountPill} data-testid="checkout-account-pill">
              <span className={styles.accountAvatar}>
                {(user.firstName?.[0] || "?").toUpperCase()}{(user.lastName?.[0] || "").toUpperCase()}
              </span>
              <span className={styles.accountName}>{user.firstName} {user.lastName}</span>
              <button type="button" className={styles.accountLogout} onClick={logout} data-testid="checkout-logout">Вихід</button>
            </div>
          ) : (
            <div className={styles.authButtons}>
              <button type="button" className={styles.loginBtn} onClick={() => setAuthModal({ open: true, tab: "login" })} data-testid="checkout-login-trigger">Увійти</button>
              <button type="button" className={styles.registerBtn} onClick={() => setAuthModal({ open: true, tab: "register" })} data-testid="checkout-register">
                <svg width="15" height="17" viewBox="0 0 15 17" fill="none" aria-hidden="true">
                  <circle cx="7.5" cy="4.5" r="3.5" stroke="#2C2C27" strokeWidth="1.5"/>
                  <path d="M1 16C1 12.6863 3.91015 10 7.5 10C11.0899 10 14 12.6863 14 16" stroke="#2C2C27" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>Зареєструватися</span>
              </button>
            </div>
          )}
        </div>
        <div className={styles.topRowDivider} />
      </header>

      <main className={styles.main}>
        <div className={styles.container}>
          <form className={styles.leftColumn} onSubmit={handleSubmit} noValidate>
            <h1 className={styles.h1}>Оформлення замовлення</h1>

            <div className={styles.formCard}>
              {/* ===== CONTACTS ===== */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Контактні дані</h2>
                <div className={styles.fieldGrid2}>
                  <Field label="Ім'я" required value={firstName} onChange={setFirstName}
                         placeholder="Введіть ім'я" error={errors.firstName} testId="checkout-first-name" />
                  <Field label="Прізвище" required value={lastName} onChange={setLastName}
                         placeholder="Введіть прізвище" error={errors.lastName} testId="checkout-last-name" />
                </div>
                <Field label="Пошта" required type="email" value={email} onChange={setEmail}
                       placeholder="example@email.com" error={errors.email} testId="checkout-email" />
                <Field label="Телефон" required type="tel" value={phone}
                       onChange={(v) => setPhone(progressiveFormatUaPhone(v))}
                       placeholder="+380 (XX) XXX XX XX" error={errors.phone} testId="checkout-phone"
                       maxLength={19} />

                {/* Multi-recipient toggle */}
                <label className={styles.checkRow} style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={otherRecipient}
                    onChange={(e) => setOtherRecipient(e.target.checked)}
                    data-testid="checkout-other-recipient"
                  />
                  <span>Отримувач — інша особа (напр. агроном на полі)</span>
                </label>

                {otherRecipient && (
                  <div className={styles.recipientBox} data-testid="checkout-recipient-box">
                    <div className={styles.fieldGrid2}>
                      <Field label="Ім'я отримувача" required value={recFirstName} onChange={setRecFirstName}
                             placeholder="Імʼя" error={errors.recFirstName} testId="checkout-rec-first" />
                      <Field label="Прізвище отримувача" required value={recLastName} onChange={setRecLastName}
                             placeholder="Прізвище" error={errors.recLastName} testId="checkout-rec-last" />
                    </div>
                    <Field label="Телефон отримувача" required type="tel" value={recPhone}
                           onChange={(v) => setRecPhone(progressiveFormatUaPhone(v))}
                           placeholder="+380 (XX) XXX XX XX" error={errors.recPhone} testId="checkout-rec-phone"
                           maxLength={19} />
                  </div>
                )}
              </section>

              {/* ===== SAVED ADDRESSES (authed) ===== */}
              {isAuthed && savedAddresses.length > 0 && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Куди доставити?</h2>
                  <p className={styles.sectionHint}>Виберіть збережену адресу або введіть нову.</p>
                  <div className={styles.addrChoiceList} data-testid="checkout-saved-addresses">
                    {savedAddresses.map((a) => (
                      <label key={a.id} className={`${styles.addrChoice} ${selectedAddressId === a.id ? styles.addrChoiceActive : ""}`}>
                        <input
                          type="radio"
                          name="savedAddr"
                          checked={selectedAddressId === a.id}
                          onChange={() => handleSelectAddress(a.id)}
                          className={styles.addrChoiceInput}
                          data-testid={`saved-addr-${a.id}`}
                        />
                        <div className={styles.addrChoiceBody}>
                          <div className={styles.addrChoiceHead}>
                            <span className={styles.addrChoiceTitle}>{a.title}</span>
                            {a.isPrimary && <span className={styles.addrChoiceTag}>Основна</span>}
                            <span className={a.carrier === "novaposhta" ? styles.addrCarrierNP : styles.addrCarrierUP}>
                              {a.carrier === "novaposhta" ? "Нова Пошта" : "Укр Пошта"}
                            </span>
                          </div>
                          <div className={styles.addrChoiceLines}>
                            <span>{a.lastName} {a.firstName} · {a.phone}</span>
                            <span>
                              {a.city}{" · "}
                              {a.carrier === "novaposhta"
                                ? (a.deliveryMode === "courier" ? a.street : a.branch)
                                : `${a.street}, ${a.zip}`}
                            </span>
                          </div>
                        </div>
                      </label>
                    ))}
                    <label className={`${styles.addrChoice} ${styles.addrChoiceNew} ${selectedAddressId === "__new" ? styles.addrChoiceActive : ""}`}>
                      <input
                        type="radio"
                        name="savedAddr"
                        checked={selectedAddressId === "__new"}
                        onChange={() => handleSelectAddress("__new")}
                        className={styles.addrChoiceInput}
                        data-testid="saved-addr-new"
                      />
                      <span className={styles.addrChoiceNewLabel}>+ Ввести іншу адресу</span>
                    </label>
                  </div>
                </section>
              )}

              {/* ===== BUYER TYPE ===== */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Тип покупця</h2>
                <div className={styles.radioGroup}>
                  <RadioRow name="buyerType" checked={buyerType === "individual"} onChange={() => setBuyerType("individual")} label="Фізична особа" testId="checkout-buyer-individual" />
                  <RadioRow name="buyerType" checked={buyerType === "company"} onChange={() => setBuyerType("company")} label="Юридична особа" testId="checkout-buyer-company" />
                </div>
              </section>

              {/* ===== DELIVERY ===== */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Доставка</h2>

                <div className={styles.carrierTabs} role="tablist">
                  <button type="button" role="tab"
                          aria-selected={deliveryType === "novaposhta"}
                          className={`${styles.carrierTab} ${deliveryType === "novaposhta" ? styles.carrierTabActive : ""}`}
                          onClick={() => setDeliveryType("novaposhta")}
                          data-testid="checkout-delivery-novaposhta">
                    Нова Пошта
                  </button>
                  <button type="button" role="tab"
                          aria-selected={deliveryType === "ukrposhta"}
                          className={`${styles.carrierTab} ${deliveryType === "ukrposhta" ? styles.carrierTabActive : ""}`}
                          onClick={() => setDeliveryType("ukrposhta")}
                          data-testid="checkout-delivery-ukrposhta">
                    Укр Пошта
                  </button>
                </div>

                {/* Nearest button (НП only) */}
                {deliveryType === "novaposhta" && (
                  <NearestWarehouseButton
                    onResolved={handleNearestResolved}
                    testId="checkout-nearest"
                  />
                )}

                <CityAutocomplete
                  label="Населений пункт"
                  required
                  value={city}
                  onChange={(name, ref) => {
                    setCity(name);
                    setCityRef(ref || "");
                    // Якщо змінили місто → скидаємо вибране відділення
                    if (ref) {
                      setWarehouse("");
                      setWarehouseObj(null);
                      setNpStreetName(""); setNpHouse(""); setNpApt("");
                    }
                  }}
                  placeholder="Почніть вводити: Київ, Львів, с. Шевченкове…"
                  error={errors.city}
                  testId="checkout-city"
                />

                {deliveryType === "novaposhta" && (
                  <>
                    <div className={styles.modeRow}>
                      <RadioRow name="npMode" checked={npMode === "branch"} onChange={() => setNpMode("branch")} label="У відділення / поштомат" testId="np-mode-branch" />
                      <RadioRow name="npMode" checked={npMode === "courier"} onChange={() => setNpMode("courier")} label="Кур'єрська доставка" testId="np-mode-courier" />
                    </div>

                    {npMode === "branch" ? (
                      <>
                        <WarehouseAutocomplete
                          label="Відділення Нової Пошти"
                          required
                          cityRef={cityRef}
                          value={warehouse}
                          onChange={(label, _ref, _num, w) => {
                            setWarehouse(label);
                            setWarehouseObj(w || null);
                          }}
                          placeholder="Введіть номер (напр., 1) або вулицю"
                          error={errors.warehouse}
                          testId="checkout-warehouse"
                        />
                        {weightWarning && (
                          <div className={styles.weightWarn} data-testid="weight-warning">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span>{weightWarning}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <StreetAutocomplete
                          label="Вулиця"
                          required
                          settlementRef={cityRef}
                          value={npStreetName}
                          onChange={setNpStreetName}
                          placeholder="вул. Шевченка"
                          error={errors.npStreet}
                          testId="checkout-np-street"
                        />
                        <div className={styles.fieldGrid2}>
                          <Field label="Будинок" required value={npHouse} onChange={setNpHouse}
                                 placeholder="12" error={errors.npHouse} testId="checkout-np-house" />
                          <Field label="Квартира / офіс" value={npApt} onChange={setNpApt}
                                 placeholder="5" testId="checkout-np-apt" />
                        </div>
                      </>
                    )}
                  </>
                )}

                {deliveryType === "ukrposhta" && (
                  <>
                    <Field label="Вулиця, будинок, кв." required value={upStreet} onChange={setUpStreet}
                           placeholder="вул. Київська 135, кв. 12"
                           error={errors.upStreet} testId="checkout-up-street" />
                    <div className={styles.fieldGrid2}>
                      <Field label="Поштовий індекс" required value={upZip}
                             onChange={(v) => setUpZip(v.replace(/\D/g, "").slice(0, 5))}
                             placeholder="00000" maxLength={5} inputMode="numeric"
                             error={errors.upZip} testId="checkout-up-zip" />
                      {upPostOffices.length > 0 && (
                        <div className={styles.upInfoBox} data-testid="up-postoffice-info">
                          <div className={styles.upInfoTitle}>Відділення Укрпошти</div>
                          <div className={styles.upInfoText}>
                            {upPostOffices[0].name || upPostOffices[0].address || `Індекс ${upPostOffices[0].postcode}`}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Save-address checkbox (if authed) */}
                {isAuthed && selectedAddressId === "__new" && (
                  <label className={styles.checkRow} style={{ marginTop: 6 }}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={saveAddress}
                      onChange={(e) => setSaveAddress(e.target.checked)}
                      data-testid="checkout-save-address"
                    />
                    <span>Зберегти цю адресу у профілі</span>
                  </label>
                )}
              </section>

              {/* ===== PAYMENT ===== */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Оплата</h2>
                <div className={styles.radioGroup}>
                  <RadioRow name="payment" checked={paymentType === "cod"} onChange={() => setPaymentType("cod")} label="Накладний платіж (при отриманні)" testId="checkout-pay-cod" />
                  <RadioRow name="payment" checked={paymentType === "invoice"} onChange={() => setPaymentType("invoice")} label="За реквізитами (безготівковий розрахунок)" testId="checkout-pay-invoice" />
                </div>
                {paymentType === "invoice" && (
                  <div className={styles.requisitesBox} data-testid="checkout-requisites">
                    <div className={styles.requisitesTitle}>Реквізити для оплати</div>
                    <ul className={styles.requisitesList}>
                      <li><span>Одержувач:</span> ТОВ «ТОРГОВИЙ ДІМ ТАМІС АГРО»</li>
                      <li><span>ЄДРПОУ:</span> 12345678</li>
                      <li><span>IBAN:</span> UA00 0000 0000 0000 0000 0000 000</li>
                      <li><span>Банк:</span> АТ КБ «ПриватБанк»</li>
                      <li><span>Призначення:</span> Оплата за товар згідно замовлення</li>
                    </ul>
                    <p className={styles.requisitesHint}>
                      Рахунок-фактура буде надіслано на пошту після оформлення замовлення.
                    </p>
                  </div>
                )}
              </section>

              {/* ===== COMMENT ===== */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Коментар до замовлення</h2>
                <div className={styles.commentWrap}>
                  <label className={styles.fieldLabel}>Коментар</label>
                  <div className={styles.fieldBox}>
                    <input
                      className={styles.fieldInput}
                      type="text"
                      value={comment}
                      placeholder="Напишіть ваш коментар..."
                      onChange={(e) => setComment(e.target.value)}
                      data-testid="checkout-comment"
                    />
                  </div>
                </div>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={callBack}
                    onChange={(e) => setCallBack(e.target.checked)}
                    data-testid="checkout-callback"
                  />
                  <span>Передзвонити для уточнення деталей замовлення</span>
                </label>
              </section>
            </div>

            {errors.submit && (
              <div className={styles.submitError} role="alert">{errors.submit}</div>
            )}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={items.length === 0 || submitting}
              data-testid="checkout-submit"
            >
              <span>{submitting ? "Відправляємо…" : "Оформити замовлення"}</span>
              <svg width="15" height="12" viewBox="0 0 15 12" fill="none" aria-hidden="true">
                <path d="M1 6H13M13 6L8 1M13 6L8 11" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </form>

          <aside className={styles.rightColumn}>
            <div className={styles.summaryCard} data-testid="checkout-summary">
              <div className={styles.summaryHeader}>
                <h2 className={styles.summaryTitle}>Ваші товари ({items.length})</h2>
                <Link to="/catalog" className={styles.continueShoppingLink} data-testid="continue-shopping-link" aria-label="Продовжити покупки">
                  <span>Продовжити покупки</span>
                  <svg width="15" height="12" viewBox="0 0 15 12" fill="none" aria-hidden="true">
                    <path d="M1 6H13M13 6L8 1M13 6L8 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Link>
              </div>
              <div className={styles.summaryBody}>
                {items.length === 0 ? (
                  <div className={styles.emptyState}>
                    Ваш кошик порожній.&nbsp;
                    <Link to="/catalog" className={styles.emptyLink}>Перейти до каталогу →</Link>
                  </div>
                ) : (
                  <>
                    <ul className={styles.itemList}>
                      {items.map((it) => {
                        const line = it.price * it.quantity;
                        const v = parseFloat(String(it.volume || "0").replace(",", "."));
                        return (
                          <li key={it.id} className={styles.itemRow} data-testid="summary-item">
                            <div className={styles.itemImage}>
                              <img loading="lazy" decoding="async" src={it.image} alt={it.name} width={134} height={130} />
                            </div>
                            <div className={styles.itemBody}>
                              <div className={styles.itemTop}>
                                <div className={styles.itemTextBlock}>
                                  <div className={styles.itemName}>{it.name}</div>
                                  <div className={styles.itemDesc}>{it.category}</div>
                                </div>
                                <div className={styles.itemPrice}>{fmt(line)} ₴</div>
                                <button type="button" className={styles.itemRemove} onClick={() => removeItem(it.id)} aria-label="Видалити товар">
                                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                    <path d="M3 6h14M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2M5 6l1 11a2 2 0 002 2h4a2 2 0 002-2l1-11" stroke="#2C2C27" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M9 10v6M11 10v6" stroke="#2C2C27" strokeWidth="1.5" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              </div>
                              <div className={styles.itemMeta}>
                                <span className={styles.metaTag}><span className={styles.dot} /> Тара: {it.volume || "—"}</span>
                                <span className={styles.metaTag}><span className={styles.metaX}>x</span>Кіл-ть: {it.quantity} од</span>
                              </div>
                              <div className={styles.itemFooter}>
                                <div className={styles.counter}>
                                  <button type="button" className={styles.counterBtn} onClick={() => setQuantity(it.id, Math.max(1, it.quantity - 1))} aria-label="Зменшити" data-testid="summary-decrement">−</button>
                                  <span className={styles.counterValue}>{it.quantity}</span>
                                  <button type="button" className={styles.counterBtn} onClick={() => setQuantity(it.id, it.quantity + 1)} aria-label="Збільшити" data-testid="summary-increment">+</button>
                                </div>
                                <div className={styles.itemUnitPrice}>{fmt(it.price)} ₴{v ? `/${v} л` : ""}</div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    <div className={styles.totalsBlock}>
                      <div className={styles.totalsRow}>
                        <span>Товари ({itemsCount} шт.)</span>
                        <span>{fmt(total)} ₴</span>
                      </div>
                      <div className={styles.totalsRow} data-testid="delivery-cost-row">
                        <span className={styles.deliveryInfo}>
                          Доставка{deliveryType === "novaposhta" ? " · Нова Пошта" : " · Укрпошта"}
                          {totalWeightKg ? <> · ≈ {totalWeightKg} кг</> : null}
                        </span>
                        <span>
                          {deliveryType === "ukrposhta"
                            ? "За тарифом Укрпошти"
                            : deliveryEstimating
                            ? "Розраховуємо…"
                            : deliveryCost != null
                            ? `${fmt(Math.round(deliveryCost))} ₴`
                            : "Виберіть місто"}
                        </span>
                      </div>

                      {progressRules.map((rule) => {
                        const applied = appliedRules.find((a) => a.id === rule.id);
                        return (
                          <div
                            key={rule.id}
                            className={`${styles.totalsRow} ${styles.totalsRowDiscount}`}
                            data-testid={`discount-row-${rule.id}`}
                          >
                            <span className={styles.discountInfo}>{rule.label || rule.name}</span>
                            <span className={rule.eligible ? styles.discountActive : styles.discountInactive}>
                              Знижка {rule.percent}%
                              {applied && applied.amount > 0 ? ` · −${fmt(applied.amount)} ₴` : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              {items.length > 0 && (
                <div className={styles.grandTotal}>
                  <span>Разом:</span>
                  <span>{fmt(Math.round(grandTotal))} ₴</span>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      <footer className={styles.helpFooter}>
        <div className={styles.helpInner}>
          <h3 className={styles.helpTitle}>Виникли труднощі?</h3>
          <p className={styles.helpDesc}>
            Відділ турботи за клієнтами радий вам допомогти<br />
            у будні дні з 9 до 19, у вихідні та святкові — з 10 до 18
          </p>
          <a href={`tel:${contactInfo.phone_primary_tel}`} className={styles.helpPhone}>{contactInfo.phone_primary}</a>
        </div>
      </footer>

      <AuthModal
        open={authModal.open}
        initialTab={authModal.tab}
        onClose={() => setAuthModal({ ...authModal, open: false })}
      />

      <PaymentConfirmModal
        open={paymentModal}
        amount={grandTotal}
        onClose={() => setPaymentModal(false)}
        onFinalConfirm={handlePaymentConfirmed}
      />

      {cardSuccess && cardSuccess.type === "cod" && (
        <div className={styles.successOverlay} role="dialog" aria-modal="true" data-testid="cod-success">
          <div className={styles.successCard}>
            <div className={styles.successCheck} aria-hidden="true">
              <svg width="56" height="56" viewBox="0 0 60 60" fill="none">
                <circle cx="30" cy="30" r="28" fill="#e7ebe7" stroke="#1b4332" strokeWidth="2"/>
                <path d="M18 30L26 38L42 22" stroke="#1b4332" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className={styles.successTitle}>Замовлення {cardSuccess.ref} прийнято</h2>
            <p className={styles.successText}>
              Дякуємо за замовлення!<br />
              Менеджер зв'яжеться з вами найближчим часом для уточнення деталей доставки.
              Оплата — при отриманні (накладний платіж).
            </p>
            {cardSuccess.ttn && (
              <p className={styles.successText} style={{ marginTop: 4 }}>
                ТТН Нової Пошти: <strong>{cardSuccess.ttn}</strong>
                <br />
                <a
                  href={`https://novaposhta.ua/tracking/?cargo_number=${cardSuccess.ttn}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.emptyLink}
                >
                  Відстежити посилку →
                </a>
              </p>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
              <button type="button" className={styles.successBtn} onClick={() => navigate("/profile/orders")}>Мої замовлення</button>
              <button type="button" className={styles.successBtn} style={{ background: "#fff", color: "#1b4332", border: "1.5px solid #1b4332" }} onClick={() => navigate("/")}>На головну</button>
            </div>
          </div>
        </div>
      )}
      {cardSuccess && cardSuccess.type === "invoice" && (
        <div className={styles.successOverlay} role="dialog" aria-modal="true" data-testid="invoice-success">
          <div className={styles.successCard}>
            <div className={styles.successCheck} aria-hidden="true">
              <svg width="56" height="56" viewBox="0 0 60 60" fill="none">
                <circle cx="30" cy="30" r="28" fill="#e7ebe7" stroke="#1b4332" strokeWidth="2"/>
                <path d="M18 30L26 38L42 22" stroke="#1b4332" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className={styles.successTitle}>Оплату прийнято в обробку</h2>
            <p className={styles.successText}>
              Ваше підтвердження отримано. Після перевірки менеджер зв'яжеться з вами для уточнення доставки.<br />
              {cardSuccess.ref && <>Референс: <strong>{cardSuccess.ref}</strong></>}
            </p>
            <button type="button" className={styles.successBtn} onClick={() => navigate("/")}>На головну</button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
   Sub-components
   ============================================================ */
type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  testId?: string;
  required?: boolean;
  inputMode?: "text" | "numeric" | "tel" | "email" | "search";
  maxLength?: number;
};

const Field: React.FC<FieldProps> = ({
  label, value, onChange, placeholder, type = "text", error, testId, required, inputMode, maxLength,
}) => (
  <div className={styles.fieldWrap} data-error={error ? "true" : "false"}>
    <label className={styles.fieldLabel}>
      {label}
      {required && <span className={styles.fieldRequired} aria-hidden="true"> *</span>}
    </label>
    <div className={styles.fieldBox}>
      <input
        type={type}
        className={styles.fieldInput}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-required={required ? "true" : undefined}
        autoComplete="off"
      />
    </div>
    {error && <div className={styles.fieldError}>{error}</div>}
  </div>
);

const RadioRow: React.FC<{
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  testId?: string;
}> = ({ name, checked, onChange, label, testId }) => (
  <label className={styles.radioRow}>
    <input
      type="radio"
      name={name}
      checked={checked}
      onChange={onChange}
      className={styles.radioInput}
      data-testid={testId}
    />
    <span className={styles.radioLabel}>{label}</span>
  </label>
);

export default Checkout;
