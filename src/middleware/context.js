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
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return next(); // ältere Browser; Session-Cookie ist zusätzlich SameSite=Lax
  try {
    if (new URL(origin).host === req.get('host')) return next();
  } catch { /* ungültig */ }
  res.status(403).send('Ungültige Herkunft der Anfrage.');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  if (req.accepts(['html', 'json']) === 'json') return res.status(401).json({ error: 'login' });
  res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
}

module.exports = { rankingContext, sameOrigin, requireAdmin };
