import React, { useEffect, useState } from "react";
import { getSettings, updateSettings, testTelegram, testEmail, testNovaPoshta, AdminSettings } from "../../lib/admin-api";
import styles from "./AdminNotifications.module.css";

const DEFAULT_SETTINGS: AdminSettings = {
  channel: "none",
  telegram_bot_token: "",
  telegram_chat_id: "",
  smtp_host: "",
  smtp_port: 465,
  smtp_user: "",
  smtp_password: "",
  smtp_use_tls: true,
  from_email: "",
  to_email: "",
  site_name: "TAMIS АГРО",
  google_client_id: "",
  google_enabled: false,
  nova_poshta_api_key: "",
  nova_poshta_sender_city_ref: "",
  nova_poshta_enabled: true,
  contact_phone_primary: "",
  contact_phone_secondary: "",
  contact_email: "",
  contact_address: "",
};

type Toast = { kind: "ok" | "err"; text: string };

const AdminNotifications: React.FC = () => {
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingTg, setTestingTg] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [testingNp, setTestingNp] = useState(false);
  const [showNpKey, setShowNpKey] = useState(false);
  const [editNpKey, setEditNpKey] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSettings();
        if (!cancelled) setSettings({ ...DEFAULT_SETTINGS, ...s });
      } catch (e: any) {
        if (!cancelled) setToast({ kind: "err", text: e?.response?.data?.detail || "Не вдалося завантажити налаштування" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const upd = <K extends keyof AdminSettings>(k: K, v: AdminSettings[K]) =>
    setSettings((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true); setToast(null);
    try {
      const updated = await updateSettings(settings);
      setSettings({ ...DEFAULT_SETTINGS, ...updated });
      setToast({ kind: "ok", text: "Налаштування збережено" });
    } catch (e: any) {
      setToast({ kind: "err", text: e?.response?.data?.detail || "Не вдалося зберегти" });
    } finally {
      setSaving(false);
    }
  };

  const onTestTg = async () => {
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
      setToast({ kind: "err", text: "Спочатку вкажіть Bot Token і Chat ID, та збережіть." });
      return;
    }
    setTestingTg(true); setToast(null);
    try {
      await testTelegram();
      setToast({ kind: "ok", text: "✅ Тестове Telegram-повідомлення надіслано" });
    } catch (e: any) {
      setToast({ kind: "err", text: e?.response?.data?.detail || "Не вдалося надіслати" });
    } finally { setTestingTg(false); }
  };

  const onTestEmail = async () => {
    if (!settings.smtp_host || !settings.to_email) {
      setToast({ kind: "err", text: "Спочатку вкажіть SMTP-параметри і збережіть." });
      return;
    }
    setTestingMail(true); setToast(null);
    try {
      await testEmail();
      setToast({ kind: "ok", text: `✅ Тестовий лист надіслано на ${settings.to_email}` });
    } catch (e: any) {
      setToast({ kind: "err", text: e?.response?.data?.detail || "Не вдалося надіслати" });
    } finally { setTestingMail(false); }
  };

  const onTestNp = async () => {
    if (!settings.nova_poshta_api_key) {
      setToast({ kind: "err", text: "Спочатку вкажіть ключ і збережіть." });
      return;
    }
    setTestingNp(true); setToast(null);
    try {
      const r = await testNovaPoshta();
      setToast({ kind: r.ok ? "ok" : "err", text: r.message || (r.ok ? "✅ Ключ валідний" : "Ключ невалідний") });
    } catch (e: any) {
      setToast({ kind: "err", text: e?.response?.data?.detail || "Не вдалося перевірити" });
    } finally { setTestingNp(false); }
  };

  const maskKey = (k: string): string => {
    if (!k) return "—";
    if (k.length <= 8) return "•".repeat(k.length);
    return `${k.slice(0, 4)}${"•".repeat(Math.max(8, k.length - 8))}${k.slice(-4)}`;
  };

  if (loading) {
    return <div className={styles.panel}>Завантаження…</div>;
  }

  return (
    <div data-testid="admin-notifications-page">
      {toast && (
        <div className={`${styles.note} ${toast.kind === "ok" ? styles.noteSuccess : styles.noteError}`} data-testid="admin-notifications-toast">
          {toast.text}
        </div>
      )}

      {/* Channel selector */}
      <div className={styles.panel} style={{ marginBottom: 20 }}>
        <div className={styles.panelHead}>
          <div className={styles.panelIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/></svg>
          </div>
          <h2 className={styles.panelTitle}>Канал сповіщення</h2>
        </div>
        <p className={styles.panelDesc}>Оберіть як отримувати нові заявки на дзвінок від клієнтів.</p>

        <div className={styles.channelGrid}>
          {[
            { v: "none",     emoji: "🔕", label: "Вимкнено",  hint: "Ніяких повідомлень" },
            { v: "telegram", emoji: "✈️",  label: "Telegram",     hint: "Особисто" },
            { v: "email",    emoji: "✉️",  label: "Email",        hint: "На пошту" },
            { v: "both",     emoji: "🔔", label: "Обидва",    hint: "Telegram + Email" },
          ].map((c) => (
            <button
              key={c.v}
              type="button"
              className={`${styles.channelBtn} ${settings.channel === c.v ? styles.channelActive : ""}`}
              onClick={() => upd("channel", c.v as AdminSettings["channel"])}
              data-testid={`admin-channel-${c.v}`}
            >
              <span className={styles.channelEmoji}>{c.emoji}</span>
              {c.label}
              <span className={styles.channelHint}>{c.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Two panels: Telegram + Email */}
      <div className={styles.grid}>
        {/* TELEGRAM */}
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelIcon}>✈️</div>
            <h2 className={styles.panelTitle}>Telegram</h2>
          </div>
          <p className={styles.panelDesc}>
            Бот надсилатиме особисті повідомлення в ваш Telegram-акаунт або групу.
          </p>

          <div className={styles.note + " " + styles.noteInfo}>
            <b>Як налаштувати:</b>
            <ol>
              <li>Відкрийте <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> в Telegram → <code>/newbot</code> → отримайте <b>Bot Token</b>.</li>
              <li>Напишіть своєму боту будь-яке повідомлення (щоб він міг вам відписувати).</li>
              <li>Відкрийте <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer">@userinfobot</a> → отримайте ваш <b>Chat ID</b>.</li>
            </ol>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Bot Token</label>
            <input
              type="text"
              className={styles.input}
              value={settings.telegram_bot_token}
              onChange={(e) => upd("telegram_bot_token", e.target.value)}
              placeholder="123456:ABC-DEF…"
              data-testid="admin-tg-token"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Chat ID</label>
            <input
              type="text"
              className={styles.input}
              value={settings.telegram_chat_id}
              onChange={(e) => upd("telegram_chat_id", e.target.value)}
              placeholder="123456789"
              data-testid="admin-tg-chat"
            />
            <span className={styles.hint}>Може бути як особистий ID, так і ID групи (починається з -100…).</span>
          </div>

          <button type="button" className={styles.btnSecondary} onClick={onTestTg} disabled={testingTg} data-testid="admin-tg-test">
            {testingTg ? "Надсилаємо…" : "Надіслати тестове повідомлення"}
          </button>
        </div>

        {/* EMAIL */}
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelIcon}>✉️</div>
            <h2 className={styles.panelTitle}>Email (SMTP)</h2>
          </div>
          <p className={styles.panelDesc}>
            Налаштуйте SMTP-сервер, з якого будуть надсилатися листи. Приклад: Gmail App Password, Ukr.net, Mailgun.
          </p>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>SMTP Host</label>
              <input
                type="text"
                className={styles.input}
                value={settings.smtp_host}
                onChange={(e) => upd("smtp_host", e.target.value)}
                placeholder="smtp.gmail.com"
                data-testid="admin-smtp-host"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>SMTP Port</label>
              <input
                type="number"
                className={styles.input}
                value={settings.smtp_port}
                onChange={(e) => upd("smtp_port", parseInt(e.target.value) || 465)}
                placeholder="465"
                data-testid="admin-smtp-port"
              />
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>SMTP User</label>
              <input
                type="text"
                className={styles.input}
                value={settings.smtp_user}
                onChange={(e) => upd("smtp_user", e.target.value)}
                placeholder="manager@tamis.ua"
                data-testid="admin-smtp-user"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>SMTP Password</label>
              <input
                type="password"
                className={styles.input}
                value={settings.smtp_password}
                onChange={(e) => upd("smtp_password", e.target.value)}
                placeholder="••••••••"
                data-testid="admin-smtp-pwd"
              />
            </div>
          </div>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={settings.smtp_use_tls}
              onChange={(e) => upd("smtp_use_tls", e.target.checked)}
            />
            Використовувати STARTTLS (для порту 587). Для 465 — відключено (SSL).
          </label>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>From Email</label>
              <input
                type="email"
                className={styles.input}
                value={settings.from_email}
                onChange={(e) => upd("from_email", e.target.value)}
                placeholder="noreply@tamis.ua"
                data-testid="admin-from"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>To Email (менеджер)</label>
              <input
                type="email"
                className={styles.input}
                value={settings.to_email}
                onChange={(e) => upd("to_email", e.target.value)}
                placeholder="manager@tamis.ua"
                data-testid="admin-to"
              />
            </div>
          </div>

          <button type="button" className={styles.btnSecondary} onClick={onTestEmail} disabled={testingMail} data-testid="admin-email-test">
            {testingMail ? "Надсилаємо…" : "Надіслати тестовий лист"}
          </button>
        </div>
      </div>

      {/* GOOGLE OAUTH SETTINGS */}
      <div className={styles.panel} style={{ marginTop: 20 }}>
        <div className={styles.panelHead}>
          <div className={styles.panelIcon}>
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
              <path d="M44.5 20H24v8.5h11.7C34.3 33.3 29.7 36.5 24 36.5 17.1 36.5 11.5 30.9 11.5 24S17.1 11.5 24 11.5c3 0 5.7 1 7.9 2.8l6.4-6.4C34.6 4.5 29.6 2.5 24 2.5 12.1 2.5 2.5 12.1 2.5 24S12.1 45.5 24 45.5c11.9 0 21.5-9.6 21.5-21.5 0-1.4-.2-2.7-.5-4Z" fill="#4285F4"/>
            </svg>
          </div>
          <h2 className={styles.panelTitle}>Google авторизація</h2>
        </div>
        <p className={styles.panelDesc}>
          Дозволити користувачам входити через Google. Client ID можна змінити тут (наприклад, при ротації або переході на свій проект Google Cloud).
        </p>

        <div className={styles.note + " " + styles.noteInfo}>
          <b>Як отримати Google Client ID:</b>
          <ol>
            <li>Перейдіть у <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console → Credentials</a>.</li>
            <li>Створіть OAuth 2.0 Client ID типу <b>Web application</b>.</li>
            <li>У <b>Authorized JavaScript origins</b> додайте URL вашого сайту (preview та продакшн).</li>
            <li>Скопіюйте <b>Client ID</b> (...apps.googleusercontent.com) сюди.</li>
          </ol>
        </div>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={settings.google_enabled}
            onChange={(e) => upd("google_enabled", e.target.checked)}
            data-testid="admin-google-enabled"
          />
          Увімкнути вхід через Google
        </label>

        <div className={styles.field}>
          <label className={styles.label}>Google Client ID</label>
          <input
            type="text"
            className={styles.input}
            value={settings.google_client_id}
            onChange={(e) => upd("google_client_id", e.target.value)}
            placeholder="123456789-abc...apps.googleusercontent.com"
            data-testid="admin-google-client-id"
            style={{ fontFamily: "Inter, monospace", fontSize: 13 }}
          />
          <span className={styles.hint}>
            Тільки Client ID. Client Secret не потрібен (використовуємо безпечну id_token верифікацію).
          </span>
        </div>
      </div>

      {/* ===== NOVA POSHTA ===== */}
      <div className={styles.panel} style={{ marginTop: 20 }}>
        <div className={styles.panelHead}>
          <div className={styles.panelIcon} style={{ background: "#fff4eb", color: "#d4380d" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 7l9-4 9 4M3 7v10l9 4 9-4V7M3 7l9 4 9-4M12 11v10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className={styles.panelTitle}>Nova Poshta API</h2>
        </div>
        <p className={styles.panelDesc}>
          Ключ використовується для автокомпліту міст і відділень, розрахунку доставки та трекінгу ТТН на чекауті, у профілі замовлень та в адмін-панелі. Можна змінити в будь-який момент — нові запити одразу підуть з новим ключем.
        </p>

        <div className={styles.note + " " + styles.noteInfo}>
          <b>Як отримати ключ Nova Poshta:</b>
          <ol>
            <li>Зареєструйтесь або увійдіть у <a href="https://novaposhta.ua/dashboard/settings/developers" target="_blank" rel="noreferrer">особистий кабінет Нової Пошти → API</a>.</li>
            <li>Натисніть «Створити ключ» (Generate API key).</li>
            <li>Скопіюйте 32-символьний ключ сюди та натисніть «Зберегти налаштування».</li>
          </ol>
        </div>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={settings.nova_poshta_enabled}
            onChange={(e) => upd("nova_poshta_enabled", e.target.checked)}
            data-testid="admin-np-enabled"
          />
          Увімкнути інтеграцію з Новою Поштою
        </label>

        <div className={styles.field}>
          <label className={styles.label}>API Key (apiKey)</label>
          {editNpKey ? (
            <input
              type={showNpKey ? "text" : "password"}
              className={styles.input}
              value={settings.nova_poshta_api_key}
              onChange={(e) => upd("nova_poshta_api_key", e.target.value.trim())}
              placeholder="5cb1e3ebc23e75d737fd57c1e056ecc9"
              autoFocus
              data-testid="admin-np-key"
              style={{ fontFamily: "Inter, monospace", fontSize: 13 }}
            />
          ) : (
            <div
              className={styles.input}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                fontFamily: "Inter, monospace", fontSize: 13, color: "#2c2c27",
                background: "#f7f7f1", cursor: "default",
              }}
              data-testid="admin-np-key-mask"
            >
              <span>{showNpKey ? settings.nova_poshta_api_key || "—" : maskKey(settings.nova_poshta_api_key)}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" className={styles.btnSecondary} style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setShowNpKey(!showNpKey)} data-testid="admin-np-key-show">
                  {showNpKey ? "Сховати" : "Показати"}
                </button>
                <button type="button" className={styles.btnSecondary} style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setEditNpKey(true)} data-testid="admin-np-key-edit">
                  Редагувати
                </button>
              </span>
            </div>
          )}
          {editNpKey && (
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button type="button" className={styles.btnSecondary} style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => { setShowNpKey(!showNpKey); }}>
                {showNpKey ? "Сховати" : "Показати"}
              </button>
              <button type="button" className={styles.btnSecondary} style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => setEditNpKey(false)} data-testid="admin-np-key-done">
                Готово
              </button>
            </div>
          )}
          <span className={styles.hint}>
            Зберігається у БД (адмін-налаштування). Якщо порожній — використовується значення з .env (legacy). Після збереження зміни підхопляться протягом 5 секунд.
          </span>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>CityRef нашого складу (sender)</label>
          <input
            type="text"
            className={styles.input}
            value={settings.nova_poshta_sender_city_ref}
            onChange={(e) => upd("nova_poshta_sender_city_ref", e.target.value.trim())}
            placeholder="db5c8892-391c-11dd-90d9-001a92567626 (Полтава)"
            data-testid="admin-np-sender"
            style={{ fontFamily: "Inter, monospace", fontSize: 13 }}
          />
          <span className={styles.hint}>
            Опційно: SettlementRef міста, з якого ми відправляємо. Використовується для розрахунку доставки. Якщо порожнє — Полтава за замовчуванням.
          </span>
        </div>

        <button type="button" className={styles.btnSecondary} onClick={onTestNp} disabled={testingNp} data-testid="admin-np-test">
          {testingNp ? "Перевіряємо…" : "Перевірити з'єднання"}
        </button>
      </div>

      {/* Save bar */}
      <div className={styles.panel} style={{ marginTop: 20 }}>
        <div className={styles.actions} style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <button type="button" className={styles.btnPrimary} onClick={save} disabled={saving} data-testid="admin-settings-save">
            {saving ? "Збереження…" : "Зберегти налаштування"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminNotifications;
