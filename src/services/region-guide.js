// Trainingsregionen, Schritt 2: Übersicht und Direktvergleich aller Regionen einer Site.
// Nur Daten mit Quelle (Klima/Wasser: Open-Meteo, Radrevier: OpenStreetMap) – Regionen bekommen keinen eigenen Score.
// Die Sortierung „Eignung“ nutzt die beste Reisezeit aus rankings.formula.best_time (keine Grenzwerte im Code).
const db = require('../db');
const areas = require('./areas');
const seo = require('../lib/seo');

const TTL_MS = 5 * 60 * 1000;
const hasCache = new Map();

// Hat die Site aktive Regionen? (für den Menüpunkt, kurz zwischengespeichert)
async function hasRegions(siteId) {
  if (!siteId) return false;
  const hit = hasCache.get(siteId);
  if (hit && hit.at > Date.now() - TTL_MS) return hit.value;
  const row = await db.one(`SELECT EXISTS (SELECT 1 FROM regions WHERE site_id = $1 AND status = 'active') AS x`, [siteId]);
  const value = Boolean(row && row.x);
  hasCache.set(siteId, { at: Date.now(), value });
  return value;
}

// Klimagrößen: Beschriftung, Einheit, Richtung (höher besser = -1 beim Sortieren absteigend)
const METRICS = {
  avg_high_c: { label: 'Ø Höchsttemperatur', short: 'Ø max', unit: '°C' },
  avg_low_c: { label: 'Ø Tiefsttemperatur', short: 'Ø min', unit: '°C' },
  rain_days: { label: 'Regentage', short: 'Regentage', unit: 'Tage' },
  sunshine_h: { label: 'Sonnenstunden je Tag', short: 'Sonne', unit: 'h' },
  wind_kmh: { label: 'Ø Wind', short: 'Wind', unit: 'km/h' },
  windy_days: { label: 'Tage mit Sturmböen ab 40 km/h', short: 'Böentage', unit: 'Tage' },
  sea_c: { label: 'Wassertemperatur', short: 'Wasser', unit: '°C' },
};

// Jahreszeiten (Kalender, für alle Rankings gleich). Startseite zeigt die Jahreszeit in zwei Monaten (Vorausplanung).
const SEASONS = {
  winter: { label: 'Winter', months: [12, 1, 2], note: 'Sonne und Wärme, wenn es zu Hause kalt ist' },
  fruehjahr: { label: 'Frühjahr', months: [3, 4, 5], note: 'Saisonvorbereitung: Grundlagen im Warmen' },
  sommer: { label: 'Sommer', months: [6, 7, 8], note: 'Höhe, Seen und Küsten – wo es nicht zu heiß wird' },
  herbst: { label: 'Herbst', months: [9, 10, 11], note: 'Saisonausklang und Neustart in der Wärme' },
};

function seasonFor(date = new Date()) {
  const m = ((date.getMonth() + 2) % 12) + 1;
  return Object.keys(SEASONS).find((k) => SEASONS[k].months.includes(m));
}

// Zeitraum aus ?monat=…: Monat 1–12 oder Jahreszeit (winter, fruehjahr …). months: Liste der Monate, label: „im Januar“
function parsePeriod(q, monthNames) {
  const n = Number(q);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return { key: String(n), month: n, months: [n], label: `im ${monthNames[n - 1]}`, name: monthNames[n - 1] };
  const s = SEASONS[q];
  if (s) return { key: q, month: null, months: s.months, label: `im ${s.label}`, name: s.label, season: q, note: s.note };
  return null;
}

// Sortierungen der Übersicht. key: Wert je Region (Zeitraum oder Jahresmittel), dir: 1 aufsteigend, -1 absteigend
const SORTS = {
  standard: { label: 'Eignung im Zeitraum' },
  sonne: { label: 'Meiste Sonne', metric: 'sunshine_h', dir: -1 },
  regen: { label: 'Wenigste Regentage', metric: 'rain_days', dir: 1 },
  wasser: { label: 'Wärmstes Wasser', metric: 'sea_c', dir: -1 },
  wind: { label: 'Wenigster Wind', metric: 'wind_kmh', dir: 1 },
  rad: { label: 'Radrevier', dir: -1 },
};

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Wert einer Klimagröße im Monat (1–12), als Mittel mehrerer Monate (Jahreszeit) oder ohne Angabe als Jahresmittel
function monthValue(climate, metric, month) {
  const months = Array.isArray(month) ? month : month ? [month] : null;
  const rows = months ? climate.filter((c) => months.includes(Number(c.month))) : climate;
  const v = rows.map((c) => num(c[metric])).filter((x) => x !== null);
  if (!v.length) return null;
  return v.length === 1 ? v[0] : Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10;
}

// Spanne über das Jahr (für die Übersicht ohne Monat), z. B. {min: 15, max: 29}
function yearRange(climate, metric) {
  const v = climate.map((c) => num(c[metric])).filter((x) => x !== null);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}

function inBestTime(value, bt) {
  if (value === null || !bt) return false;
  return (bt.min === undefined || value >= Number(bt.min)) && (bt.max === undefined || value <= Number(bt.max));
}

// Erklärung der Sortierung in Worten (aus der Formel des Rankings). period: aus parsePeriod oder null
function sortText(sort, period, formula) {
  const bt = (formula || {}).best_time;
  const s = SORTS[sort] || SORTS.standard;
  if (sort === 'rad') return 'Sortiert nach der Radrevier-Bewertung aus OpenStreetMap (0–6).';
  if (s.metric) return `Sortiert nach ${METRICS[s.metric].label} ${period ? period.label : 'im Jahresmittel'}; Regionen ohne Wert am Ende.`;
  if (!period) return 'Reihenfolge der Redaktion. Wähle Reisemonat oder Jahreszeit, um nach Eignung zu sortieren.';
  if (!bt || !bt.metric || !METRICS[bt.metric]) return `Sortiert nach Regentagen ${period.label}.`;
  const range = bt.min !== undefined && bt.max !== undefined ? `zwischen ${bt.min} und ${bt.max} ${METRICS[bt.metric].unit}`
    : bt.min !== undefined ? `ab ${bt.min} ${METRICS[bt.metric].unit}` : `bis ${bt.max} ${METRICS[bt.metric].unit}`;
  if (period.months.length > 1) {
    return `Zuerst Regionen mit den meisten Monaten ${period.label}, deren ${METRICS[bt.metric].label} ${range} liegt (beste Reisezeit), dann nach wenigen Regentagen.`;
  }
  return `Zuerst Regionen, deren ${METRICS[bt.metric].label} ${period.label} ${range} liegt (beste Reisezeit), dann nach wenigen Regentagen.`;
}

// Regionen sortieren (rein, testbar). rows: [{ climate, bike, sort_order, name }]
function sortRegions(rows, { sort = 'standard', month = null, formula = {} } = {}) {
  const s = SORTS[sort] ? sort : 'standard';
  const bt = (formula || {}).best_time;
  const byName = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'de');
  const cmpNum = (va, vb, dir) => {
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va - vb) * dir;
  };
  const list = [...rows];
  if (s === 'rad') return list.sort((a, b) => cmpNum(a.bike ? num(a.bike.score) : null, b.bike ? num(b.bike.score) : null, -1) || byName(a, b));
  if (SORTS[s].metric) {
    const m = SORTS[s].metric;
    return list.sort((a, b) => cmpNum(monthValue(a.climate, m, month), monthValue(b.climate, m, month), SORTS[s].dir) || byName(a, b));
  }
  if (!month || (Array.isArray(month) && !month.length)) return list.sort(byName);
  // Eignung: Anzahl Monate des Zeitraums in der besten Reisezeit (ein Monat: 0 oder 1)
  const months = Array.isArray(month) ? month : [month];
  const fit = (r) => (bt && bt.metric ? months.filter((m) => inBestTime(monthValue(r.climate, bt.metric, m), bt)).length : 0);
  return list.sort((a, b) => (fit(b) - fit(a))
    || cmpNum(monthValue(a.climate, 'rain_days', month), monthValue(b.climate, 'rain_days', month), 1)
    || byName(a, b));
}

// Kennzahlen des Radreviers (aus bike_areas.metrics)
function bikeFacts(row) {
  if (!row || row.score === null || row.score === undefined) return null;
  const m = row.metrics || {};
  const roads = m.roads || {};
  const terrain = m.terrain || {};
  return {
    score: num(row.score),
    quietKm: num(roads.quietKm),
    networkKm: num(roads.networkKm),
    quietShare: num(roads.quietShare),
    passes: num(roads.passes),
    passMaxM: num(roads.passMaxM),
    reliefM: num(terrain.reliefM),
    flatShare: num(terrain.flatShare),
    routes: num(roads.routes),
    computedAt: row.computed_at,
  };
}

const de = (v, digits = 0) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Gelände in Worten nach Höhenunterschied im Gebiet (Meter); gilt für jedes Radrevier, unabhängig vom Ranking
const RELIEF_WORDS = [[300, 'überwiegend flach'], [900, 'hügelig'], [Infinity, 'bergig']];

// Radrevier in Sätzen (rein, testbar). b: aus bikeFacts
function bikeText(b) {
  if (!b) return [];
  const out = [];
  if (b.reliefM !== null) {
    const word = RELIEF_WORDS.find(([max]) => b.reliefM < max)[1];
    const flat = b.flatShare !== null && word === 'bergig' && b.flatShare >= 0.25 ? ', mit flachen Abschnitten' : '';
    out.push(`Gelände ${word}${flat}: ${de(b.reliefM)} m Höhenunterschied im Gebiet.`);
  }
  if (b.passes) out.push(`${de(b.passes)} ${b.passes === 1 ? 'Pass' : 'Pässe'} in OpenStreetMap${b.passMaxM ? `, der höchste auf ${de(b.passMaxM)} m` : ''}.`);
  if (b.quietKm !== null) {
    const share = b.quietShare !== null ? ` – ${de(b.quietShare * 100)} % des Straßennetzes` : '';
    out.push(`Rund ${de(b.quietKm)} km ruhige Nebenstraßen${share}.`);
  }
  if (b.routes) out.push(`${de(b.routes)} ausgeschilderte Radrouten.`);
  return out;
}

// Beste Reisezeit mit Begründung (rein, testbar): Regel aus formula.best_time, Monate innerhalb und außerhalb,
// dazu Auffälligkeiten bei Regen, Sonne, Wind und Wasser. Rückgabe { rule, best, outside: [], notes: [] }
function bestTimeReasons(climate, formula, monthNames) {
  const out = { rule: null, best: null, outside: [], notes: [] };
  const rows = (climate || []).map((c) => ({ ...c, month: Number(c.month) }));
  if (!rows.length) return out;
  const val = (c, k) => num(c[k]);
  const ranges = (list) => seo.monthRanges(list.map((c) => c.month), monthNames);
  const bt = (formula || {}).best_time;
  if (bt && bt.metric && METRICS[bt.metric]) {
    const M = METRICS[bt.metric];
    const range = bt.min !== undefined && bt.max !== undefined ? `zwischen ${bt.min} und ${bt.max} ${M.unit}`
      : bt.min !== undefined ? `ab ${bt.min} ${M.unit}` : `bis ${bt.max} ${M.unit}`;
    out.rule = `Monate mit ${M.label} ${range}`;
    const best = rows.filter((c) => inBestTime(val(c, bt.metric), bt));
    out.best = best.length ? ranges(best) : null;
    const above = rows.filter((c) => bt.max !== undefined && val(c, bt.metric) !== null && val(c, bt.metric) > Number(bt.max));
    const below = rows.filter((c) => bt.min !== undefined && val(c, bt.metric) !== null && val(c, bt.metric) < Number(bt.min));
    // Eine Nachkommastelle, wenn der gerundete Wert sonst wie die Grenze aussähe (15,6 °C „unter 16“)
    const near = (v, limit) => (Math.round(v) === Number(limit) ? de(v, 1) : de(v));
    if (above.length) {
      const v = Math.max(...above.map((c) => val(c, bt.metric)));
      out.outside.push(`${ranges(above)} darüber (bis ${near(v, bt.max)} ${M.unit})`);
    }
    if (below.length) {
      const v = Math.min(...below.map((c) => val(c, bt.metric)));
      out.outside.push(`${ranges(below)} darunter (ab ${near(v, bt.min)} ${M.unit})`);
    }
  }
  const ext = (k, dir) => {
    const list = rows.filter((c) => val(c, k) !== null);
    if (!list.length) return null;
    return list.reduce((a, b) => ((val(b, k) - val(a, k)) * dir > 0 ? b : a));
  };
  const name = (c) => monthNames[c.month - 1];
  const wet = ext('rain_days', 1);
  const dry = ext('rain_days', -1);
  if (wet && dry && val(wet, 'rain_days') > val(dry, 'rain_days')) {
    out.notes.push(`Am meisten Regen im ${name(wet)} (${de(val(wet, 'rain_days'))} Regentage), am wenigsten im ${name(dry)} (${de(val(dry, 'rain_days'))}).`);
  }
  const sun = ext('sunshine_h', 1);
  if (sun) out.notes.push(`Am sonnigsten im ${name(sun)} (${de(val(sun, 'sunshine_h'))} Sonnenstunden am Tag).`);
  const wind = ext('wind_kmh', 1);
  if (wind) {
    const gusts = val(wind, 'windy_days');
    out.notes.push(`Am windigsten im ${name(wind)} (Ø ${de(val(wind, 'wind_kmh'))} km/h${gusts ? `, ${de(gusts)} Tage mit Sturmböen` : ''}).`);
  }
  const warm = ext('sea_c', 1);
  const cold = ext('sea_c', -1);
  if (warm && cold) out.notes.push(`Wasser am wärmsten im ${name(warm)} (${de(val(warm, 'sea_c'))} °C), am kühlsten im ${name(cold)} (${de(val(cold, 'sea_c'))} °C).`);
  return out;
}

// Häufige Fragen zur Region, nur aus unseren Daten (rein, testbar). Rückgabe [{ q, a }]
// region: { nameIn }, ranking: { entity_label_sg/pl, score_name, formula }, climate, bike (bikeFacts),
// hotels: { count, top: { name, score } | null }, camps: [Name]
function regionFaq({ region, ranking, climate = [], bike = null, hotels = { count: 0, top: null }, camps = [] }, monthNames) {
  const out = [];
  const mName = (c) => monthNames[Number(c.month) - 1];
  const reasons = bestTimeReasons(climate, ranking.formula, monthNames);
  if (reasons.rule) {
    out.push({
      q: `Wann ist die beste Reisezeit ${region.nameIn}?`,
      a: reasons.best
        ? `${reasons.best}. Als beste Reisezeit gelten hier ${reasons.rule}${reasons.outside.length ? ` – ${reasons.outside.join('; ')}` : ''}.`
        : `Kein Monat liegt im Bereich der besten Reisezeit (${reasons.rule}).`,
    });
  }
  const sea = climate.filter((c) => num(c.sea_c) !== null);
  if (sea.length) {
    const lo = sea.reduce((a, b) => (num(b.sea_c) < num(a.sea_c) ? b : a));
    const hi = sea.reduce((a, b) => (num(b.sea_c) > num(a.sea_c) ? b : a));
    const spring = sea.filter((c) => [3, 4, 5].includes(Number(c.month))).sort((a, b) => a.month - b.month);
    out.push({
      q: `Wie warm ist das Meer ${region.nameIn}?`,
      a: `Zwischen ${de(lo.sea_c)} °C im ${mName(lo)} und ${de(hi.sea_c)} °C im ${mName(hi)}.`
        + (spring.length ? ` Von März bis Mai: ${spring.map((c) => `${de(c.sea_c)} °C`).join(', ')}.` : '')
        + ' Modellwerte vor der Küste, Mittel der letzten drei Jahre.',
    });
  }
  const rain = climate.filter((c) => num(c.rain_days) !== null);
  if (rain.length) {
    const total = rain.reduce((s, c) => s + num(c.rain_days), 0);
    const wet = rain.reduce((a, b) => (num(b.rain_days) > num(a.rain_days) ? b : a));
    out.push({
      q: `Wie oft regnet es ${region.nameIn}?`,
      a: `Im Jahr gibt es rund ${de(total)} Tage mit mindestens 1 mm Regen, die meisten im ${mName(wet)} (${de(wet.rain_days)} Tage).`,
    });
  }
  if (bike && bike.score !== null && bike.score !== undefined) {
    out.push({ q: `Wie gut ist das Radrevier ${region.nameIn}?`, a: `${de(bike.score, 1)} von 6 Punkten in unserer Auswertung von OpenStreetMap. ${bikeText(bike).join(' ')}`.trim() });
  }
  if (hotels.count) {
    out.push({
      q: `Wie viele geprüfte ${ranking.entity_label_pl} gibt es ${region.nameIn}?`,
      a: `${hotels.count} geprüfte${hotels.count === 1 ? 's' : ''} ${hotels.count === 1 ? ranking.entity_label_sg : ranking.entity_label_pl}.`
        + `${hotels.top ? ` Den höchsten ${ranking.score_name} hat derzeit ${hotels.top.name} (${hotels.top.score}).` : ''}`
        + ` Die Liste ist nur nach ${ranking.score_name} sortiert.`,
    });
  }
  if (camps.length) {
    out.push({
      q: `Gibt es organisierte Trainingscamps ${region.nameIn}?`,
      a: `Ja, ${camps.length} Anbieter ${camps.length === 1 ? 'hat' : 'haben'} hier Camps im Programm: ${camps.slice(0, 6).join(', ')}${camps.length > 6 ? ' und weitere' : ''}.`,
    });
  }
  return out;
}

// Herkunft der Klimawerte einer Region in einem Satz (Tooltip und Quellenhinweis)
const POINT_WHERE = { hotels: 'an der Lage der Hotels', auto: 'an einem tiefer gelegenen Ort nahe der Regionsmitte', admin: 'an einem typischen Trainingsort', center: 'in der Regionsmitte' };
function climatePointNote(region) {
  const p = region && region.climate_point;
  if (!p) return 'Klima von Open-Meteo, Mittel der letzten drei vollen Jahre.';
  const bits = [p.place, p.elevation_m !== null && p.elevation_m !== undefined ? `${p.elevation_m} m` : null].filter(Boolean);
  return `Klima ${POINT_WHERE[p.source] || ''}${bits.length ? ` (${bits.join(', ')})` : ''} – Modellwerte von Open-Meteo, Mittel der letzten drei vollen Jahre. `
    + 'In höheren Lagen ist es kühler, je 100 m etwa 0,6 °C.';
}

// Alle Daten je Region für Übersicht und Vergleich
async function load(ranking, siteId, { month = null, slugs = null } = {}) {
  let regionList = await areas.regions(siteId);
  if (slugs) regionList = slugs.map((s) => regionList.find((r) => r.slug === s)).filter(Boolean);
  if (!regionList.length) return [];
  const ids = regionList.map((r) => r.id);
  const [climateRows, bikeRows, campRows, live] = await Promise.all([
    db.many('SELECT * FROM region_climate_monthly WHERE region_id = ANY($1::uuid[]) ORDER BY month', [ids]),
    db.many('SELECT * FROM bike_areas WHERE key = ANY($1::text[])', [ids.map((id) => `region:${id}`)]),
    db.many(`SELECT regions FROM camp_providers WHERE site_id = $1 AND status = 'active'`, [siteId]),
    ranking ? areas.liveWithRank(ranking, month) : { ranked: [], incomplete: [] },
  ]);
  const bt = ranking ? (ranking.formula || {}).best_time : null;
  return regionList.map((r) => {
    const climate = climateRows.filter((c) => c.region_id === r.id);
    const ranked = live.ranked.filter((e) => seo.inRegion(e, r));
    const incomplete = live.incomplete.filter((e) => seo.inRegion(e, r));
    const scores = ranked.map((e) => e.score).filter((s) => s !== null && s !== undefined);
    const seaPoints = r.sea_point && Array.isArray(r.sea_point.points) ? r.sea_point.points.length : 0;
    return {
      region: r,
      slug: r.slug,
      name: r.name,
      sort_order: r.sort_order,
      country: r.country,
      countryName: seo.countryName(r.country),
      climate,
      hasSea: climate.some((c) => c.sea_c !== null),
      seaPoints,
      bestMonths: bt ? seo.bestMonths(ranking.formula, climate) : [],
      bike: bikeFacts(bikeRows.find((b) => b.key === `region:${r.id}`)),
      hotels: ranked.length + incomplete.length,
      topScore: scores.length ? Math.max(...scores) : null,
      top: ranked[0] || null,
      camps: campRows.filter((c) => (c.regions || []).includes(r.name)).length,
    };
  });
}

// Vergleichs-URL: Slugs mit „-vs-“ verbunden (Slugs selbst enthalten kein „-vs-“)
function pairSlug(slugs) {
  return slugs.join('-vs-');
}
function parsePair(pair) {
  const slugs = String(pair || '').split('-vs-').map((s) => s.trim()).filter((s) => /^[a-z0-9-]+$/.test(s));
  return [...new Set(slugs)].slice(0, 3);
}

module.exports = { hasRegions, METRICS, SORTS, SEASONS, seasonFor, parsePeriod, monthValue, yearRange, inBestTime, sortText, sortRegions, bikeFacts, bikeText, bestTimeReasons, regionFaq, climatePointNote, load, pairSlug, parsePair };
