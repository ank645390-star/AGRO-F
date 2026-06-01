import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Seo from "../components/Seo";
import { trackTtn, NPTrackingStatus } from "../lib/geo-api";
import styles from "./tracking.module.css";

/* =====================================================================
   /tracking/:ttn  або  /tracking (?ttn=)

   Сторінка відстеження посилки за ТТН На Пошти.
   - повно працює як guest, без авторизації
   - поля: статус, відправник, отримувач, відділення, дати, вага, вартість
   - Опційний телефон отримувача (дає більше даних з API)
   ===================================================================== */

const Tracking: React.FC = () => {
  const { ttn: ttnParam } = useParams();
  const navigate = useNavigate();

  const [ttn, setTtn] = useState(ttnParam || "");
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<NPTrackingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (rawTtn: string, rawPhone: string) => {
    const clean = rawTtn.replace(/\D/g, "");
    if (!clean || clean.length < 8) {
      setError("Введіть коректний ТТН (8–14 цифр)");
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await trackTtn(clean, rawPhone);
      if (!res) {
        setError("Посилку з таким ТТН не знайдено");
        setData(null);
      } else {
        setData(res);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ttnParam) {
      setTtn(ttnParam);
      fetchStatus(ttnParam, "");
    }
  }, [ttnParam, fetchStatus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = ttn.replace(/\D/g, "");
    if (clean !== ttnParam) navigate(`/tracking/${clean}`);
    else fetchStatus(clean, phone);
  };

  const statusVariant = (() => {
    const s = (data?.status_code || "").trim();
    // НП status codes — основні групи:
    // 1-3,5: креатив; 4-6: в дорозі; 7-8: відділення; 9: отримано
    if (s === "9") return "delivered";
    if (["7", "8"].includes(s)) return "ready";
    if (["3"].includes(s)) return "unknown";
    return "in-transit";
  })();

  return (
    <div className={styles.page}>
      <Seo title={`Відстеження ${ttn || "посилки"}`} canonical={`/tracking/${ttn || ""}`} noindex />
      <div className={styles.container}>
        <div className={styles.head}>
          <Link to="/" className={styles.backLink}>
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7L7 13" stroke="#2C2C27" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>На головну</span>
          </Link>
          <h1 className={styles.h1}>Відстеження посилки</h1>
          <p className={styles.sub}>Дані беруться напряму з API Нової Пошти. Оновлюється кожні кілька хвилин.</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.fieldRow}>
            <div className={styles.fieldGrow}>
              <label className={styles.label}>Номер ТТН</label>
              <input
                className={styles.input}
                value={ttn}
                onChange={(e) => setTtn(e.target.value)}
                placeholder="20451234567890"
                inputMode="numeric"
                maxLength={20}
                data-testid="tracking-ttn-input"
              />
            </div>
            <div className={styles.fieldGrow}>
              <label className={styles.label}>Телефон отримувача <span className={styles.optional}>(опційно)</span></label>
              <input
                className={styles.input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+380501234567"
                inputMode="tel"
                data-testid="tracking-phone-input"
              />
            </div>
            <button type="submit" className={styles.btn} disabled={loading} data-testid="tracking-submit">
              {loading ? "Перевіряємо…" : "Відстежити"}
            </button>
          </div>
        </form>

        {error && <div className={styles.error} role="alert">{error}</div>}

        {data && (
          <div className={styles.resultCard} data-testid="tracking-result">
            <div className={styles.resultHead}>
              <div>
                <div className={styles.ttnLine}>ТТН <span className={styles.ttnMono}>{data.ttn}</span></div>
                <h2 className={styles.statusTitle} data-variant={statusVariant}>
                  <span className={styles.statusDot} />
                  {data.status || "Статус невідомий"}
                </h2>
              </div>
              <a href={data.tracking_url} target="_blank" rel="noopener noreferrer" className={styles.npLink}>
                Відкрити на сайті НП →
              </a>
            </div>

            <dl className={styles.kv}>
              <div className={styles.kvRow}><dt>Місто відправника</dt><dd>{data.city_sender || "—"}</dd></div>
              <div className={styles.kvRow}><dt>Відділення відправника</dt><dd>{data.warehouse_sender || "—"}</dd></div>
              <div className={styles.kvRow}><dt>Місто отримувача</dt><dd>{data.city_recipient || "—"}</dd></div>
              <div className={styles.kvRow}><dt>Відділення отримувача</dt><dd>{data.warehouse_recipient || "—"}</dd></div>
              {data.recipient_full_name && <div className={styles.kvRow}><dt>Отримувач</dt><dd>{data.recipient_full_name}</dd></div>}
              {data.weight && <div className={styles.kvRow}><dt>Вага</dt><dd>{data.weight} кг</dd></div>}
              {data.cost && <div className={styles.kvRow}><dt>Обвявлена вартість</dt><dd>{data.cost} ₴</dd></div>}
              {data.amount_to_pay && data.amount_to_pay !== "0" && <div className={styles.kvRow}><dt>До сплати</dt><dd>{data.amount_to_pay} ₴</dd></div>}
              {data.date_created && <div className={styles.kvRow}><dt>Створена</dt><dd>{data.date_created}</dd></div>}
              {data.scheduled_delivery_date && <div className={styles.kvRow}><dt>Планова доставка</dt><dd>{data.scheduled_delivery_date}</dd></div>}
              {data.actual_delivery_date && <div className={styles.kvRow}><dt>Фактично доставлено</dt><dd>{data.actual_delivery_date}</dd></div>}
              {data.service_type && <div className={styles.kvRow}><dt>Тип доставки</dt><dd>{data.service_type}</dd></div>}
              {data.payment_method && <div className={styles.kvRow}><dt>Оплата</dt><dd>{data.payment_method}</dd></div>}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tracking;
