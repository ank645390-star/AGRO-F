import React, { useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import CharacterCount from "@tiptap/extension-character-count";
import styles from "./ProductRichEditor.module.css";

/* =====================================================================
   ProductRichEditor — компактний WYSIWYG редактор для опис-полів картки
   товару (problem.intro_html, solution.intro_html, etc).

   Особливості:
     • Тулбар: B, I, U, акцент-колір (lime/forest), посилання, маркований
       список, очистити форматування, undo/redo.
     • Soft-limit на кількість символів — лічильник червоніє при
       перевищенні, але вводити далі можна (HARD блокування зрозумілий
       контекст-залежно — обмежимо ефект на верстку через CSS max-height
       у самому компоненті <Desktop1 descCard>).
     • Min-height ~140px, max-height ~280px (інакше editor розпухає).
     • Контент серіалізується як HTML (id для збереження сумісності з
       existing dangerouslySetInnerHTML на product page).
   ===================================================================== */

export type ProductRichEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Рекомендована к-ть символів. Перевищення підсвічує лічильник. */
  maxChars?: number;
  /** Жорсткий ліміт. Якщо передано — TipTap не дозволить вводити більше. */
  hardLimit?: number;
  minHeight?: number;
  maxHeight?: number;
};

const ACCENT_COLORS = [
  { value: "", label: "Без кольору" },
  { value: "#b3d217", label: "Лайм (акцент)" },
  { value: "#1b4332", label: "Темно-зелений" },
  { value: "#6b8e0d", label: "Оливковий" },
  { value: "#d97706", label: "Бурштиновий" },
  { value: "#dc2626", label: "Червоний" },
];

const ProductRichEditor: React.FC<ProductRichEditorProps> = ({
  value,
  onChange,
  placeholder = "Почніть писати…",
  maxChars,
  hardLimit,
  minHeight = 140,
  maxHeight = 280,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // no headings inside short description blocks
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: hardLimit ?? null }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: styles.editorContent,
        style: `min-height:${minHeight}px;max-height:${maxHeight}px;`,
      },
    },
  });

  // Sync editor when external `value` changes (e.g. loading from API)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("Посилання URL:", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const setColor = useCallback(
    (color: string) => {
      if (!editor) return;
      if (!color) editor.chain().focus().unsetColor().run();
      else editor.chain().focus().setColor(color).run();
    },
    [editor]
  );

  if (!editor) return null;

  /* Safe character count read (TipTap throws if view is mid-mount in StrictMode) */
  let charCount = 0;
  try {
    charCount = editor.storage.characterCount?.characters?.() ?? 0;
  } catch {
    charCount = 0;
  }
  const overLimit = !!(maxChars && charCount > maxChars);
  const warnLimit = !!(maxChars && !overLimit && charCount >= maxChars * 0.85);
  const counterColor = overLimit ? "#dc2626" : warnLimit ? "#d97706" : "#6b6b66";

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar} role="toolbar" aria-label="Форматування тексту">
        <button
          type="button"
          className={`${styles.tbBtn} ${editor.isActive("bold") ? styles.tbActive : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Жирний (Ctrl+B)"
          aria-label="Жирний"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={`${styles.tbBtn} ${editor.isActive("italic") ? styles.tbActive : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Курсив (Ctrl+I)"
          aria-label="Курсив"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={`${styles.tbBtn} ${editor.isActive("underline") ? styles.tbActive : ""}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Підкреслений (Ctrl+U)"
          aria-label="Підкреслений"
        >
          <span style={{ textDecoration: "underline" }}>U</span>
        </button>
        <button
          type="button"
          className={`${styles.tbBtn} ${editor.isActive("strike") ? styles.tbActive : ""}`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Закреслений"
          aria-label="Закреслений"
        >
          <span style={{ textDecoration: "line-through" }}>S</span>
        </button>

        <span className={styles.tbSep} />

        <select
          className={styles.tbSelect}
          value={editor.getAttributes("textStyle").color || ""}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Колір тексту"
          title="Колір тексту (для акцентних слів)"
        >
          {ACCENT_COLORS.map((c) => (
            <option key={c.value || "none"} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <span className={styles.tbSep} />

        <button
          type="button"
          className={`${styles.tbBtn} ${editor.isActive("link") ? styles.tbActive : ""}`}
          onClick={setLink}
          title="Додати посилання"
          aria-label="Посилання"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M10 14a4 4 0 0 0 5.657 0l3-3a4 4 0 1 0-5.657-5.657L11 7M14 10a4 4 0 0 0-5.657 0l-3 3a4 4 0 0 0 5.657 5.657L13 17"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.tbBtn} ${editor.isActive("bulletList") ? styles.tbActive : ""}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Маркований список"
          aria-label="Маркований список"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="4" cy="6" r="1.4" fill="currentColor" />
            <circle cx="4" cy="12" r="1.4" fill="currentColor" />
            <circle cx="4" cy="18" r="1.4" fill="currentColor" />
            <line x1="9" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="9" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="9" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <span className={styles.tbSep} />

        <button
          type="button"
          className={styles.tbBtn}
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          title="Очистити форматування"
          aria-label="Очистити форматування"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M19 4l-7 16-3-8L4 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span className={styles.tbSep} />

        <button
          type="button"
          className={styles.tbBtn}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Скасувати (Ctrl+Z)"
          aria-label="Скасувати"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.tbBtn}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Повторити (Ctrl+Shift+Z)"
          aria-label="Повторити"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0-6 6v0a6 6 0 0 0 6 6h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className={styles.tbSpacer} />
        {(maxChars || hardLimit) && (
          <span className={styles.charCount} style={{ color: counterColor }}>
            {charCount}
            {maxChars ? ` / ${maxChars}` : ""}
            {hardLimit && !maxChars ? ` / ${hardLimit}` : ""}
            {overLimit && " ⚠"}
          </span>
        )}
      </div>
      <EditorContent editor={editor} />
      {maxChars && overLimit && (
        <div className={styles.warnBar}>
          ⚠ Перевищено рекомендовану довжину ({maxChars} символів). Текст може виходити за межі картки на сторінці товару — на фронті ми додатково обмежимо висоту, але краще скоротити.
        </div>
      )}
    </div>
  );
};

export default ProductRichEditor;
