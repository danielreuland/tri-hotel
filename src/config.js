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

// Ganze Zahl ≥ 0 aus der Umgebung; leer oder ungültig = Standard (0 bleibt 0, z. B. als Sperre)
function int(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
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
      // Weiteres Postfach (Absender der ersten Anfrage-Mail, z. B. daniel@): wird nur gelesen, siehe services/mailbox.js
      extra: {
        user: process.env.IMAP_EXTRA_USER || null,
        pass: process.env.IMAP_EXTRA_PASS || null,
        days: Number(process.env.IMAP_EXTRA_DAYS || 14),
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
      // Gegenprüfung der Beschreibungstexte (jede Aussage gegen die Daten) – günstiges Modell reicht
      describe_check: process.env.LLM_MODEL_DESCRIBE_CHECK || 'claude-haiku-5-5',
      // Website eines Objekts per Websuche finden (services/website-finder.js)
      website: process.env.LLM_MODEL_WEBSITE || 'claude-sonnet-5-5',
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
  // Morgenbericht per Mail: ohne Adresse aus; Uhrzeit als Cron-Ausdruck nach Berliner Zeit
  dailyReport: {
    to: process.env.DAILY_REPORT_TO || null,
    cron: process.env.DAILY_REPORT_CRON || '0 7 * * *',
  },
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
  // Tripadvisor-Fotos über Terra (docs/tripadvisor-fotos-umsetzung.md). Not-Aus: nur TA_PHOTOS_ENABLED=true schaltet
  // Abrufe frei – ohne diesen Wert geht kein einziger Aufruf an Tripadvisor (weder Fotos noch Suche noch Allowlist).
  tripadvisor: {
    enabled: process.env.TA_PHOTOS_ENABLED === 'true',
    apiKey: process.env.TRIPADVISOR_API_KEY || null,
    // Grenzen in abrechenbaren Einheiten (Foto-Abruf = 1, Suche = 1 je zurückgegebener Location ID)
    monthlyLimit: int(process.env.TA_MONTHLY_LIMIT, 400),
    dailyLimit: int(process.env.TA_DAILY_LIMIT, 20),
    // Freikontingent einmalig je Konto, danach Preis je Einheit; Offset = außerhalb der App verbrauchte Einheiten
    freeUnits: int(process.env.TA_FREE_UNITS, 1000),
    unitPriceUsd: Number(process.env.TA_UNIT_PRICE_USD) > 0 ? Number(process.env.TA_UNIT_PRICE_USD) : 0.015,
    unitsOffset: int(process.env.TA_UNITS_OFFSET, 0),
    photoCount: Math.min(10, Math.max(1, int(process.env.TA_PHOTO_COUNT, 5))),
    searchSize: Math.min(20, Math.max(1, int(process.env.TA_SEARCH_SIZE, 3))),
    timeoutMs: int(process.env.TA_TIMEOUT_MS, 3000),
    // Auswahl: höchstens so viele Objekte mit Tripadvisor-Fotos; Location IDs ab diesem Score suchen
    maxHotels: int(process.env.TA_MAX_HOTELS, 10),
    minScore: int(process.env.TA_MIN_SCORE, 70),
    // Allowlist bei Tripadvisor pflegen (APPEND/DELETE); false nur, wenn das Paket keine Allowlist kennt
    allowlist: process.env.TA_ALLOWLIST !== 'false',
    viewLockMinutes: int(process.env.TA_VIEW_LOCK_MINUTES, 30),
    // Bilder dürfen nur von diesen Hosts geladen werden (CSP der Fotoseite und Prüfung der gelieferten Adressen)
    imageHosts: (process.env.TA_IMAGE_HOSTS || 'tripadvisor.com,tacdn.com').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
    // Größenangabe für das Bild-CDN (z. B. "w=1200&h=-1&s=1"); leer = Adresse unverändert wie geliefert
    photoParams: process.env.TA_PHOTO_PARAMS || '',
    // Links zur Tripadvisor-Seite des Objekts und zu „alle Fotos“; {id} = Location ID
    locationUrl: process.env.TA_LOCATION_URL || 'https://www.tripadvisor.de/Hotel_Review-d{id}',
    photosUrl: process.env.TA_PHOTOS_URL || 'https://www.tripadvisor.de/Hotel_Review-d{id}#/media',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || null,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
  },
  adminPasswordLogin: process.env.ADMIN_PASSWORD_LOGIN ? process.env.ADMIN_PASSWORD_LOGIN === 'true' : !process.env.GOOGLE_CLIENT_ID,
  // Interne API für den Hub danielreuland.com (docs/internal-api.md): "hub:<geheimnis>[,hub:<alt>]" – nur in der Server-.env
  internalApiKeys: process.env.INTERNAL_API_KEYS || '',
  // Ereignisse an den Hub (Richtung B); ohne Ziel werden sie nur protokolliert
  hubEvents: {
    url: process.env.HUB_EVENTS_URL || null,
    secret: process.env.HUB_EVENTS_SECRET || null,
  },
  verifyTokenHours: 72,
  userAgent: `RankingBot/0.1 (+${baseUrl})`,
};

if (module.exports.isProd && module.exports.sessionSecret === 'change-me') {
  throw new Error('SESSION_SECRET muss in Produktion gesetzt sein');
}
