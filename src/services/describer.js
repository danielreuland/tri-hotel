// Redaktioneller Beschreibungstext je Objekt: Entwurf ausschließlich aus unseren geprüften Daten
// (Fakten, Klima, Leistungen, Region) – nie aus fremden Website-Texten. Öffentlich erst nach Admin-Freigabe.
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const rankings = require('./rankings');
const scoring = require('./scoring');
const featureService = require('./features');
const areas = require('./areas');
const seo = require('../lib/seo');
const { MONTHS } = require('../lib/util');

const SOURCE = { 1: 'vom Betreiber bestätigt', 2: 'redaktionell geprüft', 3: 'von Nutzern bestätigt', 4: 'automatisch ermittelt (laut Website/Karte)' };
const SUMMARY_MAX = 160;

// Alle Daten, auf denen der Text beruhen darf – kompakt und stabil sortiert (Grundlage für den Fingerabdruck)
async function gather(entityId, rankingId) {
  const ranking = await rankings.getRanking(rankingId);
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [entityId]);
  if (!ranking || !entity) return null;
  const [categories, criteria, facts, climate, feats, regionList] = await Promise.all([
    rankings.getCategories(ranking.id),
    rankings.getCriteria(ranking.id),
    rankings.getFacts(entity.id, ranking.id),
    rankings.getClimate(entity.id),
    featureService.forEntity(ranking.entity_type, entity.id),
    areas.regionsOf(ranking.site_id, entity),
  ]);
  const result = scoring.computeScore(criteria, rankings.factMap(facts), climate, await rankings.scoreOptions(ranking));
  const factBy = new Map(facts.map((f) => [f.criterion_id, f]));
  const detailBy = new Map(result.details.map((d) => [d.criterionId, d]));

  const cats = categories.map((cat) => {
    const list = criteria.filter((c) => c.category_id === cat.id && c.scoring.type !== 'climate');
    const known = [];
    const unknown = [];
    for (const c of list) {
      const f = factBy.get(c.id);
      const d = detailBy.get(c.id);
      if (f && d && d.known) {
        known.push({ criterion: c.label, value: scoring.describeValue(c, f.value), points: d.points, max: d.max, source: SOURCE[f.trust_level] || SOURCE[4] });
      } else {
        unknown.push(c.label);
      }
    }
    const pts = known.reduce((s, k) => s + k.points, 0);
    const max = list.reduce((s, c) => s + Number(c.max_points), 0);
    return { category: cat.label, points: pts, max, known, unknown };
  }).filter((c) => c.known.length || c.unknown.length);

  const best = seo.bestMonths(ranking.formula, climate);
  const climateTable = climate
    .slice().sort((a, b) => a.month - b.month)
    .map((r) => ({ month: MONTHS[r.month - 1], max_c: r.avg_high_c === null ? null : Math.round(r.avg_high_c), rain_days: r.rain_days === null ? null : Math.round(r.rain_days) }));

  const saved = await db.one('SELECT notes FROM entity_texts WHERE entity_id = $1 AND ranking_id = $2', [entity.id, ranking.id]);
  const notes = saved && saved.notes ? saved.notes.trim() : '';
  return {
    ranking: { name: ranking.name, score_name: ranking.score_name, entity: ranking.entity_label_sg, entities: ranking.entity_label_pl },
    entity: { name: entity.name, city: entity.city, country: entity.country ? seo.countryName(entity.country) : null, region: regionList[0] ? regionList[0].name : null },
    score: { label: result.label, eligible: result.eligible, completeness: Math.round(result.completeness) },
    categories: cats,
    best_months: best.length ? seo.monthRanges(best, MONTHS) : null,
    climate: climateTable,
    features: feats.map((f) => f.label),
    // nur wenn vorhanden, damit bestehende Fingerabdrücke gültig bleiben
    ...(notes ? { notes } : {}),
  };
}

// Stilvorlage: zuletzt vom Admin freigegebener und überarbeiteter (oder selbst geschriebener) Text desselben Rankings
async function styleExample(rankingId, entityId) {
  return db.one(
    `SELECT t.summary, t.body, e.name FROM entity_texts t JOIN entities e ON e.id = t.entity_id
      WHERE t.ranking_id = $1 AND t.entity_id <> $2 AND t.status = 'published' AND t.body <> ''
        AND (t.generated_body IS NULL OR t.generated_body <> t.body)
      ORDER BY t.published_at DESC NULLS LAST LIMIT 1`, [rankingId, entityId]);
}

function inputHash(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32);
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

function toBody(parsed) {
  const parts = [];
  for (const s of parsed.sections || []) {
    const title = clean(s.title);
    const text = clean(s.text);
    if (!text) continue;
    parts.push(title ? `## ${title}\n\n${text}` : text);
  }
  const notes = (parsed.good_to_know || []).map(clean).filter(Boolean);
  if (notes.length) parts.push(`## Gut zu wissen\n\n${notes.map((n) => `- ${n}`).join('\n')}`);
  return parts.join('\n\n');
}

// Prompt für den KI-Entwurf. example = Stilvorlage (nur Ton, nicht Inhalt). Wird im Admin unter Inhalte → KI-Texte dokumentiert.
function prompt(input, example = null) {
  const r = input.ranking;
  const label = input.score && input.score.label;
  return `Du schreibst für die unabhängige Übersicht „${r.name}“ einen kurzen redaktionellen Text über ein ${r.entity}.
Zielgruppe: Sportler, die ein ${r.entity} genau für diesen Zweck suchen. Der Text steht auf der Profilseite über den Detailtabellen.

Daten (einzige erlaubte Grundlage):
${JSON.stringify(input, null, 2)}
${input.notes ? `
Redaktionelle Notizen (eigene Einschätzung der Redaktion, gleichrangig mit den Daten):
${input.notes}
` : ''}${example ? `
Stilvorlage – ein von der Redaktion überarbeiteter Text zu einem anderen ${r.entity} („${example.name}“).
Übernimm Ton, Satzbau und Auswahl, aber keinen Inhalt daraus:
"""
${example.summary}

${example.body}
"""
` : ''}
Inhalt:
- Nutze ausschließlich die Daten${input.notes ? ' und die redaktionellen Notizen' : ''}. Erfinde nichts: keine Zahlen, Entfernungen, Namen, Ausstattung, Lage oder Eindrücke.
${input.notes ? '- Die Notizen sind unsere Einschätzung: einbauen, wo sie passen, sachlich und ohne zu übertreiben.
' : ''}- Werte mit Quelle „automatisch ermittelt“ vorsichtig formulieren („laut Website“, „laut Karte“).
- „nein“ heißt: gibt es nicht (bestätigt). Kriterien unter „unknown“ sind noch nicht bestätigt – nur so benennen, wenn sie für die Zielgruppe wichtig sind.
- Pro Abschnitt nur die 2–3 wichtigsten Punkte. Keine Aufzählungen von Ausstattung im Fließtext; die Details stehen in den Tabellen darunter.
- Lücken nur nennen, wenn sie zählen: Kriterien mit max ≥ 3 oder eine ganze Kategorie ohne Angebot. Kleinigkeiten weglassen.
- Allgemeine Ausstattung (z. B. Parkplatz, Kinderbetreuung, Barrierefreiheit) nur erwähnen, wenn sie für die Zielgruppe etwas bedeutet.

Sprache:
- Schreib wie ein erfahrener Sportler, der einem Freund das ${r.entity} beschreibt: Was bedeutet das konkret fürs Training?
- Übersetze Daten in Alltagssprache. Zitiere keine Kriteriennamen, Skalen, Grenzwerte oder Punkte: nicht „8 von 10“, sondern „sehr gut“; nicht „≤ 1 km“, sondern „in wenigen Minuten“; nicht „≥ 25 °C“, sondern „angenehm warm“.
- Kein „laut Daten“, keine ${r.score_name}-Zahl, keine Punktzahl und kein Stufenname in Anführungszeichen. Die Einordnung${label ? ` (${label})` : ''} sinngemäß ausdrücken („gehört zu den stärksten Adressen“).
- Sachlich, Du-Form, kurze klare Sätze, abwechslungsreicher Satzbau. Keine Werbesprache, keine leeren Superlative („Paradies“, „perfekt“, „traumhaft“), keine Preise, keine Personen, keine Buchungsaufforderung, keine Links.
- Keine Aussagen über unsere Prüfung oder Datenqualität („alle Angaben geprüft“, „vollständig“).
- Insgesamt 150–220 Wörter.

Ausgabe:
- summary: genau ein Satz, höchstens 155 Zeichen, mit Name, Ort und der wichtigsten Stärke für die Zielgruppe.
- sections: 3–5 Abschnitte mit kurzem Titel, je 1–3 Sätze, entlang der Kategorien der Daten (verwandte zusammenfassen). Der erste Abschnitt ist ein Kurzfazit mit klarem Urteil: Für wen passt das ${r.entity}, was ist seine größte Stärke? Schwächen gehören nicht ins Kurzfazit, sondern unter good_to_know. Wenn best_months vorhanden ist, ein Abschnitt zur besten Reisezeit (mit Anreise, falls Daten vorhanden).
- good_to_know: 1–4 kurze Punkte zu relevanten Einschränkungen oder offenen Fragen; leer, wenn es nichts Wichtiges gibt.`;
}

// Für die Dokumentation im Admin: Prompt mit Platzhaltern statt echter Daten
function promptTemplate(ranking) {
  const input = { ranking: { name: ranking.name, score_name: ranking.score_name, entity: ranking.entity_label_sg, entities: ranking.entity_label_pl }, score: { label: '[Stufe]' }, notes: '[Redaktionelle Notizen des Objekts – nur wenn vorhanden]' };
  return prompt(input, { name: '[anderes Objekt]', summary: '[Kurzbeschreibung]', body: '[Text – nur wenn es eine überarbeitete Freigabe gibt]' })
    .replace(JSON.stringify(input, null, 2), '[Daten des Objekts als JSON: Kategorien mit bekannten Werten (Wert, Quelle, Punkte, max) und unbekannten Kriterien, Stufe, beste Reisezeit, Klima je Monat, Leistungen]');
}

async function generate(input, example = null) {
  const { z } = require('zod');
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const llm = require('../lib/llm');
  const Schema = z.object({
    summary: z.string(),
    sections: z.array(z.object({ title: z.string(), text: z.string() })),
    good_to_know: z.array(z.string()),
  });
  await llm.assertBudget();
  const response = await llm.anthropic().messages.parse(
    {
      model: llm.modelFor('describe'),
      max_tokens: 8000,
      output_config: { effort: 'medium', format: zodOutputFormat(Schema) },
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt(input, example) }],
    },
    { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } }
  );
  const usage = { model: response.model, raw: response.usage };
  if (response.stop_reason === 'refusal' || !response.parsed_output) return { text: null, usage };
  const p = response.parsed_output;
  return { text: { summary: shorten(p.summary, SUMMARY_MAX), body: toBody(p) }, usage };
}

module.exports = { gather, inputHash, generate, styleExample, parseBody, toBody, shorten, prompt, promptTemplate, SUMMARY_MAX };
