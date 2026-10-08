const path = require('path');
const express = require('express');
const helmet = require('helmet');
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

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProd ? '7d' : 0 }));

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

// Vorab-Phase: nichts indexieren
if (config.noindex) {
  app.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
}
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(config.noindex ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nDisallow: /admin\nDisallow: /anfrage/\nDisallow: /bestaetigen/\n');
});

app.use(sameOrigin);
app.use(rankingContext);

app.use('/admin', require('./routes/admin'));
app.use('/admin/rankings', require('./routes/admin-rankings'));
app.use('/admin/sites', require('./routes/admin-sites'));
app.use('/admin/leistungen', require('./routes/admin-features'));
app.use('/', require('./routes/submit'));
app.use('/', require('./routes/inquiry'));
app.use('/', require('./routes/public'));

app.use((req, res) => res.status(404).render('public/error', { title: 'Nicht gefunden', message: 'Diese Seite gibt es nicht.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('public/error', { title: 'Fehler', message: 'Da ist etwas schiefgelaufen. Bitte versuche es später noch einmal.' });
});

if (require.main === module) {
  app.listen(config.port, async () => {
    console.log(`Server läuft auf Port ${config.port}`);
    try {
      await jobs.start();
    } catch (err) {
      console.error('[jobs] Start fehlgeschlagen:', err.message);
    }
  });
}

module.exports = app;
