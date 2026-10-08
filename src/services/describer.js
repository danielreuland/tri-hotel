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
  const result = scoring.computeScore(criteria, rankings.factMap(facts), climate, { formula: ranking.formula, labels: ranking.labels });
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

  const best = seo.bestMonths(criteria, climate);
  const climateTable = climate
    .slice().sort((a, b) => a.month - b.month)
    .map((r) => ({ month: MONTHS[r.month - 1], max_c: r.avg_high_c === null ? null : Math.round(r.avg_high_c), rain_days: r.rain_days === null ? null : Math.round(r.rain_days) }));

  return {
    ranking: { name: ranking.name, score_name: ranking.score_name, entity: ranking.entity_label_sg, entities: ranking.entity_label_pl },
    entity: { name: entity.name, city: entity.city, country: entity.country ? seo.countryName(entity.country) : null, region: regionList[0] ? regionList[0].name : null },
    score: { label: result.label, eligible: result.eligible, completeness: Math.round(result.completeness) },
    categories: cats,
    best_months: best.length ? seo.monthRanges(best, MONTHS) : null,
    climate: climateTable,
    features: feats.map((f) => f.label),
  };
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

function prompt(input) {
  const r = input.ranking;
  return `Du schreibst für die unabhängige Übersicht „${r.name}“ einen kurzen redaktionellen Text über ein ${r.entity}.
Zielgruppe: Leute, die ein ${r.entity} für genau diesen Zweck suchen. Der Text steht auf der Profilseite über den Detailtabellen.

Daten (einzige erlaubte Grundlage):
${JSON.stringify(input, null, 2)}

Regeln:
- Nutze ausschließlich die Daten oben. Erfinde nichts, auch keine Zahlen, Entfernungen, Namen, Ausstattung oder Eindrücke.
- Werte mit Quelle „automatisch ermittelt“ vorsichtig formulieren („laut Website“, „laut Karte“).
- Sachlich und neutral, Du-Form. Keine Werbesprache und keine Superlative („Paradies“, „perfekt“, „traumhaft“), keine Preise, keine Personen, keine Buchungsaufforderung, keine Links.
- Nenne keine ${r.score_name}-Zahl und keine Punktzahlen (die stehen daneben); die Stufe („${input.score.label || ''}“) darfst du sinngemäß einordnen.
- Stärken klar benennen, Schwächen und wichtige unbekannte Punkte ehrlich nennen („noch nicht bestätigt“).
- Keine Aussagen über unsere Prüfung oder Datenqualität („alle Angaben geprüft“, „vollständig“) – das zeigt die Seite selbst.
- Nicht jede Ausstattung aufzählen: die 2–4 wichtigsten je Abschnitt, Details stehen in den Tabellen darunter.
- Insgesamt 150–220 Wörter.

Ausgabe:
- summary: genau ein Satz, höchstens 155 Zeichen, mit Name, Ort und der wichtigsten Stärke für die Zielgruppe.
- sections: 3–5 Abschnitte mit kurzem Titel (z. B. nach den Kategorien der Daten, „Beste Reisezeit“ aus Klima/best_months, „Anreise“ falls Daten vorhanden), je 1–3 Sätze. Der erste Abschnitt ist ein Kurzfazit: Für wen passt das ${r.entity}?
- good_to_know: 1–4 kurze Punkte zu Einschränkungen oder offenen Fragen; leer, wenn es nichts Relevantes gibt.`;
}

async function generate(input) {
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
      messages: [{ role: 'user', content: prompt(input) }],
    },
    { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } }
  );
  const usage = { model: response.model, raw: response.usage };
  if (response.stop_reason === 'refusal' || !response.parsed_output) return { text: null, usage };
  const p = response.parsed_output;
  return { text: { summary: shorten(p.summary, SUMMARY_MAX), body: toBody(p) }, usage };
}

module.exports = { gather, inputHash, generate, parseBody, toBody, shorten, prompt, SUMMARY_MAX };
