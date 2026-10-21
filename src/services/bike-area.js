// Radrevier je Gebiet (Region, sonst Rasterkachel): Profil aus OpenStreetMap und Höhendaten, zwischengespeichert in bike_areas.
// Teilwertungen (Schwellen aus der Regel in criteria.scoring.auto, source „bike_area“):
//   network  – km ruhiger, asphaltierter Nebenstraßen (tertiary, unclassified, cycleway) + halbe Länge der secondary
//   traffic  – Anteil ruhiger Straßen am gesamten befahrbaren Netz (Ersatz für Verkehrszählungen, die OSM nicht hat)
//   terrain  – flache Strecken vorhanden UND Anstiege vorhanden
//   routes   – ausgeschilderte Radrouten (route=bicycle)
// Hotel-Anpassung: kaum ruhige Straßen im direkten Umkreis → −1. Ergebnis ist ein Vorschlag (Vertrauensstufe 4).
const db = require('../db');
const geo = require('./geo');

const ROAD_RE = '^(motorway|trunk|primary|secondary|tertiary|unclassified|cycleway)$';
const QUIET = ['tertiary', 'unclassified', 'cycleway'];
const MAIN = ['motorway', 'trunk', 'primary'];

function lengthKm(geometry) {
  let d = 0;
  for (let i = 1; i < (geometry || []).length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    d += geo.distanceKm({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon });
  }
  return d;
}

const paved = (tags) => !tags.surface || /asphalt|paved|concrete|chipseal/.test(tags.surface) && !/unpaved/.test(tags.surface);

// Gebiet für einen Punkt: erste passende Region (wie auf der Hotelseite), sonst Rasterkachel
function areaFor(point, regions, rule) {
  const region = (regions || []).find((r) => geo.distanceKm(point, { lat: Number(r.lat), lng: Number(r.lng) }) <= Number(r.radius_km));
  if (region) {
    const [min, max] = rule.region_radius_km || [15, 40];
    return { key: `region:${region.id}`, regionId: region.id, name: region.name, lat: Number(region.lat), lng: Number(region.lng),
      radiusKm: Math.min(max, Math.max(min, Number(region.radius_km))) };
  }
  const deg = rule.tile_deg || 0.25;
  const lat = Math.round((Math.floor(point.lat / deg) * deg + deg / 2) * 1e4) / 1e4;
  const lng = Math.round((Math.floor(point.lng / deg) * deg + deg / 2) * 1e4) / 1e4;
  return { key: `tile:${lat}:${lng}`, regionId: null, name: `Gebiet um ${String(lat).replace('.', ',')} / ${String(lng).replace('.', ',')}`,
    lat, lng, radiusKm: rule.tile_radius_km || 20 };
}

// Straßenkennzahlen aus Overpass-Elementen (ways mit Geometrie, relations = Radrouten)
function roadMetrics(elements) {
  const km = {};
  let quietKm = 0;
  let routes = 0;
  for (const el of elements || []) {
    if (el.type === 'relation') { routes++; continue; }
    const cls = (el.tags || {}).highway;
    if (!cls) continue;
    const l = lengthKm(el.geometry);
    km[cls] = (km[cls] || 0) + l;
    if (QUIET.includes(cls) && paved(el.tags)) quietKm += l;
  }
  const secondaryKm = km.secondary || 0;
  const mainKm = MAIN.reduce((s, c) => s + (km[c] || 0), 0);
  const total = quietKm + secondaryKm + mainKm;
  const round = (n) => Math.round(n);
  return {
    km: Object.fromEntries(Object.entries(km).map(([k, v]) => [k, round(v)])),
    quietKm: round(quietKm), secondaryKm: round(secondaryKm), mainKm: round(mainKm),
    networkKm: round(quietKm + secondaryKm / 2), quietShare: total ? Math.round((quietKm / total) * 100) / 100 : 0, routes,
  };
}

// Höhenkennzahlen: Höhenunterschied und Anteil flacher Abschnitte – benachbarte Messpunkte (Raster) mit höchstens
// flat_band_m Höhenunterschied; so zählen flache Täler und Hochebenen in jeder Höhe, nicht nur Küstenebenen
function terrainMetrics(grid, rule) {
  const cells = (grid || []).filter((g) => g && g.e !== null && g.e !== undefined && g.e > 0);
  if (cells.length < 5) return null;
  const at = new Map(cells.map((g) => [`${g.i}:${g.j}`, g.e]));
  const band = rule.flat_band_m || 50;
  let pairs = 0;
  let flat = 0;
  for (const g of cells) {
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const n = at.get(`${g.i + di}:${g.j + dj}`);
      if (n === undefined) continue;
      pairs++;
      if (Math.abs(n - g.e) <= band) flat++;
    }
  }
  const es = cells.map((g) => g.e);
  return { reliefM: Math.round(Math.max(...es) - Math.min(...es)), minM: Math.round(Math.min(...es)), maxM: Math.round(Math.max(...es)),
    flatShare: pairs ? Math.round((flat / pairs) * 100) / 100 : 0, points: cells.length };
}

function step(value, [low, high], points) {
  return value >= high ? points : value >= low ? points / 2 : 0;
}

// Teilwertungen aus den Kennzahlen (Schwellen aus der Regel)
function subscores(metrics, rule) {
  const max = rule.max || { network: 2, traffic: 1, terrain: 2, routes: 1 };
  const r = metrics.roads || {};
  const t = metrics.terrain;
  const flat = Boolean(t && t.flatShare >= (rule.flat_share || 0.2));
  const climbs = Boolean(t && t.reliefM >= (rule.climb_m || 300));
  return {
    network: step(r.networkKm || 0, rule.network_km || [150, 400], max.network),
    traffic: step(r.quietShare || 0, rule.quiet_share || [0.6, 0.8], max.traffic),
    terrain: t ? (flat && climbs ? max.terrain : flat || climbs ? max.terrain / 2 : 0) : null,
    routes: step(r.routes || 0, rule.routes || [1, 5], max.routes),
  };
}

// Summe mit Übersteuerung durch den Admin (einzelne Teilwertungen); fehlende Teilwertung (z. B. keine Höhendaten) zählt 0
function areaScore(sub, override = {}) {
  const keys = ['network', 'traffic', 'terrain', 'routes'];
  const merged = Object.fromEntries(keys.map((k) => [k, override[k] !== undefined && override[k] !== null && override[k] !== '' ? Number(override[k]) : sub[k]]));
  return { merged, score: Math.round(keys.reduce((s, k) => s + (Number(merged[k]) || 0), 0) * 10) / 10 };
}

// Anpassung am Hotel: ruhige Straßen im direkten Umkreis
function hotelAdjust(nearQuietKm, rule) {
  if (nearQuietKm === null || nearQuietKm === undefined) return { value: 0, reason: null };
  const min = rule.hotel_min_quiet_km || 3;
  return nearQuietKm < min
    ? { value: -1, reason: `nur ${Math.round(nearQuietKm * 10) / 10} km ruhige Straßen im Umkreis von ${rule.hotel_radius_km || 2} km` }
    : { value: 0, reason: null };
}

function describe(area, merged, rule) {
  const labels = rule.labels || { network: 'Netz', traffic: 'Verkehr', terrain: 'Flach & Berg', routes: 'Routen' };
  const m = area.metrics || {};
  const r = m.roads || {};
  const t = m.terrain;
  const parts = [
    `${labels.network} ${merged.network} (${r.networkKm ?? '?'} km ruhige Straßen)`,
    `${labels.traffic} ${merged.traffic} (ruhiger Anteil ${Math.round((r.quietShare || 0) * 100)} %)`,
    `${labels.terrain} ${merged.terrain ?? '–'}${t ? ` (${t.minM}–${t.maxM} m, flach ${Math.round(t.flatShare * 100)} %)` : ''}`,
    `${labels.routes} ${merged.routes} (${r.routes ?? 0} Radrouten)`,
  ];
  return `Radrevier ${area.name} (${area.radius_km} km): ${parts.join(' · ')}${area.override && area.override.note ? ` – Hinweis: ${area.override.note}` : ''}.`;
}

// ---------- Abruf und Zwischenspeicher ----------

async function computeArea(a, rule) {
  const r = Math.round(a.radiusKm * 1000);
  const q = `[out:json][timeout:170];(way["highway"~"${ROAD_RE}"](around:${r},${a.lat},${a.lng}););out tags geom;rel["route"="bicycle"](around:${r},${a.lat},${a.lng});out ids;`;
  // große Abfrage (dichtes Straßennetz): mehr Zeit als die üblichen 45 s
  const { elements = [] } = await geo.overpass(q, { timeoutMs: 180000 });
  const roads = roadMetrics(elements);
  let terrain = null;
  try {
    const t = await geo.terrain({ lat: a.lat, lng: a.lng }, a.radiusKm, { steps: 4 });
    terrain = t && terrainMetrics(t.grid, rule);
  } catch (err) {
    console.error('[bike-area] Höhen', a.key, err.message);
  }
  return { roads, terrain };
}

async function getArea(a, rule, { force = false } = {}) {
  const row = await db.one('SELECT * FROM bike_areas WHERE key = $1', [a.key]);
  const maxAge = (rule.max_age_days || 365) * 86400000;
  if (row && !force && row.computed_at && !row.error && Date.now() - new Date(row.computed_at).getTime() < maxAge) return row;
  let metrics;
  try {
    metrics = await computeArea(a, rule);
  } catch (err) {
    await db.query(
      `INSERT INTO bike_areas (key, region_id, name, lat, lng, radius_km, error, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (key) DO UPDATE SET error = EXCLUDED.error, updated_at = now()`,
      [a.key, a.regionId, a.name, a.lat, a.lng, a.radiusKm, err.message]);
    throw err;
  }
  const sub = subscores(metrics, rule);
  const override = (row && row.override) || {};
  const { score } = areaScore(sub, override);
  return db.one(
    `INSERT INTO bike_areas (key, region_id, name, lat, lng, radius_km, metrics, subscores, score, computed_at, error, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),NULL,now())
     ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng, radius_km = EXCLUDED.radius_km,
       metrics = EXCLUDED.metrics, subscores = EXCLUDED.subscores, score = EXCLUDED.score, computed_at = now(), error = NULL, updated_at = now()
     RETURNING *`,
    [a.key, a.regionId, a.name, a.lat, a.lng, a.radiusKm, JSON.stringify(metrics), JSON.stringify(sub), score]);
}

// Ruhige Straßen im direkten Umkreis des Hotels (km)
async function nearQuietKm(point, radiusKm) {
  const r = Math.round(radiusKm * 1000);
  const { elements = [] } = await geo.overpass(`[out:json][timeout:60];way["highway"~"^(${QUIET.join('|')})$"](around:${r},${point.lat},${point.lng});out tags geom;`);
  return elements.filter((el) => paved(el.tags || {})).reduce((s, el) => s + lengthKm(el.geometry), 0);
}

// auto-Regel „bike_area“ für ein Objekt. ctx.siteId: Regionen der Site
async function evaluate(point, rule, ctx = {}) {
  const regions = ctx.siteId ? await require('./areas').regions(ctx.siteId) : [];
  const a = areaFor(point, regions, rule);
  const area = await getArea(a, rule);
  const { merged, score } = areaScore(area.subscores || {}, area.override || {});
  let adjust = { value: 0, reason: null };
  try {
    adjust = hotelAdjust(await nearQuietKm(point, rule.hotel_radius_km || 2), rule);
  } catch (err) {
    console.error('[bike-area] Umkreis', err.message);
  }
  const value = Math.max(0, Math.min(6, Math.round(score + adjust.value)));
  const text = `${describe(area, merged, rule)} Gebiet ${score} von 6${adjust.value ? `, am Hotel ${adjust.value} (${adjust.reason})` : ''} → Vorschlag ${value}.`;
  const info = { areaKey: area.key, areaName: area.name, subscores: merged, labels: rule.labels, max: rule.max, areaScore: score, adjust: adjust.value, adjustReason: adjust.reason, suggestion: value };
  return { value: { number: value }, evidenceUrl: 'https://www.openstreetmap.org', evidenceText: text, info, infoText: text };
}

// Kriterien mit Regel „bike_area“ (je Ranking eines) samt Regel
async function bikeCriteria() {
  const rows = await db.many(`SELECT c.id, c.ranking_id, c.scoring FROM criteria c JOIN rankings r ON r.id = c.ranking_id WHERE r.status = 'active'`);
  return rows.map((c) => ({ ...c, rule: [].concat((c.scoring || {}).auto || []).find((r) => r.source === 'bike_area') })).filter((c) => c.rule);
}

// Objekte eines Gebiets mit aktuellem Wert und Vorschlag (aus geo_info des letzten Abgleichs)
async function entitiesOf(areaKey) {
  const crits = await bikeCriteria();
  return db.many(
    `SELECT e.id, e.name, e.city, e.attributes->'geo_info'->'bike_terrain' AS info, er.status AS listing, er.ranking_id,
            f.value AS fact_value, f.trust_level, f.source AS fact_source, s.id AS sub_id
       FROM entities e JOIN entity_rankings er ON er.entity_id = e.id
       LEFT JOIN entity_facts f ON f.entity_id = e.id AND f.criterion_id = ANY($2::uuid[])
       LEFT JOIN LATERAL (SELECT id FROM submissions WHERE entity_id = e.id ORDER BY created_at DESC LIMIT 1) s ON true
      WHERE e.attributes->'geo_info'->'bike_terrain'->>'areaKey' = $1 AND er.ranking_id = ANY($3::uuid[])
      ORDER BY e.name`,
    [areaKey, crits.map((c) => c.id), crits.map((c) => c.ranking_id)]);
}

// Nach Übersteuerung/Neuberechnung: Kennzahlen aller Objekte des Gebiets und unbestätigte Vorschläge (Stufe 4) angleichen.
// Vom Admin oder Betreiber bestätigte Werte bleiben unverändert.
async function applyToEntities(area, adminId) {
  const crits = await bikeCriteria();
  const { merged, score } = areaScore(area.subscores || {}, area.override || {});
  let changed = 0;
  for (const e of await entitiesOf(area.key)) {
    const c = crits.find((x) => x.ranking_id === e.ranking_id);
    if (!c) continue;
    const info = e.info || {};
    const value = Math.max(0, Math.min(6, Math.round(score + (Number(info.adjust) || 0))));
    const text = `${describe(area, merged, c.rule)} Gebiet ${score} von 6${info.adjust ? `, am Hotel ${info.adjust} (${info.adjustReason})` : ''} → Vorschlag ${value}.`;
    await db.query(
      `UPDATE entities SET attributes = jsonb_set(attributes, '{geo_info,bike_terrain}', $2::jsonb), updated_at = now() WHERE id = $1`,
      [e.id, JSON.stringify({ ...info, subscores: merged, areaScore: score, suggestion: value, text })]);
    if (e.trust_level === 4 && e.fact_source === 'auto' && Number((e.fact_value || {}).number) !== value) {
      await db.query(
        `UPDATE entity_facts SET value = $3, evidence_text = $4, checked_at = now() WHERE entity_id = $1 AND criterion_id = $2 AND trust_level = 4`,
        [e.id, c.id, JSON.stringify({ number: value }), text]);
      await require('./rankings').recomputeEntity(e.id, e.ranking_id);
      changed++;
    }
  }
  await require('../lib/audit').logAction(adminId || null, 'bike_area', area.id, 'apply_bike_area', { score, changed });
  return changed;
}

module.exports = { areaFor, roadMetrics, terrainMetrics, subscores, areaScore, hotelAdjust, describe, getArea, evaluate, lengthKm, bikeCriteria, entitiesOf, applyToEntities };
