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

function build(d) {
  const items = [];
  const add = (level, text, anchor, detail) => items.push({ level, text, anchor, detail: detail || null });
  const { sub, ranking, criteria, facts, climate, entity, result, images, text, textStale, inquiryList, manualFeatures, duplicateOf } = d;
  const entityLabel = ranking.entity_label_sg;

  if (!entity) {
    add('block', 'Noch kein Objekt angelegt – Auto-Prüfung starten.', null);
    return summarize(items);
  }
  if (sub.possible_duplicate_of && duplicateOf && sub.status !== 'duplicate') add('block', `Mögliche Dublette von „${duplicateOf.name}“ entscheiden.`, null);
  if (result.ko) add('block', `K.O.-Regel greift: ${result.koReason}`, 'fakten');

  // Koordinaten und Klima
  if (entity.lat === null) add('block', 'Koordinaten fehlen – ohne sie keine Karte, kein Klima, keine Umgebung.', 'stammdaten');
  else if (/ungefähr/i.test((entity.attributes || {}).geo_source || '')) add('todo', 'Koordinaten sind nur ungefähr – Lage prüfen und genau eintragen.', 'stammdaten', entity.attributes.geo_source);
  if (entity.lat !== null && !(climate || []).length) add('todo', 'Klimadaten fehlen – Auto-Prüfung erneut starten.', null);

  // Fakten: automatische Vorschläge, strittige, fehlende
  const auto = facts.filter((f) => f.trust_level === 4);
  if (auto.length) add('todo', `${auto.length} automatisch ermittelte ${auto.length === 1 ? 'Wert' : 'Werte'} bestätigen oder korrigieren.`, 'fakten');
  const disputed = facts.filter((f) => f.disputed);
  if (disputed.length) add('todo', `${disputed.length} strittige ${disputed.length === 1 ? 'Wert' : 'Werte'} klären.`, 'fakten');
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
    add(level, `${why} Fehlend: ${names}${more}.`, 'fakten');
  }

  // Leistungen, Anfragen, Kontakt
  const autoFeatures = (manualFeatures || []).filter((f) => f.trust_level === 4);
  if (autoFeatures.length) add('todo', `${autoFeatures.length} automatisch erkannte ${autoFeatures.length === 1 ? 'Leistung' : 'Leistungen'} bestätigen.`, 'leistungen');
  const pendingAnswers = (inquiryList || []).reduce((n, i) => n + (i.answers || []).filter((a) => a.status === 'pending').length, 0);
  if (pendingAnswers) add('todo', `${pendingAnswers} ${pendingAnswers === 1 ? 'Antwort' : 'Antworten'} des Betreibers übernehmen oder verwerfen.`, 'anfragen');
  if (!entity.contact_email) add('hint', `Keine Kontakt-E-Mail – ohne sie keine Anfragen an das ${entityLabel}.`, 'stammdaten');

  // Bilder und Text
  const pendingImages = (images || []).filter((i) => !i.approved_at);
  if (pendingImages.length) add('todo', `${pendingImages.length} ${pendingImages.length === 1 ? 'Bild wartet' : 'Bilder warten'} auf Freigabe.`, 'bilder');
  if (!text) add('hint', 'Noch kein Beschreibungstext.', 'text');
  else if (text.status !== 'published') add('todo', 'Beschreibungstext prüfen und freigeben.', 'text');
  else if (textStale) add('todo', 'Beschreibungstext ist veraltet – Fakten haben sich geändert.', 'text');

  // Fehlgeschlagene Schritte der Auto-Prüfung (nur, wenn nicht oben schon abgedeckt)
  for (const l of failedSteps(sub.pipeline_log)) {
    if (/Koordinaten|Dubletten/.test(l.step)) continue;
    add('todo', `Auto-Prüfung: „${stepKey(l.step)}“ fehlgeschlagen.`, null, l.info);
  }
  return summarize(items);
}

function summarize(items) {
  const order = { block: 0, todo: 1, hint: 2 };
  items.sort((a, b) => order[a.level] - order[b.level]);
  return { items, open: items.filter((i) => i.level !== 'hint').length, blockers: items.filter((i) => i.level === 'block').length };
}

module.exports = { build, failedSteps, stepKey };
