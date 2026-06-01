import React, { useMemo, useState } from "react";
import BrandSelect from "./BrandSelect";
import styles from "./PriceVolumeFields.module.css";

/* =====================================================================
   PriceVolumeFields — повноцінна валідація для блоку "Ціна і обсяг"
   у формі AdminProductEdit.

   Покриває 3 поля:
     • Базова ціна (₴/л)   → числовий ввід з маскою (тільки цифри + 2 знаки
                              після коми), мінімум > 0, без leading-zero,
                              інлайн-помилка червоним.
     • Дефолтний обсяг     → випадний список (BrandSelect) із готових
                              варіантів (1 Л, 5 Л, 10 Л, 20 Л) + опція
                              "Власне значення", куди можна ввести лише
                              позитивне число + одиницю (Л/мл/кг/г/т/шт).
     • Тара                → chip-input: окремі теги "1 Л", "5 Л", "10 Л",
                              додаються Enter або кнопкою «+ Додати», з
                              валідацією формату.

   Усе строго контрольовано через props (value + onChange) — без локального
   стейту-зайвинки. Локальний стейт лише для UX-полів (текст у чіп-інпуті
   до натискання Enter, текст "власного" обсягу).
   ===================================================================== */

// ---------------- Constants ----------------
const VOLUME_PRESETS = ["1 Л", "5 Л", "10 Л", "20 Л", "1 кг", "5 кг", "10 кг"];
const VOLUME_UNITS = ["Л", "мл", "кг", "г", "т", "шт"];
const CUSTOM_VALUE = "__custom__";

// Регулярки для валідації
//   - Ціна: цифра, опц. кома/крапка + 1-2 цифри. Без leading-zero якщо >= 10.
const PRICE_VALID_RE = /^(0|[1-9]\d*)([.,]\d{1,2})?$/;
//   - Об'єм: число (ціле або дробове через крапку/кому) + пробіл + одиниця
const VOLUME_VALID_RE = /^(\d+([.,]\d{1,3})?)\s?(Л|л|мл|кг|г|т|шт)$/i;

// ---------------- Helpers ----------------
export function isValidPrice(raw: string | number): boolean {
  if (raw === "" || raw == null) return false;
  const s = String(raw).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

export function isValidVolume(raw: string): boolean {
  if (!raw) return false;
  return VOLUME_VALID_RE.test(raw.trim());
}

// Нормалізація: "1 л" → "1 Л", "5л" → "5 Л", "1.5 КГ" → "1.5 кг"
export function normalizeVolume(raw: string): string {
  const m = raw.trim().match(VOLUME_VALID_RE);
  if (!m) return raw.trim();
  const num = m[1].replace(",", ".");
  const unit = m[3].toLowerCase();
  // "Л" з великої — для основних одиниць
  const finalUnit = unit === "л" ? "Л" : unit;
  return `${num} ${finalUnit}`;
}

// Маска: дозволяємо вводити лише цифри + одна крапка/кома + 2 знаки після.
function maskPriceInput(raw: string): string {
  // Дозволяємо лише цифри, кома, крапка
  let s = raw.replace(/[^\d.,]/g, "");
  // Замінюємо кому на крапку (інтер. формат), залишаємо лише першу крапку
  s = s.replace(/,/g, ".");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  // Не більше 2 знаків після крапки
  if (firstDot !== -1) {
    const [intPart, decPart] = s.split(".");
    s = intPart + "." + decPart.slice(0, 2);
  }
  // Видаляємо leading-zero (крім "0." або "0")
  if (/^0\d/.test(s)) {
    s = s.replace(/^0+/, "") || "0";
  }
  return s;
}

// ===================== PriceInput =====================
export const PriceInput: React.FC<{
  value: number;
  onChange: (n: number) => void;
  hasError?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, hasError, ariaLabel, placeholder = "0.00", className }) => {
  // Локальний текстовий стейт — щоб дозволити ввести "12." перед "12.5",
  // інакше Number(value).toString() весь час буде стирати незавершений ввід.
  const [text, setText] = useState<string>(() =>
    value && value > 0 ? String(value) : ""
  );

  // Якщо value змінився ззовні (наприклад, при reset форми) — синхронізуємо
  React.useEffect(() => {
    if (Number(value) !== Number(text.replace(",", "."))) {
      setText(value && value > 0 ? String(value) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const localError =
    text.length > 0 && !isValidPrice(text) ? "Введіть число > 0 (макс. 2 знаки після коми)" : null;

  return (
    <div className={styles.priceWrap}>
      <input
        className={`${styles.input} ${hasError || localError ? styles.inputError : ""} ${className || ""}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={!!(hasError || localError)}
        onChange={(e) => {
          const masked = maskPriceInput(e.target.value);
          setText(masked);
          const n = Number(masked.replace(",", "."));
          onChange(Number.isFinite(n) ? n : 0);
        }}
        onBlur={() => {
          // Тримаємо число "як є" — без авто-round'у щоб не плутати
          // користувача; якщо порожньо — то 0.
          if (!text) onChange(0);
        }}
      />
      <span className={styles.suffix}>₴</span>
      {localError && <div className={styles.localErr}>{localError}</div>}
    </div>
  );
};

// ===================== VolumeSelect =====================
// "Дефолтний обсяг" — dropdown з пресетами + опція "Власне значення"
export const VolumeSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
}> = ({ value, onChange, hasError }) => {
  // Чи входить поточне значення у пресети?
  const isPreset = VOLUME_PRESETS.includes(value);
  const [mode, setMode] = useState<"preset" | "custom">(value && !isPreset ? "custom" : "preset");
  const [customNum, setCustomNum] = useState<string>(() => {
    if (!value || isPreset) return "";
    const m = value.match(VOLUME_VALID_RE);
    return m ? m[1].replace(",", ".") : "";
  });
  const [customUnit, setCustomUnit] = useState<string>(() => {
    const m = value.match(VOLUME_VALID_RE);
    return m ? (m[3].toLowerCase() === "л" ? "Л" : m[3].toLowerCase()) : "Л";
  });

  const options = [
    ...VOLUME_PRESETS.map((p) => ({ value: p, label: p })),
    { value: CUSTOM_VALUE, label: "✎  Власне значення…" },
  ];

  const localValid = mode === "preset" || (Number(customNum.replace(",", ".")) > 0 && customUnit);
  const showCustomErr =
    mode === "custom" && customNum.length > 0 && !(Number(customNum.replace(",", ".")) > 0);

  return (
    <div>
      <BrandSelect
        triggerClassName={`${styles.input} ${hasError || !localValid ? styles.inputError : ""}`}
        value={mode === "custom" ? CUSTOM_VALUE : value}
        onChange={(v) => {
          if (v === CUSTOM_VALUE) {
            setMode("custom");
            // Не змінюємо value одразу — чекаємо ввід
          } else {
            setMode("preset");
            onChange(v);
          }
        }}
        options={options}
        data-testid="admin-product-default-volume"
      />
      {mode === "custom" && (
        <div className={styles.customRow}>
          <input
            className={`${styles.input} ${showCustomErr ? styles.inputError : ""}`}
            type="text"
            inputMode="decimal"
            placeholder="наприклад: 2.5"
            value={customNum}
            onChange={(e) => {
              const masked = e.target.value
                .replace(/[^\d.,]/g, "")
                .replace(/,/g, ".")
                .replace(/(\..*)\./g, "$1");
              setCustomNum(masked);
              const n = Number(masked);
              if (n > 0 && customUnit) {
                onChange(`${masked} ${customUnit}`);
              }
            }}
          />
          <BrandSelect
            triggerClassName={styles.input}
            value={customUnit}
            onChange={(u) => {
              setCustomUnit(u);
              const n = Number(customNum.replace(",", "."));
              if (n > 0) onChange(`${customNum} ${u}`);
            }}
            options={VOLUME_UNITS.map((u) => ({ value: u === "л" ? "Л" : u, label: u === "л" ? "Л" : u }))}
          />
          <button
            type="button"
            className={styles.miniBtn}
            onClick={() => {
              setMode("preset");
              if (!VOLUME_PRESETS.includes(value)) onChange(VOLUME_PRESETS[1]); // "5 Л"
            }}
            title="Повернутись до списку"
          >
            ←
          </button>
        </div>
      )}
      {showCustomErr && (
        <div className={styles.localErr}>Введіть число &gt; 0 для власного обсягу.</div>
      )}
    </div>
  );
};

// ===================== StorageTempSelect =====================
// "Зберігання (температура)" — dropdown з пресетами + опція "Власний діапазон"
const STORAGE_TEMP_PRESETS = [
  "+2°C – +15°C",
  "+5°C – +25°C",
  "+5°C – +30°C",
  "+10°C – +25°C",
  "+15°C – +25°C",
  "+15°C – +30°C",
  "0°C – +10°C",
  "Не вище +25°C",
  "Не вище +30°C",
  "Кімнатна температура",
];
// Парсер вільного формату: "+2°C – +15°C", "15-25°C", "+5 — 25", "+15 — +30 °C"
const TEMP_RANGE_RE = /([+\-]?\d+)\s*°?\s*C?\s*[—–\-]\s*([+\-]?\d+)\s*°?\s*C?/i;
export const StorageTempSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
}> = ({ value, onChange, hasError }) => {
  const isPreset = STORAGE_TEMP_PRESETS.includes(value);
  const [mode, setMode] = useState<"preset" | "custom">(value && !isPreset ? "custom" : "preset");
  const parseRange = (raw: string): { from: string; to: string } => {
    const m = (raw || "").match(TEMP_RANGE_RE);
    if (m) return { from: String(parseInt(m[1], 10)), to: String(parseInt(m[2], 10)) };
    return { from: "", to: "" };
  };
  const initial = parseRange(value || "");
  const [tFrom, setTFrom] = useState<string>(initial.from);
  const [tTo, setTTo] = useState<string>(initial.to);

  // Sync local state when value changes externally (e.g. after load)
  React.useEffect(() => {
    const next = parseRange(value || "");
    setTFrom(next.from);
    setTTo(next.to);
    if (value && !STORAGE_TEMP_PRESETS.includes(value)) setMode("custom");
    else if (STORAGE_TEMP_PRESETS.includes(value)) setMode("preset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const options = [
    ...STORAGE_TEMP_PRESETS.map((p) => ({ value: p, label: p })),
    { value: CUSTOM_VALUE, label: "✎  Власний діапазон…" },
  ];

  const emitCustom = (from: string, to: string) => {
    const f = from.trim();
    const t = to.trim();
    if (f && t) {
      const fNum = Number(f);
      const tNum = Number(t);
      if (Number.isFinite(fNum) && Number.isFinite(tNum)) {
        const fStr = fNum > 0 ? `+${fNum}` : `${fNum}`;
        const tStr = tNum > 0 ? `+${tNum}` : `${tNum}`;
        onChange(`${fStr}°C – ${tStr}°C`);
      }
    } else if (f && !t) {
      const fNum = Number(f);
      if (Number.isFinite(fNum)) {
        const fStr = fNum > 0 ? `+${fNum}` : `${fNum}`;
        onChange(`Не вище ${fStr}°C`);
      }
    }
  };

  return (
    <div>
      <BrandSelect
        triggerClassName={`${styles.input} ${hasError ? styles.inputError : ""}`}
        value={mode === "custom" ? CUSTOM_VALUE : (isPreset ? value : STORAGE_TEMP_PRESETS[1])}
        onChange={(v) => {
          if (v === CUSTOM_VALUE) {
            setMode("custom");
          } else {
            setMode("preset");
            onChange(v);
          }
        }}
        options={options}
        data-testid="admin-product-storage-temp"
      />
      {mode === "custom" && (
        <div className={styles.customRow}>
          <input
            className={styles.input}
            type="text"
            inputMode="numeric"
            placeholder="від, °C"
            value={tFrom}
            onChange={(e) => {
              const masked = e.target.value.replace(/[^\d\-]/g, "");
              setTFrom(masked);
              emitCustom(masked, tTo);
            }}
            style={{ maxWidth: 110 }}
          />
          <span style={{ alignSelf: "center", color: "#6b6b66" }}>—</span>
          <input
            className={styles.input}
            type="text"
            inputMode="numeric"
            placeholder="до, °C"
            value={tTo}
            onChange={(e) => {
              const masked = e.target.value.replace(/[^\d\-]/g, "");
              setTTo(masked);
              emitCustom(tFrom, masked);
            }}
            style={{ maxWidth: 110 }}
          />
          <button
            type="button"
            className={styles.miniBtn}
            onClick={() => {
              setMode("preset");
              if (!STORAGE_TEMP_PRESETS.includes(value)) onChange(STORAGE_TEMP_PRESETS[1]);
            }}
            title="Повернутись до списку"
          >
            ←
          </button>
        </div>
      )}
    </div>
  );
};

// ===================== StoragePeriodSelect =====================
// "Період зберігання" — dropdown пресетів + опція "Власне"
const STORAGE_PERIOD_PRESETS = [
  "6 місяців",
  "9 місяців",
  "12 місяців",
  "18 місяців",
  "1 рік",
  "2 роки",
  "3 роки",
  "4 роки",
  "5 років",
];
const PERIOD_UNITS = [
  { value: "днів", label: "днів" },
  { value: "тижнів", label: "тижнів" },
  { value: "місяців", label: "місяців" },
  { value: "рік", label: "рік" },
  { value: "роки", label: "роки" },
  { value: "років", label: "років" },
];
export const StoragePeriodSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
}> = ({ value, onChange, hasError }) => {
  const isPreset = STORAGE_PERIOD_PRESETS.includes(value);
  const [mode, setMode] = useState<"preset" | "custom">(value && !isPreset ? "custom" : "preset");
  // For custom mode: parse "<number> <unit>"
  const parseCustom = (raw: string) => {
    const m = (raw || "").trim().match(/^(\d+)\s+(.+)$/);
    if (m) return { n: m[1], u: m[2] };
    return { n: "", u: "місяців" };
  };
  const initial = parseCustom(value);
  const [pNum, setPNum] = useState<string>(initial.n);
  const [pUnit, setPUnit] = useState<string>(initial.u);

  // Sync local state when value changes externally
  React.useEffect(() => {
    const next = parseCustom(value);
    setPNum(next.n);
    setPUnit(next.u);
    if (value && !STORAGE_PERIOD_PRESETS.includes(value)) setMode("custom");
    else if (STORAGE_PERIOD_PRESETS.includes(value)) setMode("preset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const options = [
    ...STORAGE_PERIOD_PRESETS.map((p) => ({ value: p, label: p })),
    { value: CUSTOM_VALUE, label: "✎  Власне значення…" },
  ];

  const emitCustom = (n: string, u: string) => {
    const num = Number(n);
    if (Number.isFinite(num) && num > 0 && u) {
      onChange(`${num} ${u}`);
    }
  };

  return (
    <div>
      <BrandSelect
        triggerClassName={`${styles.input} ${hasError ? styles.inputError : ""}`}
        value={mode === "custom" ? CUSTOM_VALUE : (isPreset ? value : STORAGE_PERIOD_PRESETS[5])}
        onChange={(v) => {
          if (v === CUSTOM_VALUE) {
            setMode("custom");
          } else {
            setMode("preset");
            onChange(v);
          }
        }}
        options={options}
        data-testid="admin-product-storage-period"
      />
      {mode === "custom" && (
        <div className={styles.customRow}>
          <input
            className={styles.input}
            type="text"
            inputMode="numeric"
            placeholder="напр. 18"
            value={pNum}
            onChange={(e) => {
              const masked = e.target.value.replace(/[^\d]/g, "");
              setPNum(masked);
              emitCustom(masked, pUnit);
            }}
            style={{ maxWidth: 140 }}
          />
          <BrandSelect
            triggerClassName={styles.input}
            value={pUnit}
            onChange={(u) => {
              setPUnit(u);
              emitCustom(pNum, u);
            }}
            options={PERIOD_UNITS}
          />
          <button
            type="button"
            className={styles.miniBtn}
            onClick={() => {
              setMode("preset");
              if (!STORAGE_PERIOD_PRESETS.includes(value)) onChange(STORAGE_PERIOD_PRESETS[5]);
            }}
            title="Повернутись до списку"
          >
            ←
          </button>
        </div>
      )}
    </div>
  );
};

// ===================== PackingChips =====================
// "Тара (1, 5, 10 л)" — chip-input з валідацією формату.
export const PackingChips: React.FC<{
  value: string; // зберігаємо як CSV-рядок (сумісність зі схемою) "1 Л, 5 Л, 10 Л"
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  const items = useMemo(
    () => (value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    [value]
  );
  const [draft, setDraft] = useState<string>("");
  const [draftError, setDraftError] = useState<string | null>(null);

  const commitDraft = () => {
    const raw = draft.trim();
    if (!raw) return;
    if (!isValidVolume(raw)) {
      setDraftError("Формат: число + одиниця, напр. '1 Л', '5 кг', '500 мл'");
      return;
    }
    const normalized = normalizeVolume(raw);
    if (items.includes(normalized)) {
      setDraftError(`«${normalized}» вже додано`);
      return;
    }
    onChange([...items, normalized].join(", "));
    setDraft("");
    setDraftError(null);
  };

  return (
    <div>
      <div className={styles.chipsBox}>
        {items.map((it) => (
          <span key={it} className={styles.chip}>
            {it}
            <button
              type="button"
              className={styles.chipX}
              onClick={() =>
                onChange(items.filter((x) => x !== it).join(", "))
              }
              aria-label={`Видалити ${it}`}
              title="Видалити"
            >
              ×
            </button>
          </span>
        ))}
        <div className={styles.chipInputRow}>
          <input
            className={`${styles.chipInput} ${draftError ? styles.inputError : ""}`}
            value={draft}
            placeholder={items.length ? "" : "наприклад: 1 Л"}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Backspace" && !draft && items.length) {
                onChange(items.slice(0, -1).join(", "));
              }
            }}
            onBlur={() => {
              if (draft.trim()) commitDraft();
            }}
            aria-label="Додати елемент тари"
          />
          {draft && (
            <button type="button" className={styles.miniBtn} onClick={commitDraft}>
              +
            </button>
          )}
        </div>
      </div>
      {draftError && (
        <div className={styles.localErr} role="alert" data-testid="packing-chip-error">
          ⚠️ {draftError}
        </div>
      )}
      <div className={styles.hint}>
        Введіть значення (напр. <code>1 Л</code>, <code>5 кг</code>) і натисніть <kbd>Enter</kbd> або кому,
        щоб додати тег. Backspace видаляє останній.
      </div>

      {/* Швидке додавання пресетів */}
      <div className={styles.presets}>
        {VOLUME_PRESETS.map((p) => (
          <button
            type="button"
            key={p}
            className={styles.presetBtn}
            disabled={items.includes(p)}
            onClick={() => {
              if (!items.includes(p)) onChange([...items, p].join(", "));
            }}
          >
            + {p}
          </button>
        ))}
      </div>
    </div>
  );
};

// ===================== VariantVolumeInput =====================
// Інпут об'єму для варіанту ціни — комбо з пресетами через datalist + валідація
export const VariantVolumeInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  index: number;
}> = ({ value, onChange, index }) => {
  const listId = `variant-volumes-${index}`;
  const error = value && !isValidVolume(value) ? "Невірний формат" : null;
  return (
    <div className={styles.variantVolWrap}>
      <input
        className={`${styles.input} ${error ? styles.inputError : ""}`}
        list={listId}
        placeholder="напр. 5 Л"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && isValidVolume(v)) onChange(normalizeVolume(v));
        }}
      />
      <datalist id={listId}>
        {VOLUME_PRESETS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {error && <div className={styles.localErrInline}>{error}</div>}
    </div>
  );
};

// ===================== VariantPriceInput =====================
export const VariantPriceInput: React.FC<{
  value: number;
  onChange: (n: number) => void;
}> = ({ value, onChange }) => {
  const [text, setText] = useState<string>(() => (value > 0 ? String(value) : ""));
  React.useEffect(() => {
    if (Number(value) !== Number(text.replace(",", "."))) {
      setText(value > 0 ? String(value) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const localError = text.length > 0 && !isValidPrice(text);
  return (
    <div className={styles.variantPriceWrap}>
      <input
        className={`${styles.input} ${localError ? styles.inputError : ""}`}
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        value={text}
        onChange={(e) => {
          const m = maskPriceInput(e.target.value);
          setText(m);
          const n = Number(m.replace(",", "."));
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
      <span className={styles.suffixInline}>₴</span>
    </div>
  );
};
