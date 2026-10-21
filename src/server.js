const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const config = require('./config');
const db = require('./db');
const jobs = require('./jobs');
const { rankingContext, sameOrigin } = require('./middleware/context');
const { formatDate, MONTHS } = require('./lib/util');

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

const plausibleOrigin = config.plausibleSrc ? new URL(config.plausibleSrc).origin : null;
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...(plausibleOrigin ? [plausibleOrigin] : [])],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
        connectSrc: ["'self'", ...(plausibleOrigin ? [plausibleOrigin] : [])],
        // Google-Bewertungen: Einbettung erst nach Klick (Zwei-Klick-Lösung)
        frameSrc: ["'self'", ...(config.googleMapsEmbedKey ? ['https://www.google.com'] : [])],
      },
    },
    // Standard der Browser; mit "no-referrer" senden Formulare die Herkunft als "null"
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use(express.urlencoded({ extended: true, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProd ? '7d' : 0 }));
// Kartenbibliothek Leaflet aus dem eigenen Server (kein CDN, keine Datenübertragung an Dritte)
app.use('/static/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist'), { maxAge: config.isProd ? '30d' : 0 }));

app.use(
  session({
    store: new PgSession({ pool: db.pool, tableName: 'session' }),
    name: 'th_sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 8 * 60 * 60 * 1000 },
  })
);

app.locals.formatDate = formatDate;
app.locals.MONTHS = MONTHS;
app.locals.COUNTRIES = require('./lib/countries');
app.locals.baseUrl = config.baseUrl;
app.locals.noindexAll = config.noindex;
app.locals.plausibleSrc = config.plausibleSrc;
// Cache-Busting: neue Kennung je Start (Deploy), damit Browser geänderte CSS/JS sofort laden
app.locals.assetVersion = process.env.ASSET_VERSION || Date.now().toString(36);
app.locals.ldJson = require('./lib/seo').ldJson;
app.locals.fitTitle = require('./lib/seo').fitTitle;
app.locals.fitDescription = require('./lib/seo').fitDescription;
app.locals.googleMapsUrl = require('./lib/seo').googleMapsUrl;
app.locals.googleMapsEmbedUrl = (e) => require('./lib/seo').googleMapsEmbedUrl(e, config.googleMapsEmbedKey);
app.locals.monthRanges = require('./lib/seo').monthRanges;
app.locals.imgAttrs = require('./services/media').imgAttrs;
// Rechtstexte: Löschfristen direkt aus der Konfiguration, Stand der Texte
app.locals.retention = require('./services/retention').RETENTION;
app.locals.legalDate = '19. Oktober 2026';
app.locals.googleMapsEnabled = Boolean(config.googleMapsEmbedKey);
app.locals.entityImgAttrs = require('./services/media').entityImgAttrs;

// Vorab-Phase: nichts indexieren
if (config.noindex) {
  app.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
}


app.use(sameOrigin);
app.use(rankingContext);

app.use('/admin', require('./lib/adminnav').middleware);
app.use('/admin', require('./routes/admin'));
app.use('/admin/rankings', require('./routes/admin-rankings'));
app.use('/admin/sites', require('./routes/admin-sites'));
app.use('/admin/leistungen', require('./routes/admin-features'));
app.use('/admin/regionen', require('./routes/admin-regions'));
app.use('/admin/radreviere', require('./routes/admin-bike'));
app.use('/admin/medien', require('./routes/admin-media'));
app.use('/admin/emails', require('./routes/admin-emails'));
app.use('/admin/camps', require('./routes/admin-camps'));
app.use('/admin/bewertungen', require('./routes/admin-reviews'));
app.use('/admin/partner', require('./routes/admin-partners'));
app.use('/admin/camp-anfragen', require('./routes/admin-leads'));
app.use('/admin/postfach', require('./routes/admin-mail'));
app.use('/', require('./routes/submit'));
app.use('/', require('./routes/contact'));
app.use('/', require('./routes/camps'));
app.use('/', require('./routes/partners'));
app.use('/', require('./routes/reviews'));
app.use('/', require('./routes/inquiry'));
app.use('/', require('./routes/seo'));
app.use('/', require('./routes/public'));

app.use((req, res) => res.status(404).render('public/error', { title: 'Nicht gefunden', message: 'Diese Seite gibt es nicht.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('public/error', { title: 'Fehler', message: 'Da ist etwas schiefgelaufen. Bitte versuche es später noch einmal.' });
});

// PM2 im Cluster-Modus lädt das Skript über einen eigenen Container – dann ist require.main nicht dieses Modul
if (require.main === module || process.env.pm_id !== undefined) {
  const server = app.listen(config.port, config.host, async () => {
    console.log(`Server läuft auf Port ${config.port}`);
    try {
      await jobs.start();
    } catch (err) {
      console.error('[jobs] Start fehlgeschlagen:', err.message);
    }
  });

  // Sauber beenden (PM2 schickt beim Reload SIGINT): keine neuen Verbindungen, laufende Jobs fertig, dann Ende
  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[server] ${signal} – fahre herunter`);
    server.close();
    try {
      await jobs.stop();
    } catch (err) {
      console.error('[jobs] Stopp fehlgeschlagen:', err.message);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;
