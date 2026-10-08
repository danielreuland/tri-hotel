const rankings = require('../services/rankings');
const sites = require('../services/sites');
const { slugify } = require('../lib/util');

// Bestimmt Site (Marke) und das Ranking, das unter diesem Host auf "/" ausgeliefert wird:
// Domain der Site, Subdomain eines Rankings (z. B. rad.<site-domain>) oder das Standard-Ranking der Site.
async function rankingContext(req, res, next) {
  try {
    const { site, subdomain } = await sites.resolveHost(req.hostname);
    let ranking = null;
    if (site && subdomain) ranking = await rankings.getRankingBySubdomain(subdomain, site.id);
    if (site && !ranking) ranking = await rankings.getDefaultRanking(site.id);
    req.site = site;
    req.hostRanking = ranking;
    res.locals.site = site;
    res.locals.siteCss = sites.themeCss(site);
    res.locals.siteUrl = sites.urlFor(site);
    res.locals.hostRanking = ranking;
    res.locals.scorePath = ranking ? `/${slugify(ranking.score_name)}` : '/methodik';
    res.locals.admin = req.session && req.session.admin;
    res.locals.path = req.path;
    next();
  } catch (err) {
    next(err);
  }
}

// Einfacher CSRF-Schutz: schreibende Anfragen nur von der eigenen Seite.
// 1. Sec-Fetch-Site (moderne Browser): same-origin oder none (direkt eingegeben) erlaubt
// 2. sonst Origin/Referer mit dem Host vergleichen; fehlt beides (ältere Browser), hilft SameSite=Lax am Cookie
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const site = req.get('sec-fetch-site');
  if (site) return ['same-origin', 'none'].includes(site) ? next() : deny(res);
  const origin = req.get('origin');
  const source = origin && origin !== 'null' ? origin : req.get('referer');
  if (!source) return next();
  try {
    if (new URL(source).host === req.get('host')) return next();
  } catch { /* ungültig */ }
  deny(res);
}

function deny(res) {
  res.status(403).send('Ungültige Herkunft der Anfrage. Bitte die Seite neu laden und noch einmal versuchen.');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  if (req.accepts(['html', 'json']) === 'json') return res.status(401).json({ error: 'login' });
  res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
}

module.exports = { rankingContext, sameOrigin, requireAdmin };
