import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Seo from "../components/Seo";
import Document2 from "../components/figma/document2";
import FrameComponent6 from "../components/figma/frame-component6";
import Image2 from "../components/figma/image2";
import TabGroup1, { TabKey } from "../components/figma/tab-group1";
import TextBlock1 from "../components/figma/text-block1";
import FrameComponent8 from "../components/figma/frame-component8";
import LogisticsSection from "../components/figma/logistics-section";
import FrameComponent9 from "../components/figma/frame-component9";
import CombinedProducts from "../components/figma/combined-products";
import ProductReviews from "../components/figma/product-reviews";
import CtaSection1 from "../components/figma/cta-section1";
import Footer1 from "../components/figma/footer1";
import { getProduct, type Product, type TabBlock } from "../lib/products-api";
import styles from "./desktop1.module.css";

/* ----- Tiny HTML helper (renders trusted admin-authored HTML) ----- */
const Html: React.FC<{ html?: string; className?: string }> = ({ html, className }) =>
  html ? (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  ) : null;

/* ----- Inline SVG icons used inside notes/dosage callouts ----- */
const IconInfo = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const IconWarn = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const Desktop1: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("opis");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<boolean>(!!slug);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setProduct(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getProduct(slug)
      .then((p) => { if (!cancelled) setProduct(p); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || "Товар не знайдено"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  /* ============================================================
     ОПИС — original Figma design (Image2 hero + ОДНА компактна
     ліва карточка з описом + рішенням)
     ============================================================
     Поведінка:
       • Image2 (дерево + 3 плаваючі чіпи) лишається БЕЗ ЗМІН.
       • Зліва від дерева — одна узгоджена колонка:
            H1 (єдиний заголовок: title_line1 чорний + title_line2 сірий)
            └─ Описова карточка:
               - problem.intro_html / outro_html (БЕЗ дублюючого чіпа "Опис")
               - chip «Рішення» (акцент)
                 solution.intro_html (з лівою lime-смугою)
                 solution.outro_html (з акцентами)
       • title_subline ВИДАЛЕНО повністю (UI + backend + admin).
       • Картка не розтягує сторінку, обмежена 397px (= зліва від дерева).
     ============================================================ */
  const renderOpis = () => {
    const d = product?.description;
    const heroImage = d?.hero_image || "/tree.webp";
    const titleLine1 = d?.title_line1 || "Відновлення";
    const titleLine2 = d?.title_line2 || "після стресу.";
    const chips = d?.chips;
    const problem = d?.problem;
    const solution = d?.solution;

    const hasProblem = !!(problem?.intro_html || problem?.outro_html);
    const hasSolution = !!(solution?.intro_html || solution?.outro_html);

    return (
      <>
        <Image2
          heroImage={heroImage}
          heroAlt={product ? `${product.name} — ${product.short_desc}` : "Дерево — відновлення після стресу"}
          chips={chips && chips.length > 0 ? chips : undefined}
        />
        <section className={styles.featureColumnWrapper}>
          <div className={styles.featureColumn}>
            <h1 className={styles.h1}>
              <span className={styles.span}>
                <span>{titleLine1}</span>
              </span>
              <span className={styles.span2}>
                <span className={styles.span}>{` `}</span>
                <span>{titleLine2}</span>
                <span className={styles.span4}>{` `}</span>
              </span>
            </h1>

            {(hasProblem || hasSolution) && (
              <article className={styles.descCard}>
                {hasProblem && (
                  <div className={styles.descBlock}>
                    {problem?.intro_html && (
                      <div
                        className={styles.descText}
                        dangerouslySetInnerHTML={{ __html: problem.intro_html }}
                      />
                    )}
                    {problem?.outro_html && (
                      <div
                        className={styles.descText}
                        dangerouslySetInnerHTML={{ __html: problem.outro_html }}
                      />
                    )}
                  </div>
                )}
                {hasSolution && (
                  <div className={`${styles.descBlock} ${styles.descBlockSolution}`}>
                    <span className={`${styles.descChip} ${styles.descChipAccent}`}>
                      {solution?.title || "Рішення"}
                    </span>
                    {solution?.intro_html && (
                      <div
                        className={`${styles.descText} ${styles.descTextAccentRail}`}
                        dangerouslySetInnerHTML={{ __html: solution.intro_html }}
                      />
                    )}
                    {solution?.outro_html && (
                      <div
                        className={`${styles.descText} ${styles.descTextHighlight}`}
                        dangerouslySetInnerHTML={{ __html: solution.outro_html }}
                      />
                    )}
                  </div>
                )}
              </article>
            )}
          </div>
        </section>
      </>
    );
  };

  /* ============================================================
     Дозування / Склад / Сумісність / Характеристика — структуровані картки
     ============================================================ */
  const renderRichTab = (
    block: TabBlock | undefined,
    fallbackTitle: string,
    accent: "lime" | "olive" | "earth" | "sand",
    icon: React.ReactNode,
  ) => {
    const title = block?.title || fallbackTitle;
    const intro = block?.intro || "";
    const items = block?.items || [];
    const note  = block?.note || "";
    return (
      <section className={styles.richTabWrapper} data-accent={accent}>
        <div className={styles.richTabHead}>
          <div className={styles.richTabIcon} aria-hidden="true">{icon}</div>
          <div className={styles.richTabHeadText}>
            <h2 className={styles.richTabTitle}>{title}</h2>
            {intro ? <p className={styles.richTabIntro}>{intro}</p> : null}
          </div>
        </div>
        {items.length > 0 && (
          <ul className={styles.richTabList}>
            {items.map((it, i) => (
              <li key={i} className={styles.richTabItem}>
                <span className={styles.richTabBullet} aria-hidden="true">•</span>
                <span
                  className={styles.richTabItemText}
                  dangerouslySetInnerHTML={{ __html: it.text }}
                />
              </li>
            ))}
          </ul>
        )}
        {note ? (
          <div className={styles.richTabNoteBox}>
            <div className={styles.richTabNoteLabel}>Примітка</div>
            <p className={styles.richTabNote}>{note}</p>
          </div>
        ) : null}
      </section>
    );
  };

  const renderSpecsTab = () => {
    const block = product?.specs;
    const title = block?.title || "Характеристика";
    const intro = block?.intro || "";
    const items = block?.items || [];
    const note  = block?.note || "";

    /* ---------- Auto-built base specs (from product top-level fields) ----------
       На старому tamis.com.ua у вкладці «Характеристика» завжди показувались
       7 базових рядків (Виробник, Країна виробництва, Форма випуску,
       Упаковка, Тип, Термін застосування, Культура). У нашій БД ці значення
       зберігаються у окремих top-level полях (category, packing, cultures,
       storage_period, storage_temp, norm). Тому ми збираємо їх автоматично
       — на всіх 68 продуктах одразу, без редагування в адмінці.
       Кастомні specs.items (якщо є) додаються знизу як додаткові рядки.
    ----------------------------------------------------------------------------- */
    const categoryLabels: Record<string, string> = {
      macro: "Біодобриво",
      biopesticide: "Біологічний препарат",
      rodenticide: "Родентицид",
      adjuvant: "Ад'ювант / сурфактант",
      inoculant: "Інокулянт",
    };
    const baseRows: { label: string; value: string }[] = [];
    baseRows.push({ label: "Виробник", value: "Власне виробництво" });
    baseRows.push({ label: "Країна виробництва", value: "Україна" });
    const cat = (product as any)?.category;
    if (cat && categoryLabels[cat]) {
      baseRows.push({ label: "Тип", value: categoryLabels[cat] });
    }
    const formVal = (product as any)?.form;
    if (formVal) {
      baseRows.push({ label: "Форма випуску", value: formVal });
    }
    const packing = (product as any)?.packing;
    if (packing) {
      baseRows.push({ label: "Упаковка", value: packing });
    }
    const cultures = (product as any)?.cultures;
    if (cultures) {
      baseRows.push({ label: "Культура", value: cultures });
    }
    const applicationPeriod = (product as any)?.application_period;
    if (applicationPeriod) {
      baseRows.push({ label: "Термін застосування", value: applicationPeriod });
    }
    const norm = (product as any)?.norm;
    if (norm) {
      baseRows.push({ label: "Норма витрати", value: norm });
    }
    const storagePeriod = (product as any)?.storage_period;
    const storageTemp = (product as any)?.storage_temp;
    if (storagePeriod || storageTemp) {
      const parts: string[] = [];
      if (storagePeriod) parts.push(storagePeriod);
      if (storageTemp) parts.push(`при ${storageTemp}`);
      baseRows.push({ label: "Термін зберігання", value: parts.join(", ") });
    }
    if ((product as any)?.batch_size) {
      baseRows.push({ label: "Розфасування", value: (product as any).batch_size });
    }

    /* Try to split each custom "label: value" item into label + value for a clean table */
    const customRows = items.map((it) => {
      const text = it.text || "";
      const m = text.match(/^(.*?)(?:\s—\s|:\s)(.*)$/);
      if (m) return { label: m[1].trim(), value: m[2].trim() };
      return { label: text, value: "" };
    });

    /* Merge: base rows first, then custom rows (skip any custom row whose
       label duplicates a base row to avoid double-display). */
    const baseLabelsLower = new Set(baseRows.map((r) => r.label.toLowerCase().trim()));
    const filteredCustomRows = customRows.filter(
      (r) => !baseLabelsLower.has(r.label.toLowerCase().trim())
    );
    const rows = [...baseRows, ...filteredCustomRows];

    return (
      <section className={styles.richTabWrapper} data-accent="sand">
        <div className={styles.richTabHead}>
          <div className={styles.richTabIcon} aria-hidden="true">{IconChart}</div>
          <div className={styles.richTabHeadText}>
            <h2 className={styles.richTabTitle}>{title}</h2>
            {intro ? <p className={styles.richTabIntro}>{intro}</p> : null}
          </div>
        </div>
        {rows.length > 0 && (
          <div className={styles.specsTableWrap}>
            <table className={styles.specsTable}>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <th scope="row" dangerouslySetInnerHTML={{ __html: r.label }} />
                    <td dangerouslySetInnerHTML={{ __html: r.value || "—" }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {note ? (
          <div className={styles.richTabNoteBox}>
            <div className={styles.richTabNoteLabel}>Примітка</div>
            <p className={styles.richTabNote}>{note}</p>
          </div>
        ) : null}
      </section>
    );
  };

  /* ---------- Inline icons (matched to design system) ---------- */
  const IconDrop = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
  const IconBacteria = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9.5" cy="11" r="0.9" fill="currentColor" />
      <circle cx="14" cy="13.5" r="0.9" fill="currentColor" />
      <circle cx="12" cy="9.5" r="0.7" fill="currentColor" />
      <path d="M5 5l2 2M19 5l-2 2M5 19l2-2M19 19l-2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
  const IconShield = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M12 3l8 3v6c0 4.5-3.5 8.3-8 9-4.5-.7-8-4.5-8-9V6l8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const IconChart = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18M9 3v18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );

  /* =================================================================
     DOSAGE — vertical timeline of numbered steps
     =================================================================
     Parser: each item.text looks like
       "<b>Title (or label):</b> rest of description ..."
     We split on the first "</b>" (or "<b>...:</b>") to get (title, desc).
     Fallback: whole text becomes desc, title = "Крок N"
     ----------------------------------------------------------------- */
  const parseStepItem = (text: string, fallback: string): { title: string; desc: string } => {
    const m = text.match(/^\s*<b>(.+?)<\/b>\s*[:.\u2014\u2013-]?\s*(.*)$/i);
    if (m) {
      const title = m[1].replace(/[:.]+\s*$/, "").trim();
      const desc = (m[2] || "").trim();
      return { title, desc };
    }
    const m2 = text.match(/^(.+?)[:\u2014\u2013-]\s+(.+)$/);
    if (m2) return { title: m2[1].trim(), desc: m2[2].trim() };
    return { title: fallback, desc: text };
  };

  const renderDosageTab = () => {
    const block = product?.dosage;
    const title = block?.title || "Дозування";
    const intro = block?.intro || "";
    const items = block?.items || [];
    const note  = block?.note || "";

    /* Pick a phase icon per step in a rotating pattern (drop / shield / chart) */
    const phaseMeta = (i: number): { label: string; icon: React.ReactNode } => {
      const labels = ["Підготовка", "Внесення", "Підживлення", "Закріплення"];
      const icons: React.ReactNode[] = [IconDrop, IconBacteria, IconShield, IconChart];
      return { label: labels[i % labels.length], icon: icons[i % icons.length] };
    };

    return (
      <section className={styles.dosageTab}>
        <div className={styles.dosageHead}>
          <div className={styles.dosageHeadIcon}>{IconDrop}</div>
          <div className={styles.dosageHeadText}>
            <h2 className={styles.dosageTitle}>{title}</h2>
            {intro ? <p className={styles.dosageIntro}>{intro}</p> : null}
          </div>
          {items.length > 0 && (
            <div className={styles.dosageStepCount} aria-label={`${items.length} кроків`}>
              <span className={styles.dosageStepCountNum}>{items.length}</span>
              <span className={styles.dosageStepCountLabel}>{items.length === 1 ? "крок" : "кроків"}</span>
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className={styles.dosageTimeline}>
            {items.map((it, i) => {
              const parsed = parseStepItem(it.text, `Крок ${i + 1}`);
              const meta = phaseMeta(i);
              const isLast = i === items.length - 1;
              return (
                <div key={i} className={styles.dosageStep}>
                  <div className={styles.dosageStepRail} aria-hidden="true">
                    <div className={styles.dosageStepNum}>{i + 1}</div>
                    {!isLast && <div className={styles.dosageStepLine} />}
                  </div>
                  <div className={styles.dosageStepBody}>
                    <div className={styles.dosageStepPhase}>
                      <span className={styles.dosageStepPhaseIcon}>{meta.icon}</span>
                      <span className={styles.dosageStepPhaseLabel}>{meta.label}</span>
                    </div>
                    <div
                      className={styles.dosageStepTitle}
                      dangerouslySetInnerHTML={{ __html: parsed.title }}
                    />
                    <div
                      className={styles.dosageStepDesc}
                      dangerouslySetInnerHTML={{ __html: parsed.desc }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {note ? (
          <div className={styles.dosageNoteBox}>
            <div className={styles.dosageNoteIcon}>{IconInfo}</div>
            <div className={styles.dosageNoteBody}>
              <div className={styles.dosageNoteLabel}>Порада агронома</div>
              <p className={styles.dosageNoteText}>{note}</p>
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  /* =================================================================
     COMPOSITION — molecular cards grid
     =================================================================
     New robust parser that handles 3 real-world data shapes:
       1) "<b>NAME</b> — VALUE (DESC)"   (classic component format)
       2) "NAME: long description text"   (sentence with leading label)
       3) "Just a long paragraph ..."      (free-form text, no label)
     Rule for pill (compoCardPercent): show ONLY when value is short
     (numeric / %, <= 25 chars). Otherwise value collapses into desc so
     the pill never overflows the card.
     ----------------------------------------------------------------- */
  const PILL_MAX = 25;
  const parseCompoItem = (text: string): { name: string; value: string; desc: string } => {
    const original = (text || "").trim();
    let name = "";
    let rest = original;
    let desc = "";

    // a) Pull leading <b>..</b> as name (highest priority)
    const tagMatch = rest.match(/^\s*<b>([^<]+)<\/b>\s*(.*)$/i);
    if (tagMatch) {
      name = tagMatch[1].trim();
      rest = tagMatch[2].replace(/^[—\u2013\-:]\s*/, "").trim();
    }

    // b) Extract trailing "(description)" if present
    const descMatch = rest.match(/\(([^)]+)\)\s*$/);
    if (descMatch) {
      desc = descMatch[1].trim();
      rest = rest.replace(/\(([^)]+)\)\s*$/, "").trim();
    }

    // c) If no name yet, try label patterns (colon takes priority over dash
    //    when label is short — "Склад препарату: ..." beats "Trichoderma – T. viride")
    if (!name) {
      // colon separator with SHORT label first
      const shortColon = rest.match(/^([^:—\u2013]{2,40}):\s*(.+)$/);
      if (shortColon) {
        name = shortColon[1].trim();
        rest = shortColon[2].trim();
      } else {
        // dash separator "NAME — VALUE"
        const dashSep = rest.match(/^([^—\u2013]+?)\s*[—\u2013]\s*(.+)$/);
        if (dashSep) {
          name = dashSep[1].trim();
          rest = dashSep[2].trim();
        } else if (rest.endsWith(":") && rest.length <= 60) {
          // pure label like "Склад препарату:"
          name = rest.replace(/:\s*$/, "").trim();
          rest = "";
        } else if (rest.length <= 50) {
          // short token → treat as name
          name = rest;
          rest = "";
        } else {
          // long paragraph w/o separator → no name, all goes to desc
          desc = desc ? `${rest} (${desc})` : rest;
          rest = "";
          name = "";
        }
      }
    }

    // d) Decide: short value → pill;  long value → fold into desc
    let value = "";
    if (rest) {
      if (rest.length <= PILL_MAX) {
        value = rest;
      } else {
        desc = desc ? `${rest} (${desc})` : rest;
      }
    }
    return { name, value, desc };
  };

  const _symbolForName = (name: string): string => {
    const map: Record<string, string> = {
      "Бродіфакум": "Brd",
      "Хелати Fe, Mn, Zn, Cu": "Fe·Mn",
      "Бор (B)": "B",
      "Молібден (Mo)": "Mo",
      "L-амінокислоти": "AA",
      "Поверхнево-активні речовини": "ПАР",
      "Склад препарату": "Скл",
      "Застосування препарату": "Заст",
      "Правила зберігання": "Збер",
    };
    if (map[name]) return map[name];
    const cleaned = (name || "").replace(/[«»"'`]/g, "").trim();
    if (!cleaned) return "•";
    // Pull abbreviation from brackets first, e.g. "Бор (B)" -> "B"
    const br = cleaned.match(/\(([^)]+)\)/);
    if (br) return br[1].trim().slice(0, 4);
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 3);
    if (words.length === 2) return (words[0][0] + (words[1][0] || "")).toUpperCase();
    return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  };

  const renderCompositionTab = () => {
    const block = product?.composition;
    const title = block?.title || "Склад";
    const intro = block?.intro || "";
    const items = block?.items || [];
    const note  = block?.note || "";
    return (
      <section className={styles.compoTab}>
        <div className={styles.compoHead}>
          <div className={styles.compoHeadIcon}>{IconBacteria}</div>
          <div className={styles.compoHeadText}>
            <h2 className={styles.compoTitle}>{title}</h2>
            {intro ? <p className={styles.compoIntro}>{intro}</p> : null}
          </div>
          {items.length > 0 && (
            <div className={styles.compoCount} aria-label={`${items.length} компонентів`}>
              <span className={styles.compoCountNum}>{items.length}</span>
              <span className={styles.compoCountLabel}>{items.length === 1 ? "компонент" : "компонентів"}</span>
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className={styles.compoGrid}>
            {items.map((it, i) => {
              const p = parseCompoItem(it.text);
              const hasName = !!p.name;
              const hasValue = !!p.value;
              const symbol = hasName ? _symbolForName(p.name) : "";
              const variant = hasName ? "labeled" : "plain";
              return (
                <div key={i} className={styles.compoCard} data-variant={variant}>
                  {(hasName || hasValue) && (
                    <div className={styles.compoCardTop}>
                      {hasName ? (
                        <span className={styles.compoCardBadge} aria-hidden="true">
                          {symbol}
                        </span>
                      ) : null}
                      {hasValue ? (
                        <span
                          className={styles.compoCardPercent}
                          dangerouslySetInnerHTML={{ __html: p.value }}
                        />
                      ) : null}
                    </div>
                  )}
                  {hasName ? (
                    <div className={styles.compoCardName} dangerouslySetInnerHTML={{ __html: p.name }} />
                  ) : null}
                  {p.desc ? <p className={styles.compoCardDesc}>{p.desc}</p> : null}
                </div>
              );
            })}
          </div>
        )}
        {note ? (
          <div className={styles.compoNoteBox}>
            <div className={styles.compoNoteIcon}>{IconWarn}</div>
            <div>
              <div className={styles.compoNoteLabel}>Важливо</div>
              <p className={styles.compoNoteText}>{note}</p>
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  /* =================================================================
     COMPATIBILITY — split: ✓ ok column | ✗ not-ok column
     ================================================================= */
  const renderCompatibilityTab = () => {
    const block = product?.compatibility;
    const title = block?.title || "Сумісність";
    const intro = block?.intro || "";
    const items = block?.items || [];
    const note  = block?.note || "";
    /* Split items by ✓ / ✗ markers (or sumis / nesumis keywords) */
    const ok: typeof items = [];
    const no: typeof items = [];
    items.forEach((it) => {
      const txt = it.text || "";
      const stripped = txt.replace(/<\/?[bi]>/gi, "").trim();
      if (/^[✗хХ×]|не\s*сумісн|Не\s*сумісн/i.test(stripped) || stripped.includes("✗")) {
        no.push({ text: txt.replace(/[✗хХ×]\s*/g, "") });
      } else if (/^[✓v]|сумісн|Сумісн/i.test(stripped) || stripped.includes("✓")) {
        ok.push({ text: txt.replace(/[✓vV]\s*/g, "") });
      } else {
        // Default — treat as ok
        ok.push(it);
      }
    });

    return (
      <section className={styles.compatTab}>
        <div className={styles.compatHead}>
          <div className={styles.compatHeadIcon}>{IconShield}</div>
          <div className={styles.compatHeadText}>
            <h2 className={styles.compatTitle}>{title}</h2>
            {intro ? <p className={styles.compatIntroBox}>{intro}</p> : null}
          </div>
        </div>
        <div className={styles.compatGrid}>
          <div className={`${styles.compatCol} ${styles.compatColOk}`}>
            <div className={styles.compatColHead}>
              <span className={styles.compatColIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>
              </span>
              <span className={styles.compatColTitle}>Повністю сумісний</span>
              <span className={styles.compatColCount}>{ok.length}</span>
            </div>
            <ul className={styles.compatList}>
              {ok.map((it, i) => (
                <li key={i} className={`${styles.compatItem} ${styles.compatItemOk}`}>
                  <span className={`${styles.compatItemMark} ${styles.compatItemMarkOk}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>
                  </span>
                  <span className={styles.compatItemText} dangerouslySetInnerHTML={{ __html: it.text }} />
                </li>
              ))}
            </ul>
          </div>
          <div className={`${styles.compatCol} ${styles.compatColNo}`}>
            <div className={styles.compatColHead}>
              <span className={styles.compatColIcon}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M6 18L18 6"/></svg>
              </span>
              <span className={styles.compatColTitle}>Не сумісний</span>
              <span className={styles.compatColCount}>{no.length}</span>
            </div>
            <ul className={styles.compatList}>
              {no.map((it, i) => (
                <li key={i} className={`${styles.compatItem} ${styles.compatItemNo}`}>
                  <span className={`${styles.compatItemMark} ${styles.compatItemMarkNo}`}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M6 18L18 6"/></svg>
                  </span>
                  <span className={styles.compatItemText} dangerouslySetInnerHTML={{ __html: it.text }} />
                </li>
              ))}
            </ul>
          </div>
        </div>
        {note ? (
          <div className={styles.compatNoteBox}>
            <div className={styles.compatNoteIcon}>{IconWarn}</div>
            <div className={styles.compatNoteBody}>
              <div className={styles.compatNoteLabel}>Перед застосуванням</div>
              <p className={styles.compatNoteText}>{note}</p>
            </div>
          </div>
        ) : null}
      </section>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "dosage":
        return renderDosageTab();
      case "composition":
        return renderCompositionTab();
      case "compatibility":
        return renderCompatibilityTab();
      case "specs":
        return renderSpecsTab();
      case "opis":
      default:
        return renderOpis();
    }
  };

  if (loading) {
    return (
      <div className={styles.desktop}>
        <Document2 />
        <div style={{ padding: 80, textAlign: "center", color: "#6b6b66" }}>Завантаження…</div>
        <Footer1 device="Desktop" />
      </div>
    );
  }

  if (error && slug) {
    return (
      <div className={styles.desktop}>
        <Document2 />
        <div style={{ padding: 80, textAlign: "center" }}>
          <h2 style={{ color: "#2c2c27", marginBottom: 12 }}>Товар не знайдено</h2>
          <p style={{ color: "#6b6b66" }}>{error}</p>
        </div>
        <Footer1 device="Desktop" />
      </div>
    );
  }

  return (
    <div className={styles.desktop}>
      <Seo
        title={product ? (product.seo_title || `${product.name} — TAMIS АГРО`) : "Біопрепарат — деталі товару"}
        description={product ? (product.seo_description || product.short_desc) : "Детальний опис біопрепарату ТАМІС АГРО: склад, дозування, культури, відгуки. Замовлення з безкоштовною доставкою по Україні."}
        canonical={product ? `/product/${product.slug}` : "/product"}
        type="product"
      />
      <Document2 />
      <FrameComponent6 product={product} />
      <main className={styles.describeSectionWrapper}>
        <div className={`${styles.describeSection} ${activeTab === "opis" ? styles.opisActive : ""}`}>
          <TabGroup1 activeTab={activeTab} onTabChange={setActiveTab} />
          {renderTabContent()}
        </div>
      </main>
      <FrameComponent8 />
      <section className={styles.chaineSectionWrapper}>
        <div className={styles.chaineSection}>
          <LogisticsSection />
        </div>
      </section>
      <FrameComponent9 productSlug={product?.slug} productName={product?.name} />
      <ProductReviews productSlug={product?.slug} />
      <CombinedProducts slug={product?.slug} />
      <CtaSection1 />
      <Footer1 device="Desktop" />
    </div>
  );
};

export default Desktop1;
