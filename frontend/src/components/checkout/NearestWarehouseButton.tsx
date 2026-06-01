import React, { useState } from "react";
import { findNearest, NPNearestResponse } from "../../lib/geo-api";
import styles from "./Autocomplete.module.css";

/* =====================================================================
   NearestWarehouseButton — використовує HTML5 Geolocation, щоб одним
   кліком підставити найближче місто та відділення на чекауті.

   Без зовнішніх інтеграцій: координати дає браузер, бекенд знаходить
   найближче з нашого hardcoded списку обласних центрів + реальні
   warehouses через НП.
   ===================================================================== */

type Props = {
  onResolved: (data: NPNearestResponse) => void;
  disabled?: boolean;
  testId?: string;
};

const NearestWarehouseButton: React.FC<Props> = ({ onResolved, disabled, testId }) => {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleClick = () => {
    setErr(null);
    if (!("geolocation" in navigator)) {
      setErr("Геолокація недоступна у цьому браузері");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const data = await findNearest(pos.coords.latitude, pos.coords.longitude);
          if (!data) {
            setErr("Не вдалося знайти найближче відділення");
            return;
          }
          onResolved(data);
        } catch {
          setErr("Помилка пошуку");
        } finally {
          setLoading(false);
        }
      },
      (e) => {
        setLoading(false);
        if (e.code === e.PERMISSION_DENIED) {
          setErr("Дозвольте доступ до геолокації у браузері");
        } else if (e.code === e.POSITION_UNAVAILABLE) {
          setErr("Геолокацію не визначено");
        } else if (e.code === e.TIMEOUT) {
          setErr("Час очікування геолокації вичерпано");
        } else {
          setErr("Не вдалося отримати геолокацію");
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  return (
    <div className={styles.nearestWrap}>
      <button
        type="button"
        className={styles.nearestBtn}
        onClick={handleClick}
        disabled={disabled || loading}
        data-testid={testId || "nearest-warehouse-btn"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.8"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
        </svg>
        <span>{loading ? "Шукаємо…" : "Найближче відділення"}</span>
      </button>
      {err && <span className={styles.nearestErr}>{err}</span>}
    </div>
  );
};

export default NearestWarehouseButton;
