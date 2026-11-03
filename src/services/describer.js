// Redaktioneller Beschreibungstext je Objekt: Entwurf ausschließlich aus unseren geprüften Daten
// (Fakten, Klima, Leistungen, Region) – nie aus fremden Website-Texten. Öffentlich erst nach Admin-Freigabe.
// Ablauf: gather (Daten mit IDs + Vergleich im Ranking) → generate (Entwurf, Fakten-IDs je Satz)
// → checkText (Zahlen, verbotene Wörter, Sätze ohne Grundlage) + Gegenprüfung → Admin prüft und gibt frei.
const crypto = require('crypto');
const db = require('../db');
const rankings = require('./rankings');
const scoring = require('./scoring');
const featureService = require('./features');
const areas = require('./areas');
const seo = require('../lib/seo');
const stations = require('./stations');
const { MONTHS } = require('../lib/util');

// Alte Quellenbeschriftung (Teil des Fingerabdrucks bestehender Texte – nicht ändern)
const SOURCE = { 1: 'vom Betreiber bestätigt', 2: 'redaktionell geprüft', 3: 'von Nutzern bestätigt', 4: 'automatisch ermittelt (laut Website/Karte)' };
// Quellenstufe für die Sprache des Textes (siehe Prompt)
const QUELLE = { 1: 'betreiber', 2: 'geprüft', 3: 'gäste', 4: 'automatisch' };
const SUMMARY_MAX = 160; // harte Grenze (Meta-Beschreibung)
const SUMMARY_TARGET = 150; // Vorgabe an die KI
const MIN_PEERS = 8; // ab so vielen Live-Objekten gibt es einen Vergleich
const STALE_AFTER_MONTHS = 12;

// Wörter, die ein neutrales Portal ohne Beleg nicht verwendet (zusätzliche je Ranking in rankings.text_style.banned)
const BANNED = ['ideal', 'perfekt', 'Geheimtipp', 'garantiert', 'traumhaft', 'schön', 'unbekannt', 'Paradies', 'einzigartig', 'atemberaubend', 'unschlagbar'];

// Styleguide, solange im Ranking keiner gepflegt ist (Admin → KI-Texte)
const DEFAULT_GUIDE = `- Du-Form, sachlich, ruhig. Kurze Sätze, meist unter 20 Wörtern, aktive Verben.
- Konkret statt vage: Zahlen mit Einheit, Orte mit Namen.
- Erst das, was dieses Objekt von anderen unterscheidet, dann das Übliche. Standardausstattung knapp oder gar nicht.
- Einschränkungen offen und ohne Drama nennen; sie machen den Text glaubwürdig.
- Keine Werbesprache, keine Superlative ohne Vergleich, keine Ausrufezeichen, keine rhetorischen Fragen.`;

// Feste IDs neben den Kriterien-Codes
const REF_LABELS = { ort: 'Lage', einordnung: 'Einordnung', klima: 'Klima', reisezeit: 'Beste Reisezeit', leistungen: 'Leistungen', notizen: 'Notizen' };

function pct(x) {
  return Math.round(x * 100);
}

// Vergleich mit den anderen Live-Objekten des Rankings: Wie verbreitet ist dieser Wert? null = zu wenige zum Vergleichen
function compareValue(mine, others, entities, entity) {
  if (others.length < MIN_PEERS) return null;
  const n = others.length;
  const atLeast = others.filter((p) => p >= mine).length / n;
  const more = others.filter((p) => p > mine).length / n;
  if (mine > 0 && atLeast === 0) return `kein anderes ${entity} dieser Übersicht erreicht das`;
  if (mine > 0 && atLeast <= 0.3) return `selten – nur ${pct(atLeast)} % der anderen ${entities} erreichen das`;
  if (more >= 0.6) return `schwächer als ${pct(more)} % der anderen ${entities}`;
  if (mine > 0 && atLeast >= 0.7) return `verbreitet – ${pct(atLeast)} % der anderen ${entities} erreichen das auch`;
  if (mine === 0 && more <= 0.3) return `fehlt auch bei ${pct(1 - more)} % der anderen ${entities}`;
  return 'Mittelfeld';
}

// Gesamtplatz nach Score unter den Live-Objekten (ohne das Objekt selbst gezählt)
function rankOf(score, others) {
  if (score === null || score === undefined || others.length < MIN_PEERS) return null;
  const better = others.filter((s) => s > score).length;
  const of = others.length + 1;
  return { platz: better + 1, von: of, obere_prozent: Math.max(1, Math.round(((better + 1) / of) * 100)) };
}

// Fundstelle aus Karten/offenen Daten (nicht von der Website des Objekts) -> Messwert für den Text; Redaktionshinweis entfernen
function measuredDetail(fact, criterion, website) {
  if (!fact.evidence_url || !fact.evidence_text) return null;
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return null; } };
  const own = website ? host(website) : null;
  const h = host(fact.evidence_url);
  if (!h || (own && (h === own || h.endsWith(`.${own}`)))) return null; // Website-Zitat: nie in den Text
  const note = criterion.scoring && criterion.scoring.auto && criterion.scoring.auto.note;
  let t = String(fact.evidence_text);
  if (note && t.startsWith(note)) t = t.slice(note.length);
  // Hinweise an die Redaktion (auch ältere Fassungen der Notiz) gehören nicht in den Text
  t = t.split(/(?<=[.!?])\s+/).filter((x) => !/\bbitte\b|\bprüfen\b|nicht geprüft/i.test(x)).join(' ').trim();
  return t ? t.slice(0, 400) : null;
}

function addressLine(entity) {
  const a = (entity.attributes || {}).address || {};
  const place = [a.postal_code, a.city].filter(Boolean).join(' ');
  return [a.street, place].filter(Boolean).join(', ') || null;
}

// Alle Daten, auf denen der Text beruhen darf. context = Vergleich im Ranking (ändert sich mit anderen Objekten,
// gehört deshalb nicht zum Fingerabdruck).
async function gather(entityId, rankingId) {
  const ranking = await rankings.getRanking(rankingId);
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [entityId]);
  if (!ranking || !entity) return null;
  const [categories, criteria, facts, climate, feats, regionList, peerFacts, peerScores] = await Promise.all([
    rankings.getCategories(ranking.id),
    rankings.getCriteria(ranking.id),
    rankings.getFacts(entity.id, ranking.id),
    rankings.getClimate(entity.id),
    featureService.forEntity(ranking.entity_type, entity.id),
    areas.regionsOf(ranking.site_id, entity),
    db.many(
      `SELECT f.entity_id, f.criterion_id, f.points::float AS points FROM entity_facts f
         JOIN criteria c ON c.id = f.criterion_id
         JOIN entity_rankings er ON er.entity_id = f.entity_id AND er.ranking_id = c.ranking_id
        WHERE c.ranking_id = $1 AND er.status = 'live' AND f.points IS NOT NULL AND f.entity_id <> $2`, [ranking.id, entity.id]),
    db.many(`SELECT score::float AS score FROM entity_rankings WHERE ranking_id = $1 AND status = 'live' AND score IS NOT NULL AND entity_id <> $2`, [ranking.id, entity.id]),
  ]);
  const result = scoring.computeScore(criteria, rankings.factMap(facts), climate, await rankings.scoreOptions(ranking));
  const factBy = new Map(facts.map((f) => [f.criterion_id, f]));
  const detailBy = new Map(result.details.map((d) => [d.criterionId, d]));
  const peerBy = new Map();
  for (const p of peerFacts) {
    if (!peerBy.has(p.criterion_id)) peerBy.set(p.criterion_id, []);
    peerBy.get(p.criterion_id).push(p);
  }
  const ent = { sg: ranking.entity_label_sg, pl: ranking.entity_label_pl };

  const cats = categories.map((cat) => {
    const list = criteria.filter((c) => c.category_id === cat.id && !scoring.isDerived(c));
    const known = [];
    const unknown = [];
    for (const c of list) {
      const f = factBy.get(c.id);
      const d = detailBy.get(c.id);
      if (f && d && d.known) {
        const item = { id: c.code, criterion: c.label, value: scoring.describeValue(c, f.value), points: d.points, max: d.max, source: SOURCE[f.trust_level] || SOURCE[4], quelle: QUELLE[f.trust_level] || QUELLE[4] };
        const detail = measuredDetail(f, c, entity.website);
        if (detail) item.messwert = detail;
        known.push(item);
      } else {
        unknown.push({ id: c.code, criterion: c.label, max: Number(c.max_points) });
      }
    }
    const pts = known.reduce((s, k) => s + k.points, 0);
    const max = list.reduce((s, c) => s + Number(c.max_points), 0);
    return { category: cat.label, categoryId: cat.id, points: pts, max, known, unknown, ids: list.map((c) => c.id) };
  }).filter((c) => c.known.length || c.unknown.length);

  // Vergleich je Kriterium und Kategorie
  const comparison = {};
  for (const cat of cats) {
    for (const k of cat.known) {
      const c = criteria.find((x) => x.code === k.id && x.category_id === cat.categoryId);
      const v = compareValue(k.points, (peerBy.get(c.id) || []).map((p) => p.points), ent.pl, ent.sg);
      if (v) comparison[k.id] = v;
    }
    const sums = new Map();
    for (const id of cat.ids) for (const p of peerBy.get(id) || []) sums.set(p.entity_id, (sums.get(p.entity_id) || 0) + p.points);
    const v = compareValue(cat.points, [...sums.values()], ent.pl, ent.sg);
    if (v) comparison[`kategorie:${cat.category}`] = v;
  }

  const best = seo.bestMonths(ranking.formula, climate);
  const wind = await stations.regionWind(regionList[0] || null);
  const rnd = (x) => (x === null || x === undefined ? null : Math.round(x));
  const climateTable = climate
    .slice().sort((a, b) => a.month - b.month)
    .map((r) => {
      const w = wind ? wind.months.find((x) => x.month === r.month) : null;
      return {
        month: MONTHS[r.month - 1],
        max_c: rnd(r.avg_high_c),
        rain_days: rnd(r.rain_days),
        sea_c: rnd(r.sea_c),
        min_c: rnd(r.avg_low_c),
        ...(w ? { wind_kmh: rnd(w.wind_kmh), windy_days: rnd(w.windy_days) } : {}),
      };
    });
  const rainSt = (entity.attributes || {}).rain_station;
  const climateSources = {
    temperatur: 'Modell (Open-Meteo)',
    regentage: rainSt ? stations.stationText(rainSt) : 'Modell (Open-Meteo)',
    ...(wind ? { wind: `${stations.stationText(wind.station)}, Wert für die Region ${wind.region}` } : {}),
  };

  const saved = await db.one('SELECT notes FROM entity_texts WHERE entity_id = $1 AND ranking_id = $2', [entity.id, ranking.id]);
  const notes = saved && saved.notes ? saved.notes.trim() : '';
  return {
    ranking: { name: ranking.name, score_name: ranking.score_name, entity: ranking.entity_label_sg, entities: ranking.entity_label_pl },
    entity: { name: entity.name, city: entity.city, country: entity.country ? seo.countryName(entity.country) : null, region: regionList[0] ? regionList[0].name : null, address: addressLine(entity) },
    score: { label: result.label, eligible: result.eligible, completeness: Math.round(result.completeness) },
    categories: cats.map(({ ids, categoryId, ...c }) => c),
    best_months: best.length ? seo.monthRanges(best, MONTHS) : null,
    climate: climateTable,
    features: feats.map((f) => f.label),
    climate_sources: climateSources,
    // nur wenn vorhanden, damit bestehende Fingerabdrücke gültig bleiben
    ...(notes ? { notes } : {}),
    context: { comparison, rank: rankOf(result.score, peerScores.map((s) => s.score)), best_month_list: best.map((m) => MONTHS[m - 1]) },
  };
}

// Fingerabdruck in der bisherigen Form (vor Fakten-IDs und Vergleich): bestehende Texte bleiben gültig, solange sich ihre Daten nicht ändern
function legacyView(input) {
  const e = input.entity || {};
  return {
    ranking: input.ranking,
    entity: { name: e.name, city: e.city, country: e.country, region: e.region },
    score: input.score,
    categories: (input.categories || []).map((c) => ({
      category: c.category, points: c.points, max: c.max,
      known: (c.known || []).map((k) => ({ criterion: k.criterion, value: k.value, points: k.points, max: k.max, source: k.source })),
      unknown: (c.unknown || []).map((u) => (typeof u === 'string' ? u : u.criterion)),
    })),
    best_months: input.best_months,
    climate: (input.climate || []).map((r) => ({ month: r.month, max_c: r.max_c, rain_days: r.rain_days })),
    features: input.features,
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

function hash(x, len = 32) {
  return crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, len);
}

function inputHash(input) {
  return hash(legacyView(input));
}

// Fingerabdruck je ID – damit gilt ein Text nur als veraltet, wenn sich eine Angabe ändert, die er tatsächlich verwendet
function refFingerprints(input, ids) {
  const all = {
    ort: input.entity,
    einordnung: input.score && input.score.label,
    klima: input.climate,
    reisezeit: input.best_months,
    leistungen: input.features,
    notizen: input.notes || '',
  };
  for (const c of input.categories || []) {
    for (const k of c.known || []) all[k.id] = { value: k.value, quelle: k.quelle };
    for (const u of c.unknown || []) all[u.id] = 'offen';
  }
  const out = {};
  for (const id of ids) out[id] = id in all ? hash(all[id], 12) : 'fehlt';
  return out;
}

function refLabel(input, id) {
  if (REF_LABELS[id]) return REF_LABELS[id];
  for (const c of input.categories || []) {
    const hit = [...(c.known || []), ...(c.unknown || [])].find((k) => k.id === id);
    if (hit) return hit.criterion;
  }
  return id;
}

// Ist der Text veraltet? Mit Fakten-IDs nur bei Änderung einer verwendeten Angabe, sonst (ältere/handgeschriebene Texte)
// bei jeder Änderung der Daten; zusätzlich Erinnerung nach 12 Monaten.
function staleness(text, input, now = new Date()) {
  if (!text || !text.body || !input) return null;
  const refs = text.fact_refs && Object.keys(text.fact_refs).length ? text.fact_refs : null;
  if (refs) {
    const cur = refFingerprints(input, Object.keys(refs));
    const changed = Object.keys(refs).filter((id) => cur[id] !== refs[id]);
    if (changed.length) return { reason: 'facts', changed: changed.map((id) => refLabel(input, id)) };
  } else if (text.input_hash && inputHash(input) !== text.input_hash) {
    return { reason: 'facts', changed: [] };
  }
  const since = text.published_at && new Date(text.published_at);
  if (text.status === 'published' && since) {
    const limit = new Date(since);
    limit.setMonth(limit.getMonth() + STALE_AFTER_MONTHS);
    if (now >= limit) return { reason: 'age', since };
  }
  return null;
}

// Daten so, wie die KI sie sieht: knapp, mit IDs, Quellenstufe und Vergleich
function modelInput(input) {
  const ctx = input.context || {};
  const cmp = ctx.comparison || {};
  const e = input.entity || {};
  return {
    objekt: { id: 'ort', name: e.name, ort: e.city, region: e.region, land: e.country, anschrift: e.address || null },
    einordnung: { id: 'einordnung', stufe: input.score && input.score.label, vollstaendigkeit_prozent: input.score && input.score.completeness, ...(ctx.rank ? { gesamtplatz: ctx.rank } : {}) },
    kategorien: (input.categories || []).map((c) => ({
      kategorie: c.category,
      punkte: `${c.points}/${c.max}`,
      ...(cmp[`kategorie:${c.category}`] ? { vergleich: cmp[`kategorie:${c.category}`] } : {}),
      bekannt: (c.known || []).map((k) => ({
        id: k.id, kriterium: k.criterion, wert: k.value, quelle: k.quelle, punkte: `${k.points}/${k.max}`,
        ...(cmp[k.id] ? { vergleich: cmp[k.id] } : {}),
        ...(k.messwert ? { messwert: k.messwert } : {}),
      })),
      offen: (c.unknown || []).map((u) => ({ id: u.id, kriterium: u.criterion, gewicht: u.max })),
    })),
    klima: {
      id: 'klima',
      ...(input.climate_sources ? { quellen: input.climate_sources } : {}),
      monate: (input.climate || []).map((r) => ({
        monat: r.month, max_c: r.max_c,
        ...(r.min_c !== null && r.min_c !== undefined ? { min_c: r.min_c } : {}),
        regentage: r.rain_days,
        ...(r.sea_c !== null && r.sea_c !== undefined ? { wasser_c: r.sea_c } : {}),
        ...(r.wind_kmh !== null && r.wind_kmh !== undefined ? { wind_kmh: r.wind_kmh, starkwindtage: r.windy_days } : {}),
      })),
    },
    reisezeit: { id: 'reisezeit', beste_monate: ctx.best_month_list && ctx.best_month_list.length ? ctx.best_month_list : null },
    leistungen: { id: 'leistungen', liste: input.features || [] },
    ...(input.notes ? { notizen: { id: 'notizen', text: input.notes } } : {}),
  };
}

function allIds(input) {
  const ids = new Set(Object.keys(REF_LABELS));
  if (!input.notes) ids.delete('notizen');
  for (const c of input.categories || []) for (const k of [...(c.known || []), ...(c.unknown || [])]) ids.add(k.id);
  return ids;
}

function styleOf(ranking) {
  const s = (ranking && ranking.text_style) || {};
  const extra = Array.isArray(s.banned) ? s.banned.map((w) => String(w).trim()).filter(Boolean) : [];
  return { guide: (s.guide && String(s.guide).trim()) || DEFAULT_GUIDE, custom: Boolean(s.guide && String(s.guide).trim()), banned: [...new Set([...BANNED, ...extra])] };
}

// Mustertexte: vom Admin ausgewählte freigegebene Texte (höchstens 3) – nicht automatisch der letzte Text
async function styleExamples(rankingId, entityId) {
  return db.many(
    `SELECT t.summary, t.body, e.name FROM entity_texts t JOIN entities e ON e.id = t.entity_id
      WHERE t.ranking_id = $1 AND t.entity_id <> $2 AND t.style_example AND t.status = 'published' AND t.body <> ''
      ORDER BY t.published_at DESC NULLS LAST LIMIT 3`, [rankingId, entityId]);
}

// "## Titel" -> Überschrift, "- Punkt" -> Liste, sonst Absatz (Absätze durch Leerzeile getrennt)
function parseBody(body) {
  const blocks = [];
  for (const chunk of String(body || '').replace(/\r/g, '').split(/\n{2,}/)) {
    const t = chunk.trim();
    if (!t) continue;
    if (t.startsWith('## ')) {
      const [head, ...rest] = t.split('\n');
      blocks.push({ type: 'h', text: head.slice(3).trim() });
      if (rest.join('\n').trim()) blocks.push(...parseBody(rest.join('\n')));
    } else if (t.split('\n').every((l) => /^\s*-\s+/.test(l))) {
      blocks.push({ type: 'ul', items: t.split('\n').map((l) => l.replace(/^\s*-\s+/, '').trim()) });
    } else {
      blocks.push({ type: 'p', text: t.replace(/\s*\n\s*/g, ' ') });
    }
  }
  return blocks;
}

// Keine Links, keine Preise; Länge begrenzen
function clean(text) {
  return String(text || '').replace(/https?:\/\/\S+/gi, '').replace(/\bwww\.\S+/gi, '').replace(/[ \t]+/g, ' ').trim();
}

function shorten(s, max) {
  const t = clean(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[,;:\s]+$/, '')}…`;
}

// Satz oder Punkt: Text (älteres Format) oder { text, facts }
const textOf = (x) => clean(typeof x === 'string' ? x : x && x.text);
const sentencesOf = (s) => (Array.isArray(s.sentences) ? s.sentences : s.text ? [s.text] : []);

function toBody(parsed) {
  const parts = [];
  const list = (title, items) => {
    const t = (items || []).map(textOf).filter(Boolean);
    if (t.length) parts.push(`## ${title}\n\n${t.map((n) => `- ${n}`).join('\n')}`);
  };
  const verdict = (parsed.verdict || []).map(textOf).filter(Boolean).join(' ');
  if (verdict) parts.push(`## Kurzfazit\n\n${verdict}`);
  list('Passt gut für', parsed.fit_good);
  list('Passt weniger für', parsed.fit_less);
  for (const s of parsed.sections || []) {
    const title = clean(s.title);
    const text = sentencesOf(s).map(textOf).filter(Boolean).join(' ');
    if (!text) continue;
    parts.push(title ? `## ${title}\n\n${text}` : text);
  }
  list('Gut zu wissen', parsed.good_to_know);
  return parts.join('\n\n');
}

// Alle Sätze/Punkte mit ihren Fakten-IDs (für Prüfung und Fingerabdrücke)
function statements(parsed) {
  const out = [];
  if (parsed.summary) out.push({ text: textOf(parsed.summary), facts: parsed.summary_facts || [], part: 'Kurzbeschreibung' });
  for (const x of parsed.verdict || []) out.push({ text: textOf(x), facts: x.facts || [], part: 'Kurzfazit' });
  for (const x of parsed.fit_good || []) out.push({ text: textOf(x), facts: x.facts || [], part: 'Passt gut für' });
  for (const x of parsed.fit_less || []) out.push({ text: textOf(x), facts: x.facts || [], part: 'Passt weniger für' });
  for (const s of parsed.sections || []) for (const x of sentencesOf(s)) out.push({ text: textOf(x), facts: (x && x.facts) || [], part: clean(s.title) });
  for (const x of parsed.good_to_know || []) out.push({ text: textOf(x), facts: x.facts || [], part: 'Gut zu wissen' });
  return out.filter((s) => s.text);
}

// Zahlen normalisiert („20,5“ = „20.5“); kleine Zahlen bis 3 sind Alltagssprache und werden nicht geprüft
function numbersIn(s) {
  return (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => String(Number(n.replace(',', '.'))));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Ort, an dem die Kurzbeschreibung zu erkennen ist (Ort, Region oder Ort aus der Anschrift)
function places(input) {
  const e = input.entity || {};
  const fromAddress = e.address ? e.address.split(',').pop().replace(/^\s*\d+\s*/, '').trim() : null;
  return [...new Set([e.city, e.region, fromAddress].filter(Boolean))];
}

function summaryProblem(summary, input) {
  const s = clean(summary);
  if (s.length > SUMMARY_TARGET) return `hat ${s.length} Zeichen, erlaubt sind höchstens ${SUMMARY_TARGET}`;
  const p = places(input);
  if (p.length && !p.some((x) => s.toLowerCase().includes(x.toLowerCase()))) return `nennt den Ort nicht (${p.join(' / ')})`;
  return null;
}

// Maschinelle Prüfung vor der Freigabe. parsed (strukturierte KI-Ausgabe) nur direkt nach dem Erzeugen vorhanden.
function checkText({ summary, body }, input, { banned = BANNED, parsed = null } = {}) {
  const warnings = [];
  const add = (type, text) => warnings.push({ type, text });
  const all = `${summary || ''}\n${body || ''}`;
  // 1. Jede Zahl muss in den Daten vorkommen (auch gerundet)
  const allowed = new Set();
  for (const n of numbersIn(JSON.stringify(modelInput(input)))) {
    allowed.add(n);
    allowed.add(String(Math.round(Number(n))));
  }
  const unknownNums = [...new Set(numbersIn(all))].filter((n) => Number(n) > 3 && !allowed.has(n));
  if (unknownNums.length) add('number', `Zahlen ohne Grundlage in den Daten: ${unknownNums.join(', ')}`);
  // 2. Verbotene Wörter
  const hits = banned.filter((w) => new RegExp(`(?<!\\p{L})${escapeRe(w)}\\p{L}*`, 'iu').test(all));
  if (hits.length) add('word', `Nicht belegte Wertung: ${hits.join(', ')}`);
  // 3. Kurzbeschreibung: Länge und Ort
  const sp = summaryProblem(summary || '', input);
  if (sp) add('summary', `Kurzbeschreibung ${sp}`);
  // 4. Sätze ohne Fakten-ID und unbekannte IDs (nur für den KI-Entwurf)
  if (parsed) {
    const ids = allIds(input);
    for (const s of statements(parsed)) {
      if (s.part === 'Kurzbeschreibung') continue;
      if (!s.facts.length) add('basis', `Satz ohne Datengrundlage (${s.part}): „${s.text}“`);
      const bad = s.facts.filter((f) => !ids.has(f));
      if (bad.length) add('basis', `Unbekannte Fakten-ID ${bad.join(', ')} (${s.part}): „${s.text}“`);
    }
  }
  return warnings;
}

// Nach dem Bearbeiten: maschinelle Prüfung neu, Befunde der Gegenprüfung nur behalten, solange der Satz noch im Text steht
function recheck(text, input, style, previous = []) {
  const kept = (previous || []).filter((w) => w.type === 'review' && w.sentence && `${text.summary}\n${text.body}`.includes(w.sentence));
  return [...checkText(text, input, { banned: style.banned }), ...kept];
}

// Prompt für den KI-Entwurf. Wird im Admin unter Inhalte → KI-Texte dokumentiert.
function prompt(input, { examples = [], style = styleOf(null) } = {}) {
  const r = input.ranking;
  const data = input.__template || JSON.stringify(modelInput(input), null, 2);
  const ex = (examples || []).filter((x) => x && x.body);
  return `Du schreibst für die unabhängige Übersicht „${r.name}“ den redaktionellen Text über ein ${r.entity}.
Zielgruppe: Sportler, die ein ${r.entity} genau für diesen Zweck suchen. Der Text steht auf der Profilseite über den Detailtabellen. Die Redaktion prüft ihn vor der Veröffentlichung; eine maschinelle Prüfung markiert jede Zahl, die nicht in den Daten steht, und jeden Satz ohne Fakten-ID.

<daten>
${data}
</daten>

So liest du die Daten:
- Jede Angabe hat eine ID (Kriterien-Code oder ort, einordnung, klima, reisezeit, leistungen${input.notes || input.__template ? ', notizen' : ''}). Nur diese IDs verwenden.
- objekt: Nenne Ort bzw. Ortsteil und Region (z. B. Insel) mit Namen. Aus der Anschrift nur Ort und Ortsteil, keine Straßen oder Hausnummern.
- bekannt: geprüfte Angaben. „nein“ heißt: gibt es nicht. punkte zeigen, wie viel die Angabe zählt (erreicht/möglich) – nie im Text nennen.
- vergleich: wie das ${r.entity} gegenüber den anderen ${r.entities} dieser Übersicht abschneidet. Das ist deine Grundlage für Auswahl und Gewichtung. Im Text in Worten („haben nur wenige ${r.entities} hier“, „bieten die meisten“), ohne Prozentzahlen oder Platz – sie ändern sich mit jedem neuen ${r.entity}.
- messwert: Zahlen aus Karten und offenen Daten (Entfernungen sind Luftlinie). Hinweise an die Redaktion darin ignorieren.
- offen: noch nicht geprüfte Angaben.
- klima: je Monat Tageshöchst- und Tiefstwert (max_c, min_c), Regentage und – falls vorhanden – Wassertemperatur (wasser_c), Ø Wind (wind_kmh) und Tage mit Starkwind (starkwindtage, Stundenmittel ab 40 km/h). quellen nennt, was gemessen und was Modell ist. Wind ist ein Wert der Region (Messstation, oft ein Flughafen) – im Text als Wind der Region oder an der Station nennen, nicht als Wert am ${r.entity}. reisezeit: Monate mit den besten Bedingungen.${input.notes || input.__template ? '\n- notizen: Einschätzung der Redaktion, gleichrangig mit den Daten; sachlich als Aussage einbauen (nicht „die Redaktion meint“), nicht übertreiben.' : ''}

Quelle in der Sprache:
- „geprüft“: direkt sagen. Zusagen zu Abläufen und Service (Reservierungen, Zeiten, Transfers, Wäsche) trotzdem mit „laut ${r.entity}“.
- „betreiber“: mit „laut ${r.entity}“.
- „gäste“: mit „Gäste berichten …“.
- „automatisch“: mit „laut Website“ bzw. bei Messwerten „laut Karte“.
- Messwerte mit Zahl und „Luftlinie“ bzw. „ca.“ – daraus keine Fahr- oder Gehzeiten ableiten.

Auswahl:
- Das Auffällige zuerst: Kurzfazit und der erste Satz jedes Abschnitts nennen, was laut vergleich selten oder schwächer ist. „verbreitet“ knapp oder gar nicht.
- Je Abschnitt 2–3 Punkte, keine Ausstattungslisten im Fließtext; die Details stehen in den Tabellen.
- Mindestens eine ehrliche Einschränkung, wenn die Daten eine hergeben.
- Lücken nur, wenn sie zählen (möglich ≥ 3 Punkte oder eine ganze Kategorie ohne Angebot).
- Allgemeine Ausstattung (z. B. Parkplatz, Kinderbetreuung) nur, wenn sie für die Zielgruppe etwas bedeutet.

Konkret:
- Zahlen nennen, wenn die Daten sie haben: Entfernungen, Längen, Temperaturen, Monate. Keine vagen Ersatzwörter wie „in wenigen Minuten“ oder „angenehm warm“, wenn eine Zahl vorliegt.
- Werte mit Grenze so wiedergeben: „bis 1 km“, „höchstens 60 Minuten“, „mindestens 25 °C“.
- Keine Zahlen erfinden; runden nur auf ganze Zahlen. Keine Punkte, keine Skalen („4 von 10“), keine ${r.score_name}-Zahl, keine Stufennamen in Anführungszeichen. Bewertungen in Worte fassen und mit Messwerten begründen.
- Beste Reisezeit: erst die Monate aus reisezeit als Spanne nennen, dann aufschlüsseln, welche Monate wofür passen (Wärme, kühle Morgen, Regen, Wassertemperatur, Wind) und welche weniger – nur mit den Klimazahlen. Viel Wind betrifft vor allem das Training im Freien.

Nicht erlaubt:
- Wertungen ohne Fakt, auch keine Aussagen über Bekanntheit, Beliebtheit, Schönheit oder Atmosphäre.
- Diese Wörter: ${style.banned.join(', ')}.
- Aussagen über unsere Prüfung oder Datenqualität, Preise, Personen, Buchungsaufforderungen, Links.

Styleguide der Redaktion:
${style.guide}
${ex.length ? `
Mustertexte – fremde ${r.entities}, ihr Inhalt ist für diesen Text irrelevant. Übernimm nur Ton und Satzlänge, keine Fakten, keine Ausstattung, keine Formulierungen. Wähle bewusst einen anderen Einstieg und anderen Satzbau.
${ex.map((x, i) => `<muster nr="${i + 1}">\n${x.summary}\n\n${x.body}\n</muster>`).join('\n')}
` : ''}
Ausgabe:
- summary: ein Satz, höchstens ${SUMMARY_TARGET} Zeichen, mit Ort oder Region und dem wichtigsten Merkmal. summary_facts: IDs dazu.
- verdict: Kurzfazit in 2–3 Sätzen – für wen das ${r.entity} passt, seine größte Stärke im Vergleich und, falls vorhanden, die größte Einschränkung.
- fit_good: 2–4 kurze Punkte, für wen bzw. welches Training es gut passt. fit_less: 1–3 Punkte, für wen weniger; leer, wenn die Daten nichts hergeben. Jeweils ohne „Passt gut für“ am Anfang.
- sections: 3–4 Abschnitte (kurzer Titel, 1–3 Sätze) entlang der Kategorien, verwandte zusammengefasst; einer zur besten Reisezeit mit Anreise, wenn Daten vorhanden.
- good_to_know: 0–4 kurze Punkte zu Einschränkungen; offene Angaben mit gewicht ≥ 3 in einem Punkt „Noch nicht geprüft: …“.
- Jeder Satz und jeder Punkt hat facts: die IDs der Angaben, auf denen er beruht. Was sich keiner ID zuordnen lässt, gehört nicht in den Text.
- Insgesamt 180–260 Wörter.`;
}

// Für die Dokumentation im Admin: Prompt mit Platzhaltern statt echter Daten
function promptTemplate(ranking, examples = []) {
  const input = {
    ranking: { name: ranking.name, score_name: ranking.score_name, entity: ranking.entity_label_sg, entities: ranking.entity_label_pl },
    __template: '[Daten des Objekts als JSON: Objekt mit Ort, Region und Anschrift · Einordnung mit Stufe und Gesamtplatz · Kategorien mit bekannten Angaben (ID, Wert, Quelle, Punkte, Vergleich im Ranking, Messwert aus Karten/offenen Daten) und offenen Angaben · Klima je Monat mit Tiefstwert, Wassertemperatur und Wind der Region (mit Quellen) · beste Reisezeit · Leistungen · redaktionelle Notizen (nur wenn vorhanden)]',
  };
  return prompt(input, { examples: examples.length ? examples : [{ summary: '[Kurzbeschreibung]', body: '[Mustertext – nur wenn welche ausgewählt sind]' }], style: styleOf(ranking) });
}

function schemas() {
  const { z } = require('zod');
  const Sentence = z.object({ text: z.string(), facts: z.array(z.string()) });
  return {
    Draft: z.object({
      summary: z.string(),
      summary_facts: z.array(z.string()),
      verdict: z.array(Sentence),
      fit_good: z.array(Sentence),
      fit_less: z.array(Sentence),
      sections: z.array(z.object({ title: z.string(), sentences: z.array(Sentence) })),
      good_to_know: z.array(Sentence),
    }),
    Summary: z.object({ summary: z.string(), summary_facts: z.array(z.string()) }),
    Review: z.object({ findings: z.array(z.object({ sentence: z.number().int(), problem: z.string() })) }),
  };
}

async function callParse(model, messages, Schema, { fallbacks = true, effort = 'medium' } = {}) {
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const llm = require('../lib/llm');
  const response = await llm.anthropic().messages.parse(
    {
      model,
      max_tokens: 8000,
      output_config: { effort, format: zodOutputFormat(Schema) },
      ...(fallbacks ? { fallbacks: 'default' } : {}),
      messages,
    },
    fallbacks ? { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } } : undefined
  );
  const usage = { model: response.model, raw: response.usage };
  if (response.stop_reason === 'refusal' || !response.parsed_output) return { out: null, usage };
  return { out: response.parsed_output, usage };
}

// Gegenprüfung mit einem günstigen Modell: jede Aussage gegen die Daten (Übertreibungen, falsche Quelle, nicht gedeckt)
async function review(input, parsed) {
  const llm = require('../lib/llm');
  const list = statements(parsed);
  const r = input.ranking;
  const text = `Prüfe einen Entwurf für die unabhängige Übersicht „${r.name}“ gegen seine Daten.

<daten>
${JSON.stringify(modelInput(input), null, 2)}
</daten>

<saetze>
${list.map((s, i) => `${i + 1}. [${s.part}] ${s.text}`).join('\n')}
</saetze>

In eckigen Klammern steht der Teil des Textes. Melde nur Sätze mit einem dieser Probleme:
- Aussage steht nicht in den Daten oder geht darüber hinaus (erfundene Zahlen, Entfernungen, Zeiten, Ausstattung, Eigenschaften).
- Übertreibung oder Wertung ohne Fakt; Prozentzahlen oder Platzierungen aus dem Vergleich.
- Quelle falsch wiedergegeben: Angabe des Betreibers als Tatsache, Luftlinie als Fahr- oder Gehzeit.
- Widerspruch zu den Daten („nein“ heißt: gibt es nicht).
Kein Problem sind: Rundung auf ganze Zahlen und „ca.“; Wörter wie „selten“, „wenige“, „die meisten“, wenn der vergleich das hergibt; unter „Passt weniger für“ Sportler, die etwas brauchen, das es laut Daten nicht gibt; Notizen der Redaktion als Aussage.
Kein Feedback zu Stil oder Länge. problem: ein kurzer Satz auf Deutsch. Keine Probleme: leere Liste.`;
  const res = await callParse(llm.modelFor('describe_check'), [{ role: 'user', content: text }], schemas().Review, { fallbacks: false, effort: 'low' });
  const findings = res.out ? res.out.findings : [];
  const warnings = findings
    .filter((f) => list[f.sentence - 1])
    .map((f) => ({ type: 'review', sentence: list[f.sentence - 1].text, text: `„${list[f.sentence - 1].text}“ – ${clean(f.problem)}` }));
  return { warnings, usage: res.usage, ok: Boolean(res.out) };
}

// Entwurf erzeugen: Text, verwendete Fakten (Fingerabdrücke), Prüfbefunde und Verbrauch je Aufruf
async function generate(input, { examples = [], style = styleOf(null) } = {}) {
  const llm = require('../lib/llm');
  const { Draft, Summary } = schemas();
  await llm.assertBudget();
  const usages = [];
  const first = [{ role: 'user', content: prompt(input, { examples, style }) }];
  const res = await callParse(llm.modelFor('describe'), first, Draft);
  usages.push({ purpose: 'description', ...res.usage });
  if (!res.out) return { text: null, usages };
  const parsed = res.out;

  // Kurzbeschreibung zu lang oder ohne Ort: einmal gezielt neu schreiben lassen statt abschneiden
  const problem = summaryProblem(parsed.summary, input);
  if (problem) {
    try {
      const retry = await callParse(llm.modelFor('describe'), [
        ...first,
        { role: 'assistant', content: JSON.stringify(parsed) },
        { role: 'user', content: `Die Kurzbeschreibung ${problem}. Schreib nur sie neu: ein Satz, höchstens ${SUMMARY_TARGET} Zeichen, mit Ort oder Region und dem wichtigsten Merkmal, sonst gleiche Regeln.` },
      ], Summary);
      usages.push({ purpose: 'description', ...retry.usage });
      if (retry.out && retry.out.summary) Object.assign(parsed, retry.out);
    } catch (err) {
      console.error('[describer] Kurzbeschreibung:', err.message);
    }
  }

  const text = { summary: shorten(parsed.summary, SUMMARY_MAX), body: toBody(parsed) };
  const ids = allIds(input);
  const used = [...new Set(statements(parsed).flatMap((s) => s.facts).filter((f) => ids.has(f)))];
  const checks = checkText(text, input, { banned: style.banned, parsed });
  try {
    const rv = await review(input, parsed);
    usages.push({ purpose: 'description_check', ...rv.usage });
    checks.push(...rv.warnings);
    if (!rv.ok) checks.push({ type: 'info', text: 'Gegenprüfung ohne Ergebnis – bitte selbst gegen die Fakten lesen.' });
  } catch (err) {
    console.error('[describer] Gegenprüfung:', err.message);
    checks.push({ type: 'info', text: 'Gegenprüfung nicht möglich – bitte selbst gegen die Fakten lesen.' });
  }
  return { text, refs: refFingerprints(input, used), checks, usages, model: res.usage.model };
}

module.exports = {
  gather, inputHash, legacyView, refFingerprints, staleness, modelInput, compareValue, rankOf, measuredDetail,
  generate, review, styleOf, styleExamples, parseBody, toBody, statements, checkText, recheck, summaryProblem, shorten,
  prompt, promptTemplate, SUMMARY_MAX, SUMMARY_TARGET, BANNED, DEFAULT_GUIDE, STALE_AFTER_MONTHS,
};
