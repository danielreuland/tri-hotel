// Trainingsregionen: Übersicht aller Regionen (Klima je Monat, Wasser, Wind, Radrevier, Hotels, Camps) mit Auswahl
// „Ich reise im …“ und Direktvergleich von 2–3 Regionen unter /trainingsregionen/vergleich/a-vs-b.
const express = require('express');
const guide = require('../services/region-guide');
const seo = require('../lib/seo');
const { MONTHS } = require('../lib/util');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const fmt = (v, digits = 0) => (v === null || v === undefined ? '–'
  : Number(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }));

function viewHelpers(ranking) {
  return {
    fmt,
    METRICS: guide.METRICS,
    monthValue: guide.monthValue,
    yearRange: guide.yearRange,
    bestText: (months) => seo.monthRanges(months, MONTHS),
    regionPath: (r) => `/region/${r.slug}`,
    seaTip: (r) => `Wassertemperatur vor der Küste: Mittel aus ${r.seaPoints === 1 ? 'einem Küstenpunkt' : `${r.seaPoints} Küstenpunkten`} der Region `
      + '(Modellwert von Open-Meteo, Raster etwa 8–9 km). Am Strand und in flachen Buchten ist es im Sommer oft 1–2 °C wärmer, an windigen Küsten auch kühler.',
    climateTip: (r) => guide.climatePointNote(r.region),
    scoreName: ranking.score_name,
  };
}

router.get('/trainingsregionen', wrap(async (req, res, next) => {
  const ranking = req.hostRanking;
  if (!ranking || !(await guide.hasRegions(req.site.id))) return next();
  // Zeitraum: einzelner Monat oder Jahreszeit (?monat=3 bzw. ?monat=winter)
  const period = guide.parsePeriod(req.query.monat, MONTHS);
  const month = period ? period.month : null;
  const months = period ? period.months : [];
  const sort = guide.SORTS[req.query.sortierung] ? req.query.sortierung : 'standard';
  const rows = guide.sortRegions(await guide.load(ranking, req.site.id, { month }), { sort, month: months, formula: ranking.formula });
  const siteUrl = res.locals.siteUrl;
  const crumbs = [{ name: ranking.name, url: `${siteUrl}/` }, { name: 'Trainingsregionen', url: `${siteUrl}/trainingsregionen` }];
  res.render('public/regions', {
    title: period ? `Trainingsregionen ${period.label} – Klima, Wasser, Radrevier` : 'Trainingsregionen im Überblick – Klima, Wasser, Radrevier',
    description: `Trainingsregionen im Überblick: Temperatur, Regentage, Sonne, Wind und Wassertemperatur je Monat, Radrevier aus OpenStreetMap, geprüfte ${ranking.entity_label_pl} mit ${ranking.score_name}.`,
    canonical: `${siteUrl}/trainingsregionen`,
    noindex: Boolean(period) || sort !== 'standard',
    jsonLd: [seo.breadcrumbLd(crumbs)],
    rows, period, months, sort, ranking, crumbs,
    sorts: guide.SORTS,
    seasons: guide.SEASONS,
    sortText: guide.sortText(sort, period, ranking.formula),
    compareError: req.query.vergleich === 'zu-wenig',
    scripts: ['/static/js/regions.js'],
    ...viewHelpers(ranking),
  });
}));

// Formular der Übersicht → sprechende Vergleichs-URL
router.get('/trainingsregionen/vergleich', (req, res) => {
  const slugs = guide.parsePair([].concat(req.query.r || []).join('-vs-'));
  if (slugs.length < 2) return res.redirect('/trainingsregionen?vergleich=zu-wenig#vergleich');
  res.redirect(`/trainingsregionen/vergleich/${guide.pairSlug(slugs)}`);
});

router.get('/trainingsregionen/vergleich/:pair', wrap(async (req, res, next) => {
  const ranking = req.hostRanking;
  if (!ranking) return next();
  const slugs = guide.parsePair(req.params.pair);
  if (slugs.length < 2) return next();
  const rows = await guide.load(ranking, req.site.id, { slugs });
  if (rows.length < 2) return next();
  // Kanonische Schreibweise (z. B. doppelte oder ungültige Slugs entfernt)
  const canonicalPair = guide.pairSlug(rows.map((r) => r.slug));
  if (canonicalPair !== req.params.pair) return res.redirect(301, `/trainingsregionen/vergleich/${canonicalPair}`);
  const siteUrl = res.locals.siteUrl;
  const heading = rows.map((r) => r.name).join(' vs. ');
  const crumbs = [
    { name: ranking.name, url: `${siteUrl}/` },
    { name: 'Trainingsregionen', url: `${siteUrl}/trainingsregionen` },
    { name: heading, url: `${siteUrl}/trainingsregionen/vergleich/${canonicalPair}` },
  ];
  res.render('public/regions-compare', {
    title: `${heading} – Trainingsregionen im Vergleich`,
    description: `${heading}: Temperatur, Regentage, Sonne, Wind und Wassertemperatur je Monat, Radrevier und ${ranking.entity_label_pl} im direkten Vergleich.`,
    canonical: `${siteUrl}/trainingsregionen/vergleich/${canonicalPair}`,
    // Kombinationen nicht indexieren (sonst sehr viele ähnliche Seiten)
    noindex: true,
    jsonLd: [seo.breadcrumbLd(crumbs)],
    rows, heading, ranking, crumbs,
    metricKeys: ['avg_high_c', 'avg_low_c', 'rain_days', 'sunshine_h', 'wind_kmh', 'windy_days', 'sea_c'],
    ...viewHelpers(ranking),
  });
}));

module.exports = router;
