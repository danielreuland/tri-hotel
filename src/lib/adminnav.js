// Admin-Navigation: fünf Bereiche, Unterpunkte als Reiter auf der Seite.
// Der Bereich ergibt sich aus der Adresse; die Bezeichnung der Objekte (z. B. „Hotels“) kommt aus dem Standard-Ranking.
const db = require('../db');

const SECTIONS = [
  { key: 'aufgaben', label: 'Aufgaben', tabs: [{ href: '/admin/aufgaben', label: 'Board' }] },
  {
    key: 'objekte', label: null, // Beschriftung aus rankings.entity_label_pl
    tabs: [
      { href: '/admin', label: 'Liste', match: /^\/admin\/?$|^\/admin\/meldungen\// },
      { href: '/admin/neu', label: 'Anlegen' },
      { href: '/admin/google-orte', label: 'Google-IDs' },
    ],
  },
  {
    key: 'kommunikation', label: 'Kommunikation',
    tabs: [
      { href: '/admin/anfragen', label: 'Anfragen' },
      { href: '/admin/bewertungen', label: 'Bewertungen' },
      { href: '/admin/kontakt', label: 'Kontakt' },
    ],
  },
  {
    key: 'inhalte', label: 'Inhalte',
    tabs: [
      { href: '/admin/bilder', label: 'Objektbilder' },
      { href: '/admin/medien', label: 'Seitenbilder' },
      { href: '/admin/camps', label: 'Camps' },
      { href: '/admin/regionen', label: 'Regionen' },
      { href: '/admin/leistungen', label: 'Leistungen' },
      { href: '/admin/ki-texte', label: 'KI-Texte' },
    ],
  },
  {
    key: 'einstellungen', label: 'Einstellungen',
    tabs: [
      { href: '/admin/rankings', label: 'Rankings' },
      { href: '/admin/sites', label: 'Sites' },
      { href: '/admin/emails', label: 'E-Mail-Vorlagen' },
      { href: '/admin/team', label: 'Team' },
      { href: '/admin/log', label: 'Log' },
    ],
  },
];

const tabMatches = (tab, path) => (tab.match ? tab.match.test(path) : path === tab.href || path.startsWith(`${tab.href}/`));

function locate(path) {
  for (const s of SECTIONS) {
    const tab = s.tabs.find((t) => tabMatches(t, path));
    if (tab) return { section: s.key, tab: tab.href };
  }
  return { section: null, tab: null };
}

// Middleware für /admin: aktiver Bereich und Zähler (nur für angemeldete Admins)
async function middleware(req, res, next) {
  try {
    const path = req.originalUrl.split('?')[0].replace(/\/+$/, '') || '/admin';
    res.locals.adminNav = { sections: SECTIONS, ...locate(path), counts: {}, objectsLabel: 'Objekte' };
    if (req.session && req.session.admin) {
      const r = await db.one(
        `SELECT (SELECT entity_label_pl FROM rankings WHERE is_default LIMIT 1) AS label,
                (SELECT count(*)::int FROM admin_tasks WHERE status = 'open') AS aufgaben,
                (SELECT count(*)::int FROM reviews WHERE status = 'pending')
                  + (SELECT count(*)::int FROM contact_messages WHERE handled_at IS NULL)
                  + (SELECT count(*)::int FROM inquiry_answers WHERE status = 'pending') AS kommunikation`);
      res.locals.adminNav.counts = { aufgaben: r.aufgaben, kommunikation: r.kommunikation };
      if (r.label) res.locals.adminNav.objectsLabel = r.label;
    }
  } catch (err) {
    console.error('[adminnav]', err.message);
  }
  next();
}

module.exports = { SECTIONS, locate, middleware };
