// Prüfliste für die Admin-Prüfansicht: was vor bzw. nach der Freigabe noch zu tun ist.
// Wird bei jedem Aufruf aus dem aktuellen Stand berechnet – erledigte Punkte verschwinden von selbst.
// level: 'block' = verhindert Freigabe oder Ranking · 'todo' = bitte prüfen · 'hint' = empfohlen

// Schrittname ohne Zusatz („Umgebung (OpenStreetMap), Versuch 2“ -> „Umgebung (OpenStreetMap)“)
const stepKey = (name) => String(name || '').split(',')[0].trim();

// Letzter Stand je Auto-Prüfungsschritt; nur Schritte, deren letzter Eintrag fehlgeschlagen ist
function failedSteps(log) {
  const last = new Map();
  for (const l of log || []) last.set(stepKey(l.step), l);
  return [...last.values()].filter((l) => !l.ok);
}

// key: stabiler Name des Punkts (für „erledigt“); dismissable: darf der Admin ihn ausblenden?
function build(d, dismissals = []) {
  const items = [];
  const add = (level, text, anchor, detail, key, dismissable = level !== 'block') =>
    items.push({ level, text, anchor, detail: detail || null, key: key || text, dismissable });
  const { sub, ranking, criteria, facts, climate, entity, result, images, text, textStale, inquiryList, manualFeatures, duplicateOf } = d;
  const entityLabel = ranking.entity_label_sg;

  if (!entity) {
    add('block', 'Noch kein Objekt angelegt – Auto-Prüfung starten.', null, null, 'no-entity');
    return summarize(items);
  }
  if (sub.possible_duplicate_of && duplicateOf && sub.status !== 'duplicate') add('block', `Mögliche Dublette von „${duplicateOf.name}“ entscheiden.`, null, null, 'duplicate');
  if (result.ko) add('block', `K.O.-Regel greift: ${result.koReason}`, 'fakten', null, 'ko');

  // Koordinaten und Klima
  if (entity.lat === null) add('block', 'Koordinaten fehlen – ohne sie keine Karte, kein Klima, keine Umgebung.', 'stammdaten', null, 'coords-missing');
  else if (/ungefähr/i.test((entity.attributes || {}).geo_source || '')) add('todo', 'Koordinaten sind nur ungefähr – Lage prüfen und genau eintragen.', 'stammdaten', entity.attributes.geo_source, 'coords-approx');
  if (entity.lat !== null && !(climate || []).length) add('todo', 'Klimadaten fehlen – Auto-Prüfung erneut starten.', null, null, 'climate');

  // Fakten: automatische Vorschläge, strittige, fehlende
  const auto = facts.filter((f) => f.trust_level === 4);
  if (auto.length) add('todo', `${auto.length} automatisch ermittelte ${auto.length === 1 ? 'Wert' : 'Werte'} bestätigen oder korrigieren.`, 'fakten', null, 'auto-facts');
  const disputed = facts.filter((f) => f.disputed);
  if (disputed.length) add('todo', `${disputed.length} strittige ${disputed.length === 1 ? 'Wert' : 'Werte'} klären.`, 'fakten', null, 'disputed');
  const have = new Set(facts.map((f) => f.criterion_id));
  const missing = criteria.filter((c) => c.scoring.type !== 'climate' && !have.has(c.id)).sort((a, b) => b.max_points - a.max_points);
  const minCompleteness = Number((ranking.formula || {}).min_completeness ?? 70);
  if (missing.length) {
    const names = missing.slice(0, 5).map((c) => `${c.label} (${c.max_points})`).join(', ');
    const more = missing.length > 5 ? ` und ${missing.length - 5} weitere` : '';
    const level = result.completeness < minCompleteness ? 'block' : 'hint';
    const why = result.completeness < minCompleteness
      ? `Vollständigkeit ${Math.round(result.completeness)} % – fürs Ranking nötig: ${minCompleteness} %.`
      : `${missing.length} Kriterien noch unbekannt.`;
    add(level, `${why} Fehlend: ${names}${more}.`, 'fakten', null, 'missing');
  }

  // Leistungen, Anfragen, Kontakt
  const autoFeatures = (manualFeatures || []).filter((f) => f.trust_level === 4);
  if (autoFeatures.length) add('todo', `${autoFeatures.length} automatisch erkannte ${autoFeatures.length === 1 ? 'Leistung' : 'Leistungen'} bestätigen.`, 'leistungen', null, 'auto-features');
  const pendingAnswers = (inquiryList || []).reduce((n, i) => n + (i.answers || []).filter((a) => a.status === 'pending').length, 0);
  if (pendingAnswers) add('todo', `${pendingAnswers} ${pendingAnswers === 1 ? 'Antwort' : 'Antworten'} des Betreibers übernehmen oder verwerfen.`, 'anfragen', null, 'answers');
  const draft = (inquiryList || []).find((i) => i.status === 'draft');
  if (draft) add('todo', `Anfrage-Entwurf an ${draft.recipient} (${draft.criteria_ids.length} Fragen) freigeben oder verwerfen.`, 'anfragen', null, 'inquiry-draft', false);
  if (!entity.contact_email) add('hint', `Keine Kontakt-E-Mail – ohne sie keine Anfragen an das ${entityLabel}.`, 'stammdaten', null, 'contact');

  // Bilder und Text
  const pendingImages = (images || []).filter((i) => !i.approved_at);
  if (pendingImages.length) add('todo', `${pendingImages.length} ${pendingImages.length === 1 ? 'Bild wartet' : 'Bilder warten'} auf Freigabe.`, 'bilder', null, 'images');
  if (!text) add('hint', 'Noch kein Beschreibungstext.', 'text', null, 'text-missing');
  else if (text.status !== 'published') add('todo', 'Beschreibungstext prüfen und freigeben.', 'text', null, 'text-draft');
  else if (textStale) add('todo', 'Beschreibungstext ist veraltet – Fakten haben sich geändert.', 'text', null, 'text-stale');

  // Fehlgeschlagene Schritte der Auto-Prüfung (nur, wenn nicht oben schon abgedeckt)
  for (const l of failedSteps(sub.pipeline_log)) {
    if (/Koordinaten|Dubletten/.test(l.step)) continue;
    add('todo', `Auto-Prüfung: „${stepKey(l.step)}“ fehlgeschlagen.`, null, l.info, `step:${stepKey(l.step)}`);
  }
  // Vom Admin als erledigt markierte Punkte ausblenden – solange sich der Punkt nicht geändert hat
  const done = new Map(dismissals.map((x) => [x.item_key, x.fingerprint]));
  const visible = items.filter((i) => !(i.dismissable && done.get(i.key) === fingerprint(i)));
  return { ...summarize(visible), dismissed: items.length - visible.length };
}

function fingerprint(item) {
  return `${item.text}|${item.detail || ''}`;
}

function summarize(items) {
  const order = { block: 0, todo: 1, hint: 2 };
  items.sort((a, b) => order[a.level] - order[b.level]);
  return { items, open: items.filter((i) => i.level !== 'hint').length, blockers: items.filter((i) => i.level === 'block').length };
}

// Alle Daten für die Prüfliste eines Objekts (für Aufgaben und Warteschlange)
async function load(submissionId) {
  const db = require('../db');
  const rankings = require('./rankings');
  const scoring = require('./scoring');
  const describer = require('./describer');
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  if (!sub || !sub.entity_id) return null;
  const ranking = await rankings.getRanking(sub.ranking_id);
  const [criteria, entity, facts, climate] = await Promise.all([
    rankings.getCriteria(ranking.id), db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]),
    rankings.getFacts(sub.entity_id, ranking.id), rankings.getClimate(sub.entity_id),
  ]);
  const result = scoring.computeScore(criteria, rankings.factMap(facts), climate, { formula: ranking.formula, labels: ranking.labels });
  const [images, text, manualFeatures, inquiryList, dismissals] = await Promise.all([
    db.many('SELECT id, approved_at FROM entity_images WHERE entity_id = $1', [entity.id]),
    db.one('SELECT * FROM entity_texts WHERE entity_id = $1 AND ranking_id = $2', [entity.id, ranking.id]),
    db.many('SELECT * FROM entity_features WHERE entity_id = $1', [entity.id]),
    db.many('SELECT * FROM inquiries WHERE entity_id = $1 AND ranking_id = $2', [entity.id, ranking.id]),
    db.many('SELECT * FROM review_dismissals WHERE entity_id = $1 AND ranking_id = $2', [entity.id, ranking.id]),
  ]);
  const answers = inquiryList.length
    ? await db.many(`SELECT inquiry_id, status FROM inquiry_answers WHERE inquiry_id = ANY($1::uuid[])`, [inquiryList.map((i) => i.id)])
    : [];
  for (const i of inquiryList) i.answers = answers.filter((a) => a.inquiry_id === i.id);
  const textStale = Boolean(text && text.input_hash && describer.inputHash(await describer.gather(entity.id, ranking.id)) !== text.input_hash);
  const duplicateOf = sub.possible_duplicate_of ? await db.one('SELECT id, name FROM entities WHERE id = $1', [sub.possible_duplicate_of]) : null;
  const d = { sub, ranking, criteria, facts, climate, entity, result, images, text, textStale, inquiryList, manualFeatures, duplicateOf };
  return { sub, entity, ranking, result, review: build(d, dismissals) };
}

module.exports = { build, load, fingerprint, failedSteps, stepKey };
