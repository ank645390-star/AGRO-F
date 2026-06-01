import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listCulturesAdmin,
  createCulture,
  patchCulture,
  deleteCulture,
  reorderCultures,
  uploadCultureImage,
  getCultureSuggestions,
  type Culture,
  type CategoryOption,
  type CultureSuggestions,
} from "../../lib/cultures-api";
import styles from "./AdminCultures.module.css";

/* =====================================================================
   Admin Cultures — Сучасна логіка керування секцією «Знайдіть рішення…»
   ---------------------------------------------------------------------
   Ключові поліпшення UX:
     1) Завантаження картинки — drag&drop із комп'ютера (а не URL).
     2) Типи препаратів / Ефективно для — chip-input з autocomplete
        на базі вже існуючих значень + вільне додавання нових.
     3) Посилання на каталог — smart picker: dropdown категорій з
        product_categories + опція "Весь каталог" + ручний URL.
     4) Slug — авто-генерація з назви; ручне редагування за бажанням.
     5) Alt-текст — авто-підстановка з назви культури, якщо порожній.
   ===================================================================== */

// ---- Кирилична транслітерація → латинський slug (UA) ----
const TRANSLIT_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e",
  є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", " ": "-", _: "-",
};
const slugify = (raw: string): string => {
  const lower = (raw || "").trim().toLowerCase();
  let out = "";
  for (const ch of lower) out += TRANSLIT_MAP[ch] ?? ch;
  out = out.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return out;
};

type DraftCulture = {
  title: string;
  slug: string;
  slugTouched: boolean;       // ручне редагування slug — припиняємо авто-перегенерацію
  problem_text: string;
  treatment_types: string[];  // тепер масив
  effective_for: string[];    // тепер масив
  image_url: string;
  image_alt: string;
  altTouched: boolean;
  catalog_url: string;
  button_label: string;
  is_active: boolean;
  is_default_open: boolean;
};

const emptyDraft: DraftCulture = {
  title: "",
  slug: "",
  slugTouched: false,
  problem_text: "",
  treatment_types: [],
  effective_for: [],
  image_url: "",
  image_alt: "",
  altTouched: false,
  catalog_url: "/catalog",
  button_label: "Переглянути лінійку",
  is_active: true,
  is_default_open: false,
};

const toDraft = (c: Culture): DraftCulture => ({
  title: c.title,
  slug: c.slug,
  slugTouched: true, // existing slug — не перегенеровувати
  problem_text: c.problem_text,
  treatment_types: c.treatment_types || [],
  effective_for: c.effective_for || [],
  image_url: c.image_url || "",
  image_alt: c.image_alt || "",
  altTouched: !!(c.image_alt && c.image_alt !== c.title),
  catalog_url: c.catalog_url || "/catalog",
  button_label: c.button_label || "Переглянути лінійку",
  is_active: c.is_active,
  is_default_open: c.is_default_open,
});

/* =====================================================================
   ChipInput — tag-input з chips + autocomplete із suggestions
   ===================================================================== */
type ChipInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  testid?: string;
};
const ChipInput: React.FC<ChipInputProps> = ({ value, onChange, suggestions, placeholder, testid }) => {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    const taken = new Set(value.map((v) => v.toLowerCase()));
    return suggestions
      .filter((s) => !taken.has(s.toLowerCase()))
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 8);
  }, [input, suggestions, value]);

  const addTag = (raw: string) => {
    const v = raw.trim().replace(/,/g, "");
    if (!v) return;
    const exists = value.some((x) => x.toLowerCase() === v.toLowerCase());
    if (!exists) onChange([...value, v]);
    setInput("");
    setHoverIdx(-1);
  };
  const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," ) {
      e.preventDefault();
      if (hoverIdx >= 0 && filtered[hoverIdx]) addTag(filtered[hoverIdx]);
      else if (input.trim()) addTag(input);
    } else if (e.key === "Backspace" && !input && value.length) {
      removeAt(value.length - 1);
    } else if (e.key === "ArrowDown" && filtered.length) {
      e.preventDefault();
      setHoverIdx((i) => Math.min(i + 1, filtered.length - 1));
      setOpen(true);
    } else if (e.key === "ArrowUp" && filtered.length) {
      e.preventDefault();
      setHoverIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    const close = (ev: MouseEvent) => {
      if (!boxRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className={styles.chipWrap} ref={boxRef} data-testid={testid}>
      <div className={styles.chipBox} onClick={() => setOpen(true)}>
        {value.map((tag, i) => (
          <span key={`${tag}-${i}`} className={styles.chip}>
            {tag}
            <button
              type="button"
              className={styles.chipX}
              onClick={(e) => { e.stopPropagation(); removeAt(i); }}
              aria-label={`Видалити ${tag}`}
            >×</button>
          </span>
        ))}
        <input
          className={styles.chipInput}
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); setHoverIdx(-1); }}
          onKeyDown={onKey}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // тримаємо невеликий defer щоб клік по suggestion встиг спрацювати
            setTimeout(() => {
              if (input.trim()) addTag(input);
            }, 120);
          }}
          placeholder={value.length === 0 ? (placeholder || "Додайте теги…") : ""}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className={styles.dropdown}>
          {filtered.map((s, i) => (
            <button
              type="button"
              key={s}
              className={`${styles.dropdownItem} ${i === hoverIdx ? styles.dropdownItemActive : ""}`}
              onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
              onMouseEnter={() => setHoverIdx(i)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className={styles.helperRow}>
        <span className={styles.helperHint}>Enter або кома — додати тег · Backspace — видалити останній</span>
      </div>
    </div>
  );
};

/* =====================================================================
   ImageUploader — drag&drop + клік для вибору + URL fallback (advanced)
   ===================================================================== */
type ImageUploaderProps = {
  value: string;
  onChange: (url: string) => void;
  alt: string;
  testid?: string;
};
const ImageUploader: React.FC<ImageUploaderProps> = ({ value, onChange, alt, testid }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showUrlField, setShowUrlField] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  const doUpload = useCallback(async (file: File) => {
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("Можна завантажити лише зображення (JPG, PNG, WEBP, GIF, SVG).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErr("Файл більший за 10МБ. Стисніть зображення та спробуйте знову.");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadCultureImage(file);
      onChange(res.url);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Не вдалося завантажити файл");
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) doUpload(f);
    e.target.value = "";
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) doUpload(f);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) { doUpload(f); e.preventDefault(); break; }
      }
    }
  };

  return (
    <div className={styles.uploaderShell} data-testid={testid}>
      {value ? (
        <div className={styles.previewCard}>
          <img loading="lazy" decoding="async" src={value} alt={alt || "preview"} className={styles.previewLarge} />
          <div className={styles.previewBody}>
            <div className={styles.previewUrl} title={value}>{value}</div>
            <div className={styles.previewActions}>
              <button type="button" className={styles.linkBtn} onClick={() => fileInputRef.current?.click()}>
                Замінити фото
              </button>
              <button type="button" className={`${styles.linkBtn} ${styles.linkBtnDanger}`} onClick={() => onChange("")}>
                Видалити
              </button>
              <button type="button" className={styles.linkBtn} onClick={() => setShowUrlField((v) => !v)}>
                {showUrlField ? "Сховати URL" : "Вставити URL вручну"}
              </button>
            </div>
            {showUrlField && (
              <div className={styles.urlRow}>
                <input
                  className={styles.input}
                  value={urlDraft || value}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://… або /local-path.png"
                />
                <button
                  type="button"
                  className={styles.actBtnPrimary}
                  onClick={() => { if (urlDraft.trim()) onChange(urlDraft.trim()); setShowUrlField(false); setUrlDraft(""); }}
                >Застосувати</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          onPaste={onPaste}
          tabIndex={0}
          role="button"
          aria-label="Завантажити зображення"
        >
          {uploading ? (
            <div className={styles.dzCenter}>
              <div className={styles.spinner} />
              <div className={styles.dzLine}>Завантаження…</div>
            </div>
          ) : (
            <div className={styles.dzCenter}>
              <svg className={styles.dzIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div className={styles.dzTitle}>Перетягніть фото сюди</div>
              <div className={styles.dzSub}>або натисніть, щоб вибрати файл з комп'ютера</div>
              <div className={styles.dzHint}>JPG · PNG · WEBP · GIF · SVG · до 10 МБ</div>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={(e) => { e.stopPropagation(); setShowUrlField((v) => !v); }}
              >
                {showUrlField ? "Сховати поле URL" : "Або вставте URL вручну"}
              </button>
              {showUrlField && (
                <div className={styles.urlRow} onClick={(e) => e.stopPropagation()}>
                  <input
                    className={styles.input}
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder="https://… або /local-path.png"
                  />
                  <button
                    type="button"
                    className={styles.actBtnPrimary}
                    onClick={(e) => { e.stopPropagation(); if (urlDraft.trim()) onChange(urlDraft.trim()); setShowUrlField(false); setUrlDraft(""); }}
                  >Застосувати</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        onChange={onSelectFile}
        style={{ display: "none" }}
      />
      {err && <div className={styles.errorInline}>{err}</div>}
    </div>
  );
};

/* =====================================================================
   CatalogLinkPicker — пікер посилання на каталог
   ===================================================================== */
type CatalogLinkPickerProps = {
  value: string;
  onChange: (next: string) => void;
  categories: CategoryOption[];
  testid?: string;
};

const parseCatalogValue = (value: string): { mode: "all" | "category" | "custom"; categorySlug: string; raw: string } => {
  const v = (value || "").trim();
  if (!v || v === "/catalog" || v === "/catalog/") {
    return { mode: "all", categorySlug: "", raw: v };
  }
  const m = v.match(/^\/catalog\?category=([a-z0-9-]+)$/i);
  if (m) return { mode: "category", categorySlug: m[1], raw: v };
  return { mode: "custom", categorySlug: "", raw: v };
};

const CatalogLinkPicker: React.FC<CatalogLinkPickerProps> = ({ value, onChange, categories, testid }) => {
  const parsed = parseCatalogValue(value);
  const [mode, setMode] = useState<"all" | "category" | "custom">(parsed.mode);
  const [catSlug, setCatSlug] = useState<string>(parsed.categorySlug);
  const [custom, setCustom] = useState<string>(parsed.mode === "custom" ? parsed.raw : "");

  // sync external value → internal
  useEffect(() => {
    const p = parseCatalogValue(value);
    setMode(p.mode);
    setCatSlug(p.categorySlug);
    if (p.mode === "custom") setCustom(p.raw);
  }, [value]);

  const setModeAndPropagate = (nextMode: "all" | "category" | "custom") => {
    setMode(nextMode);
    if (nextMode === "all") onChange("/catalog");
    else if (nextMode === "category") {
      const slug = catSlug || categories[0]?.slug || "";
      setCatSlug(slug);
      onChange(slug ? `/catalog?category=${slug}` : "/catalog");
    } else {
      onChange(custom || "/catalog");
    }
  };

  const setCategoryAndPropagate = (slug: string) => {
    setCatSlug(slug);
    onChange(slug ? `/catalog?category=${slug}` : "/catalog");
  };

  return (
    <div className={styles.catalogPicker} data-testid={testid}>
      <div className={styles.segmented}>
        <button
          type="button"
          className={`${styles.segBtn} ${mode === "all" ? styles.segBtnActive : ""}`}
          onClick={() => setModeAndPropagate("all")}
        >Весь каталог</button>
        <button
          type="button"
          className={`${styles.segBtn} ${mode === "category" ? styles.segBtnActive : ""}`}
          onClick={() => setModeAndPropagate("category")}
        >Категорія</button>
        <button
          type="button"
          className={`${styles.segBtn} ${mode === "custom" ? styles.segBtnActive : ""}`}
          onClick={() => setModeAndPropagate("custom")}
        >Власний URL</button>
      </div>

      {mode === "category" && (
        <div className={styles.categoryGrid}>
          {categories.length === 0 ? (
            <div className={styles.catEmpty}>
              У каталозі ще немає категорій. Додайте їх у розділі «Категорії товарів».
            </div>
          ) : (
            categories.map((c) => (
              <button
                type="button"
                key={c.slug}
                className={`${styles.catChip} ${catSlug === c.slug ? styles.catChipActive : ""}`}
                onClick={() => setCategoryAndPropagate(c.slug)}
                title={`/catalog?category=${c.slug}`}
              >
                <span className={styles.catChipLabel}>{c.label}</span>
                <span className={styles.catChipSlug}>{c.slug}</span>
              </button>
            ))
          )}
        </div>
      )}

      {mode === "custom" && (
        <input
          className={styles.input}
          value={custom}
          onChange={(e) => { setCustom(e.target.value); onChange(e.target.value); }}
          placeholder="/catalog?category=… або /custom-page"
        />
      )}

      <div className={styles.previewLink}>
        Підсумкове посилання: <code className={styles.code}>{value || "/catalog"}</code>
      </div>
    </div>
  );
};

/* =====================================================================
   Main component
   ===================================================================== */
const AdminCultures: React.FC = () => {
  const [items, setItems] = useState<Culture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // create form
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DraftCulture>(emptyDraft);

  // editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftCulture>(emptyDraft);

  // suggestions
  const [sugg, setSugg] = useState<CultureSuggestions>({
    categories: [], treatment_types: [], effective_for: [],
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, s] = await Promise.all([
        listCulturesAdmin(),
        getCultureSuggestions().catch(() => ({ categories: [], treatment_types: [], effective_for: [] })),
      ]);
      setItems(data);
      setSugg(s);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Не вдалося завантажити культури");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (c: Culture) => {
    setEditingId(c.id);
    setEditDraft(toDraft(c));
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyDraft);
  };

  const handleCreate = async () => {
    if (!draft.title.trim()) {
      setError("Назва обов'язкова");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createCulture({
        title: draft.title.trim(),
        slug: draft.slug.trim() || undefined,
        problem_text: draft.problem_text,
        treatment_types: draft.treatment_types,
        effective_for: draft.effective_for,
        image_url: draft.image_url.trim(),
        image_alt: (draft.image_alt.trim() || draft.title.trim()),
        catalog_url: draft.catalog_url.trim() || "/catalog",
        button_label: draft.button_label.trim() || "Переглянути лінійку",
        is_active: draft.is_active,
        is_default_open: draft.is_default_open,
      });
      setDraft(emptyDraft);
      setCreating(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Помилка створення");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    if (!editDraft.title.trim()) {
      setError("Назва обов'язкова");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchCulture(editingId, {
        title: editDraft.title.trim(),
        slug: editDraft.slug.trim() || undefined,
        problem_text: editDraft.problem_text,
        treatment_types: editDraft.treatment_types,
        effective_for: editDraft.effective_for,
        image_url: editDraft.image_url.trim(),
        image_alt: (editDraft.image_alt.trim() || editDraft.title.trim()),
        catalog_url: editDraft.catalog_url.trim() || "/catalog",
        button_label: editDraft.button_label.trim() || "Переглянути лінійку",
        is_active: editDraft.is_active,
        is_default_open: editDraft.is_default_open,
      });
      cancelEdit();
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Помилка збереження");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Видалити культуру «${title}»? Цю дію неможливо скасувати.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCulture(id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Помилка видалення");
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const arr = [...items];
    const j = index + direction;
    if (j < 0 || j >= arr.length) return;
    [arr[index], arr[j]] = [arr[j], arr[index]];
    setItems(arr);
    setBusy(true);
    try {
      await reorderCultures(arr.map((it) => it.id));
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Помилка зміни порядку");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const activeCount = useMemo(
    () => items.filter((i) => i.is_active).length,
    [items]
  );

  // Smart title onChange: auto-update slug + alt if not manually edited
  const onTitleChange = (d: DraftCulture, setD: (v: DraftCulture) => void, nextTitle: string) => {
    setD({
      ...d,
      title: nextTitle,
      slug: d.slugTouched ? d.slug : slugify(nextTitle),
      image_alt: d.altTouched ? d.image_alt : nextTitle,
    });
  };

  // ===== Form fragment =====
  const renderForm = (
    d: DraftCulture,
    setD: (v: DraftCulture) => void,
    onSave: () => void,
    onCancel: () => void,
    saveLabel: string,
    testid: string
  ) => (
    <div className={styles.editForm}>
      <div className={styles.grid2}>
        <label className={styles.label}>
          <span className={styles.labelText}>Назва культури <span className={styles.req}>*</span></span>
          <input
            className={styles.input}
            value={d.title}
            onChange={(e) => onTitleChange(d, setD, e.target.value)}
            placeholder="Польові культури"
            autoFocus
            data-testid={`${testid}-title`}
          />
        </label>
        <label className={styles.label}>
          <span className={styles.labelText}>
            Slug (URL-ідентифікатор)
            {!d.slugTouched && d.title && (
              <span className={styles.autoBadge}>авто</span>
            )}
          </span>
          <div className={styles.slugRow}>
            <input
              className={styles.input}
              value={d.slug}
              onChange={(e) => setD({ ...d, slug: e.target.value, slugTouched: true })}
              placeholder="polovi (генерується з назви)"
              data-testid={`${testid}-slug`}
            />
            {d.slugTouched && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => setD({ ...d, slug: slugify(d.title), slugTouched: false })}
                title="Згенерувати наново з назви"
              >Скинути</button>
            )}
          </div>
        </label>
      </div>

      <label className={styles.label}>
        <span className={styles.labelText}>Опис проблеми / лід-абзац</span>
        <textarea
          className={styles.textarea}
          rows={4}
          value={d.problem_text}
          onChange={(e) => setD({ ...d, problem_text: e.target.value })}
          placeholder="Совка на соняшнику, фузаріоз пшениці..."
          data-testid={`${testid}-problem`}
        />
      </label>

      <div className={styles.grid2}>
        <div className={styles.label}>
          <span className={styles.labelText}>Типи препаратів</span>
          <ChipInput
            value={d.treatment_types}
            onChange={(next) => setD({ ...d, treatment_types: next })}
            suggestions={sugg.treatment_types}
            placeholder="інокулянти, фунгіциди…"
            testid={`${testid}-types`}
          />
        </div>
        <div className={styles.label}>
          <span className={styles.labelText}>Ефективно для (культур)</span>
          <ChipInput
            value={d.effective_for}
            onChange={(next) => setD({ ...d, effective_for: next })}
            suggestions={sugg.effective_for}
            placeholder="Соняшник, Пшениця…"
            testid={`${testid}-effective`}
          />
        </div>
      </div>

      <div className={styles.label}>
        <span className={styles.labelText}>Зображення культури</span>
        <ImageUploader
          value={d.image_url}
          onChange={(url) => setD({ ...d, image_url: url })}
          alt={d.image_alt || d.title}
          testid={`${testid}-image`}
        />
      </div>

      <div className={styles.grid2}>
        <label className={styles.label}>
          <span className={styles.labelText}>
            Alt-текст картинки
            {!d.altTouched && d.title && (
              <span className={styles.autoBadge}>авто</span>
            )}
          </span>
          <input
            className={styles.input}
            value={d.image_alt}
            onChange={(e) => setD({ ...d, image_alt: e.target.value, altTouched: true })}
            placeholder="Поле з пшеницею"
            data-testid={`${testid}-image-alt`}
          />
        </label>
        <label className={styles.label}>
          <span className={styles.labelText}>Текст кнопки</span>
          <input
            className={styles.input}
            value={d.button_label}
            onChange={(e) => setD({ ...d, button_label: e.target.value })}
            placeholder="Переглянути лінійку"
            data-testid={`${testid}-btn-label`}
          />
        </label>
      </div>

      <div className={styles.label}>
        <span className={styles.labelText}>Посилання на каталог</span>
        <CatalogLinkPicker
          value={d.catalog_url}
          onChange={(url) => setD({ ...d, catalog_url: url })}
          categories={sugg.categories}
          testid={`${testid}-catalog`}
        />
      </div>

      <div className={styles.toggles}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={d.is_active}
            onChange={(e) => setD({ ...d, is_active: e.target.checked })}
            data-testid={`${testid}-active`}
          />
          <span>Активна (показувати на сайті)</span>
        </label>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={d.is_default_open}
            onChange={(e) => setD({ ...d, is_default_open: e.target.checked })}
            data-testid={`${testid}-default-open`}
          />
          <span>Відкрита за замовчуванням (тільки одна)</span>
        </label>
      </div>

      <div className={styles.formRow}>
        <button type="button" className={styles.actBtn} onClick={onCancel} disabled={busy}>
          Скасувати
        </button>
        <button
          type="button"
          className={styles.actBtnPrimary}
          onClick={onSave}
          disabled={busy}
          data-testid={`${testid}-save`}
        >
          {busy ? "Зберігаємо…" : saveLabel}
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.shell} data-testid="admin-cultures-page">
      <div className={styles.toolbar}>
        <p className={styles.title}>
          Всього культур: <strong>{items.length}</strong>{" "}
          <span className={styles.dim}>· активних: {activeCount}</span>
        </p>
        {!creating && (
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => {
              setDraft(emptyDraft);
              setCreating(true);
              setEditingId(null);
            }}
            disabled={busy}
            data-testid="admin-cultures-add"
          >
            + Додати культуру
          </button>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {creating && (
        <div className={styles.item}>
          <div className={styles.itemHead}>
            <span className={styles.itemOrder}>Нова культура</span>
          </div>
          {renderForm(
            draft,
            setDraft,
            handleCreate,
            () => {
              setCreating(false);
              setDraft(emptyDraft);
              setError(null);
            },
            "Створити",
            "admin-cultures-new"
          )}
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Завантаження…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          Поки немає жодної культури. Натисніть «Додати культуру».
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((c, i) => (
            <div
              className={`${styles.item} ${!c.is_active ? styles.itemInactive : ""}`}
              key={c.id}
              data-testid={`admin-cultures-item-${i}`}
            >
              <div className={styles.itemHead}>
                <div className={styles.itemHeadLeft}>
                  <span className={styles.itemOrder}>#{i + 1}</span>
                  <span className={styles.itemBadge}>
                    {c.is_active ? "активна" : "прихована"}
                  </span>
                  {c.is_default_open && (
                    <span className={styles.itemBadgeOpen}>
                      відкрита за замовч.
                    </span>
                  )}
                </div>
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className={styles.actBtn}
                    onClick={() => move(i, -1)}
                    disabled={busy || i === 0}
                    title="Підняти вище"
                  >↑</button>
                  <button
                    type="button"
                    className={styles.actBtn}
                    onClick={() => move(i, 1)}
                    disabled={busy || i === items.length - 1}
                    title="Опустити нижче"
                  >↓</button>
                  {editingId === c.id ? (
                    <button
                      type="button"
                      className={styles.actBtn}
                      onClick={cancelEdit}
                      disabled={busy}
                    >Закрити</button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.actBtn}
                        onClick={() => startEdit(c)}
                        disabled={busy}
                        data-testid={`admin-cultures-edit-${i}`}
                      >Редагувати</button>
                      <button
                        type="button"
                        className={`${styles.actBtn} ${styles.actBtnDanger}`}
                        onClick={() => handleDelete(c.id, c.title)}
                        disabled={busy}
                        data-testid={`admin-cultures-delete-${i}`}
                      >Видалити</button>
                    </>
                  )}
                </div>
              </div>

              {editingId === c.id ? (
                renderForm(
                  editDraft,
                  setEditDraft,
                  handleSaveEdit,
                  cancelEdit,
                  "Зберегти",
                  `admin-cultures-edit-${i}`
                )
              ) : (
                <div className={styles.summary}>
                  <div className={styles.summaryHead}>
                    <h3 className={styles.summaryTitle}>{c.title}</h3>
                    <span className={styles.slug}>/{c.slug}</span>
                  </div>
                  {c.problem_text && (
                    <p className={styles.summaryText}>{c.problem_text}</p>
                  )}
                  <div className={styles.metaRow}>
                    <div>
                      <span className={styles.metaLabel}>Типи:</span>{" "}
                      {c.treatment_types.length > 0
                        ? c.treatment_types.join(", ")
                        : <em className={styles.dim}>—</em>}
                    </div>
                    <div>
                      <span className={styles.metaLabel}>Для культур:</span>{" "}
                      {c.effective_for.length > 0
                        ? c.effective_for.join(", ")
                        : <em className={styles.dim}>—</em>}
                    </div>
                    <div>
                      <span className={styles.metaLabel}>Каталог:</span>{" "}
                      <code className={styles.code}>{c.catalog_url}</code>
                    </div>
                  </div>
                  {c.image_url && (
                    <div className={styles.thumbWrap}>
                      <img loading="lazy" decoding="async"
                        src={c.image_url}
                        alt={c.image_alt || c.title}
                        className={styles.thumb}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminCultures;
