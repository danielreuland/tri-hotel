require('dotenv').config();
const path = require('path');

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    console.error('[config] Ungültiges JSON in LLM_PRICES – Standardpreise werden verwendet');
    return fallback;
  }
}

const baseUrl = (process.env.BASE_URL || 'http://localhost:3010').replace(/\/$/, '');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3010),
  // hinter Nginx: nur intern lauschen (HOST=127.0.0.1); ohne Angabe alle Schnittstellen
  host: process.env.HOST || '0.0.0.0',
  baseUrl,
  baseHost: new URL(baseUrl).hostname,
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET || 'change-me',
  mail: {
    provider: process.env.MAIL_PROVIDER || 'console',
    from: process.env.MAIL_FROM || 'hallo@tri-hotel.de',
    replyTo: process.env.MAIL_REPLY_TO || null,          // Antworten von Betreibern landen hier
    adminNotify: process.env.ADMIN_NOTIFY_EMAIL || null, // Hinweis an den Admin bei eingehenden Antworten
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Absender der Agenten (Mia, Lara, Ben): 'site' = Sammeladresse der Site mit Agentennamen
    // (z. B. "Mia · tri-hotel.de" <info@…>), 'own' = eigene Adresse der Persona (braucht Aliase, z. B. Google Workspace)
    personaSender: process.env.MAIL_PERSONA_SENDER === 'own' ? 'own' : 'site',
    // Empfang: 'none' oder 'imap' (später z. B. 'gmail'); IMAP-Zugang ohne Angabe wie SMTP
    inbound: {
      provider: process.env.MAIL_INBOUND || 'none',
      imap: {
        host: process.env.IMAP_HOST,
        port: Number(process.env.IMAP_PORT || 993),
        user: process.env.IMAP_USER || process.env.SMTP_USER,
        pass: process.env.IMAP_PASS || process.env.SMTP_PASS,
        folder: process.env.IMAP_FOLDER || 'INBOX',
        doneFolder: process.env.IMAP_DONE_FOLDER || 'Verarbeitet',
      },
    },
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'none',
    apiKey: process.env.LLM_API_KEY,
    // nur für Schlüssel, die keinem Workspace zugeordnet sind (Header anthropic-workspace-id)
    workspaceId: process.env.LLM_WORKSPACE_ID || null,
    // Modell je Aufgabe – z. B. Sonnet für die Extraktion, wenn der Modellvergleich das hergibt
    models: {
      extract: process.env.LLM_MODEL_EXTRACT || 'claude-opus-5-5',
      inquiry: process.env.LLM_MODEL_INQUIRY || 'claude-opus-5-5',
      describe: process.env.LLM_MODEL_DESCRIBE || 'claude-sonnet-5-5',
    },
    // Preise je 1 Mio. Tokens überschreiben, z. B. {"opus":{"input":5,"output":25}}
    prices: parseJson(process.env.LLM_PRICES, {}),
    // Obergrenze je Kalendermonat in US-Dollar (leer = keine); zusätzlich zum Limit in der Claude Console
    monthlyBudgetUsd: Number(process.env.LLM_MONTHLY_BUDGET_USD) || null,
  },
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  // Vorab-Phase: Login über HTTP-Tunnel erlauben (COOKIE_SECURE=false) und Suchmaschinen aussperren (NOINDEX=true)
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  noindex: process.env.NOINDEX === 'true',
  // Plausible (ohne Cookies), z. B. https://analytics.triprep.de/js/script.outbound-links.tagged-events.js
  plausibleSrc: process.env.PLAUSIBLE_SRC || null,
  // Stats API fürs Admin-Dashboard (Schlüssel aus Plausible → Einstellungen → API-Schlüssel); URL sonst aus PLAUSIBLE_SRC
  plausibleApiKey: process.env.PLAUSIBLE_API_KEY || null,
  plausibleApiUrl: process.env.PLAUSIBLE_API_URL || null,
  // Admin-Login: Google (empfohlen) und optional Passwort
  // Maps Embed API (Zwei-Klick-Karte mit Google-Bewertungen); Schlüssel auf die eigenen Domains beschränken
  googleMapsEmbedKey: process.env.GOOGLE_MAPS_EMBED_KEY || null,
  // Places API (New) nur serverseitig für die Suche nach der Place ID; Schlüssel auf die Server-IP beschränken
  googlePlacesKey: process.env.GOOGLE_PLACES_KEY || null,
  // Hunter.io: dritte Quelle für die Kontaktadresse (nur allgemeine Firmenadressen), mit Monatsgrenze je Abfrage
  hunter: {
    apiKey: process.env.HUNTER_API_KEY || null,
    monthlyLimit: Number(process.env.HUNTER_MONTHLY_LIMIT) || 40,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || null,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
  },
  adminPasswordLogin: process.env.ADMIN_PASSWORD_LOGIN ? process.env.ADMIN_PASSWORD_LOGIN === 'true' : !process.env.GOOGLE_CLIENT_ID,
  verifyTokenHours: 72,
  userAgent: `RankingBot/0.1 (+${baseUrl})`,
};

if (module.exports.isProd && module.exports.sessionSecret === 'change-me') {
  throw new Error('SESSION_SECRET muss in Produktion gesetzt sein');
}
