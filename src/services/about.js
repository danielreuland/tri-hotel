// „Über uns“-Seite je Site: Vorlage unter views/sites/<code>/ueber.ejs, Metadaten in ueber.json.
// Ohne Vorlage gibt es die Seite für diese Site nicht (kein Link in Fußzeile, Methodik, Sitemap).
const fs = require('fs');
const path = require('path');
const reviews = require('./reviews');
const scoring = require('./scoring');
const seo = require('../lib/seo');

const SITES_DIR = path.join(__dirname, '..', 'views', 'sites');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const cache = new Map();

function pageFor(site) {
  if (!site || !/^[a-z0-9-]+$/.test(site.code)) return null;
  if (!cache.has(site.code)) {
    const tpl = path.join(SITES_DIR, site.code, 'ueber.ejs');
    const metaFile = path.join(SITES_DIR, site.code, 'ueber.json');
    cache.set(site.code, fs.existsSync(tpl)
      ? { view: `sites/${site.code}/ueber`, path: `/ueber-${site.code}`, meta: fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {} }
      : null);
  }
  return cache.get(site.code);
}

// Porträt als eigene Kopie auf dem Server: public/sites/<code>/ueber-portrait.jpg (quadratisch, auch .webp).
// Es steht klein neben dem Text, dafür reichen rund 700 px Kantenlänge. Solange die Datei fehlt, gibt es kein Bild
// (kein Platzhalter). Zum Urhebervermerk siehe credited().
// Zweites Bild „in Aktion“ unter dem Text: ueber-action.jpg (Querformat 3:2, rund 1100 px breit), gleiche Regeln.
function image(site, stem, dir = PUBLIC_DIR) {
  const file = ['webp', 'jpg'].map((ext) => path.join('sites', site.code, `${stem}.${ext}`)).find((f) => fs.existsSync(path.join(dir, f)));
  return file ? { src: `/static/${file.split(path.sep).join('/')}` } : null;
}
const photo = (site, dir) => image(site, 'ueber-portrait', dir);
const actionPhoto = (site, dir) => image(site, 'ueber-action', dir);

// Bild nur mit Datei und Urhebervermerk – oder mit ausdrücklichem Verzicht auf den Vermerk (ueber.json → no_credit: true,
// Entscheidung des Betreibers je Bild). Fehlt beides, wird das Bild nicht gezeigt.
function credited(meta, img) {
  if (!meta || !img || !(meta.credit || meta.no_credit === true)) return null;
  return { ...img, alt: meta.alt || '', credit: meta.credit || null };
}

// Stand der Seite (ueber.json → updated, JJJJ-MM-TT): sichtbar als „Stand: TT.MM.JJJJ“ und als dateModified
function updated(meta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((meta && meta.updated) || '');
  return m ? { iso: m[0], label: `${m[3]}.${m[2]}.${m[1]}` } : null;
}

// Profile des Gründers (ueber.json → founder.same_as): nur https-Adressen
const sameAsOf = (f) => (Array.isArray(f && f.same_as) ? f.same_as : []).filter((u) => /^https:\/\//.test(u));

// Sichtbare Profil-Links: Beschriftung aus dem Hostnamen (bekannte Netzwerke mit Namen, sonst die Domain)
const NETWORKS = { 'linkedin.com': 'LinkedIn', 'instagram.com': 'Instagram', 'strava.com': 'Strava', 'youtube.com': 'YouTube', 'facebook.com': 'Facebook' };
function profiles(f) {
  return sameAsOf(f).map((url) => {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return { url, label: NETWORKS[host] || host };
  });
}

// Gründer als Person: Name und URL, dazu Rolle, Porträt und weitere Profile (same_as), soweit vorhanden
function founderLd(f, siteUrl, portrait) {
  const sameAs = sameAsOf(f);
  return {
    '@type': 'Person', name: f.name, url: f.url,
    ...(f.job_title ? { jobTitle: f.job_title } : {}),
    ...(portrait ? { image: `${siteUrl}${portrait.src}` } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

// AboutPage mit Organization (die Site) und Gründer als Person. portrait: nur das freigegebene Bild (credited)
function aboutLd(site, siteUrl, page, portrait) {
  const f = page.meta.founder;
  const stand = updated(page.meta);
  return {
    '@context': 'https://schema.org', '@type': 'AboutPage',
    name: page.meta.title, description: page.meta.description, url: `${siteUrl}${page.path}`, inLanguage: 'de',
    ...(stand ? { dateModified: stand.iso } : {}),
    mainEntity: {
      '@type': 'Organization', name: site.primary_domain || site.name, url: `${siteUrl}/`,
      ...(page.meta.email ? { email: page.meta.email } : {}),
      ...(f ? { founder: founderLd(f, siteUrl, portrait || null) } : {}),
    },
  };
}

// Daten für die Vorlage. reviewsLive: Das Host-Ranking nimmt Bewertungen an.
function viewData(site, ranking, siteUrl) {
  const page = pageFor(site);
  if (!page || !ranking) return null;
  const m = page.meta;
  const reviewsLive = reviews.config(ranking).enabled;
  const portrait = credited(m.photo, photo(site));
  return {
    view: page.view,
    locals: {
      title: m.title, description: m.description, canonical: `${siteUrl}${page.path}`,
      jsonLd: [
        aboutLd(site, siteUrl, page, portrait),
        seo.breadcrumbLd([{ name: site.name, url: `${siteUrl}/` }, { name: m.breadcrumb || 'Über uns', url: `${siteUrl}${page.path}` }]),
      ],
      ranking, email: m.email, founder: m.founder || null,
      reviewsLive,
      // Bewertungen zählen erst im Score, wenn die Formel des Rankings sie einrechnet (wie auf der Methodik-Seite)
      scoreUsesReviews: reviewsLive && Boolean(scoring.withDefaults(ranking.formula).athlete_enabled),
      listHref: seo.listPath(ranking),
      photo: portrait,
      profiles: profiles(m.founder),
      updated: updated(m),
      action: credited(m.action, actionPhoto(site)),
    },
  };
}

module.exports = { pageFor, photo, actionPhoto, credited, updated, profiles, founderLd, aboutLd, viewData };
