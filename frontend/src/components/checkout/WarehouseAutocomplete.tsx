import React, { useEffect, useRef, useState } from "react";
import {
  searchWarehouses,
  NPWarehouse,
  WarehouseKind,
  getRecentWarehouses,
  pushRecentWarehouse,
} from "../../lib/geo-api";
import styles from "./Autocomplete.module.css";

/* =====================================================================
   WarehouseAutocomplete — список відділень/поштоматів у обраному місті.

   Поліпшення:
     • Фільтр-чіпи: "Всі / Відділення / Поштомати / Великогабарит"
     • Recent warehouses у дропдауні якщо інпут порожній
     • Показує weight_limit (до X кг) як бейдж
     • Дизейблиться якщо cityRef порожній
     • Прокидує onChange(label, ref, number, full-object)
   ===================================================================== */

type Props = {
  label?: string;
  cityRef: string;
  value: string;
  onChange: (warehouseLabel: string, ref: string | null, number: string | null, w?: NPWarehouse | null) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  testId?: string;
};

const TYPE_CHIPS: { value: WarehouseKind | "all"; label: string; icon: string }[] = [
  { value: "all",      label: "Всі",            icon: "⌂"  },
  { value: "branch",   label: "Відділення",     icon: "\u25a3" },
  { value: "postomat", label: "Поштомати",      icon: "\u25a2" },
  { value: "freight",  label: "Великогабарит",  icon: "\u25a0" },
];

const WarehouseAutocomplete: React.FC<Props> = ({
  label, cityRef, value, onChange, placeholder, error, required, testId,
}) => {
  const [items, setItems] = useState<NPWarehouse[]>([]);
  const [recent, setRecent] = useState<NPWarehouse[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<WarehouseKind | "all">("all");
  const wrapRef = useRef<HTMLDivElement>(null);
  const disabled = !cityRef;

  useEffect(() => {
    if (cityRef) setRecent(getRecentWarehouses(cityRef));
    else setRecent([]);
  }, [cityRef]);

  useEffect(() => {
    if (!cityRef) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const list = await searchWarehouses(cityRef, value.trim(), 80, kind);
        if (!cancelled) {
          setItems(list);
          if (open) setActiveIdx(list.length ? 0 : -1);
        }
      } finally { if (!cancelled) setLoading(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [cityRef, value, open, kind]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pick = (w: NPWarehouse) => {
    const labelStr = `№${w.number} · ${w.short_address || w.description}`;
    onChange(labelStr, w.ref, w.number, w);
    pushRecentWarehouse(cityRef, w);
    setOpen(false);
  };

  const showingRecent = !value.trim() && recent.length > 0 && kind === "all";
  const listForKeys = showingRecent ? recent : items;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(listForKeys.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && listForKeys[activeIdx]) pick(listForKeys[activeIdx]);
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

      <div className={styles.typeChips} role="tablist" aria-label="Тип відділення">
        {TYPE_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            role="tab"
            aria-selected={kind === chip.value}
            className={`${styles.typeChip} ${kind === chip.value ? styles.typeChipActive : ""}`}
            onClick={() => setKind(chip.value)}
            disabled={disabled}
            data-testid={`${testId}-type-${chip.value}`}
          >
            <span className={styles.typeChipIcon} aria-hidden="true">{chip.icon}</span>
            <span>{chip.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.inputBox} data-disabled={disabled ? "true" : "false"}>
        <input
          type="text"
          className={styles.input}
          placeholder={disabled ? "Спочатку виберіть місто" : (placeholder || "Номер або адреса відділення")}
          value={value}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value, null, null, null); setOpen(true); }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          onKeyDown={onKeyDown}
          data-testid={testId}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-required={required ? "true" : undefined}
        />
        {loading && <span className={styles.spinner} aria-hidden="true" />}
      </div>
      {open && showingRecent && (
        <ul className={styles.dropdown} role="listbox" data-testid={`${testId}-recent`}>
          <li className={styles.dropdownGroupLabel}>Останні відділення</li>
          {recent.map((w, i) => (
            <li
              key={w.ref + i}
              role="option"
              aria-selected={i === activeIdx}
              className={`${styles.option} ${i === activeIdx ? styles.optionActive : ""}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(w); }}
              data-testid={`${testId}-recent-${i}`}
            >
              <span className={styles.optName}>
                №{w.number}
                <KindBadge kind={w.kind} weightLimit={w.weight_limit} />
              </span>
              <span className={styles.optMeta}>
                <span className={styles.recentBadge}>↻</span>
                {w.short_address || w.description}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && !showingRecent && items.length > 0 && (
        <ul className={styles.dropdown} role="listbox" data-testid={`${testId}-dropdown`}>
          {items.map((w, i) => (
            <li
              key={w.ref + i}
              role="option"
              aria-selected={i === activeIdx}
              className={`${styles.option} ${i === activeIdx ? styles.optionActive : ""}`}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(w); }}
              data-testid={`${testId}-opt-${i}`}
            >
              <span className={styles.optName}>
                №{w.number}
                <KindBadge kind={w.kind} weightLimit={w.weight_limit} />
              </span>
              <span className={styles.optMeta}>{w.short_address || w.description}</span>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && value.trim() && items.length === 0 && (
        <div className={styles.empty} role="status" data-testid={`${testId}-empty`}>
          Нічого не знайдено
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
};

const KindBadge: React.FC<{ kind: string; weightLimit: number | null }> = ({ kind, weightLimit }) => {
  if (kind === "postomat") {
    return <span className={styles.kindBadgePostomat}>Поштомат</span>;
  }
  if (kind === "freight") {
    return <span className={styles.kindBadgeFreight}>Великогабарит</span>;
  }
  if (weightLimit && weightLimit <= 30) {
    return <span className={styles.kindBadgeBranch}>до {weightLimit}\u00a0кг</span>;
  }
  return null;
};

export default WarehouseAutocomplete;
