import React, { useEffect, useRef, useState } from "react";
import { searchStreets, NPStreet } from "../../lib/geo-api";
import styles from "./Autocomplete.module.css";

/* =====================================================================
   StreetAutocomplete — пошук вулиць у вибраному населеному пункті
   (Nova Poshta searchSettlementStreets). Використовується для
   кур'єрської доставки НП.

   onChange прокидує тільки name (рядок) — будинок/квартиру вводить
   користувач окремо у вкладеному полі.
   ===================================================================== */

type Props = {
  label?: string;
  settlementRef: string;
  value: string;
  onChange: (streetName: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  testId?: string;
};

const StreetAutocomplete: React.FC<Props> = ({
  label, settlementRef, value, onChange, placeholder, error, required, testId,
}) => {
  const [items, setItems] = useState<NPStreet[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const disabled = !settlementRef;

  useEffect(() => {
    if (!settlementRef || !value.trim()) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const list = await searchStreets(settlementRef, value.trim(), 20);
        if (!cancelled) {
          setItems(list);
          if (open) setActiveIdx(list.length ? 0 : -1);
        }
      } finally { if (!cancelled) setLoading(false); }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [settlementRef, value, open]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (s: NPStreet) => {
    onChange(s.name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && items[activeIdx]) pick(items[activeIdx]);
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className={styles.wrap} ref={wrapRef} data-error={error ? "true" : "false"}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required} aria-hidden="true"> *</span>}
        </label>
      )}
      <div className={styles.inputBox} data-disabled={disabled ? "true" : "false"}>
        <input
          type="text"
          className={styles.input}
          placeholder={disabled ? "Спочатку виберіть місто" : (placeholder || "Почніть вводити назву вулиці…")}
          value={value}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => { if (!disabled && value.trim()) setOpen(true); }}
          onKeyDown={onKeyDown}
          data-testid={testId}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-required={required ? "true" : undefined}
        />
        {loading && <span className={styles.spinner} aria-hidden="true" />}
      </div>
      {open && items.length > 0 && (
        <ul className={styles.dropdown} role="listbox" data-testid={`${testId}-dropdown`}>
          {items.map((s, i) => (
            <li
              key={s.ref + i}
              role="option"
              aria-selected={i === activeIdx}
              className={`${styles.option} ${i === activeIdx ? styles.optionActive : ""}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              data-testid={`${testId}-opt-${i}`}
            >
              <span className={styles.optName}>{s.name}</span>
              <span className={styles.optMeta}>{s.street_type}</span>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && value.trim() && items.length === 0 && (
        <div className={styles.empty} role="status" data-testid={`${testId}-empty`}>
          Вулицю не знайдено в базі НП — введіть вручну.
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
};

export default StreetAutocomplete;
