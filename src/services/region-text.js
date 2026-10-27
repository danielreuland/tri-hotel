// Redaktionstext je Region: eigener, einzigartiger Inhalt für die Regionsseite (Landschaft, Klima und Reisezeit, Strecken
// und Gewässer, Anreise, Ruhetag, Fazit). Grundlage sind unsere Regionsdaten; Landschaft, Orte, bekannte Strecken und
// Flughäfen darf die KI aus allgemein bekanntem Wissen ergänzen. Öffentlich erst nach Prüfung und Freigabe im Admin.
// Abschnitte zu Disziplinen kommen aus den Kategorien des Rankings (keine Sportart im Code).
const db = require('../db');
const rankings = require('./rankings');
const areas = require('./areas');
const camps = require('./camps');
const regionGuide = require('./region-guide');
const describer = require('./describer');
const seo = require('../lib/seo');
const { MONTHS } = require('../lib/util');

const r0 = (v) => (v === null || v === undefined ? null : Math.round(Number(v)));

// Alle Daten, auf denen der Text beruhen darf – kompakt und stabil sortiert (Grundlage für den Fingerabdruck)
async function gather(region) {
  const ranking = await rankings.getDefaultRanking(region.site_id);
  if (!ranking) return null;
  const area = areas.regionArea(region);
  const [[row], d, categories, campList, saved] = await Promise.all([
    regionGuide.load(ranking, region.site_id, { slugs: [region.slug] }),
    areas.pageData(ranking, area, null),
    rankings.getCategories(ranking.id),
    camps.list(region.site_id),
    db.one('SELECT notes FROM region_texts WHERE region_id = $1', [region.id]),
  ]);
  const climate = row ? row.climate : [];
  const reasons = regionGuide.bestTimeReasons(climate, ranking.formula, MONTHS);
  const all = [...d.ranked, ...d.incomplete];
  return {
    ranking: { name: ranking.name, entity: ranking.entity_label_sg, entities: ranking.entity_label_pl, categories: categories.map((c) => c.label) },
    region: { name: region.name, name_in: region.name_in, country: seo.countryName(region.country), radius_km: Number(region.radius_km), intro: region.intro || null },
    climate: climate.map((c) => ({
      month: MONTHS[Number(c.month) - 1], max_c: r0(c.avg_high_c), min_c: r0(c.avg_low_c), rain_days: r0(c.rain_days),
      sun_h: r0(c.sunshine_h), wind_kmh: r0(c.wind_kmh), sea_c: r0(c.sea_c),
    })),
    climate_point: regionGuide.climatePointNote(region),
    best_time: reasons,
    bike_area: row && row.bike ? { score_of_6: row.bike.score, facts: regionGuide.bikeText(row.bike) } : null,
    entities: {
      count: all.length,
      places: [...new Set(all.map((e) => e.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')),
    },
    features: d.featureGroups.map((g) => ({ group: g.label, items: g.items.map((f) => `${f.label}: ${f.n} von ${all.length}`) })),
    camps: campList.filter((p) => (p.regions || []).includes(region.name)).map((p) => p.name),
    notes: saved && saved.notes ? saved.notes.trim() : '',
  };
}

const inputHash = (input) => describer.inputHash(input);

// Prompt für den KI-Entwurf (im Admin unter Regionen dokumentiert)
function prompt(input) {
  const r = input.ranking;
  const g = input.region;
  return `Du schreibst für die unabhängige Übersicht „${r.name}“ den redaktionellen Text der Regionsseite ${g.name_in} (${g.country}).
Zielgruppe: Sportler, die ein Trainingslager planen und eine Region auswählen. Der Text steht auf der Regionsseite neben der Liste der geprüften ${r.entities}, der Klimatabelle und den Kennzahlen zum Radrevier.

Daten der Region (verlässliche Grundlage, Zahlen nur von hier):
${JSON.stringify(input, null, 2)}
${input.notes ? `
Redaktionelle Notizen (eigene Einschätzung der Redaktion, gleichrangig mit den Daten):
${input.notes}
` : ''}
Inhalt – Abschnitte in dieser Reihenfolge, jeweils mit kurzem, sprechendem Titel:
1. Landschaft und Charakter der Region: Küste, Gebirge, Seen, Vegetation, wie sich Training hier anfühlt.
2. Klima und beste Reisezeit: aus den Klimadaten und best_time – konkrete Monate und Werte (Temperatur, Regentage, Wind, Wasser), auch wann es zu heiß oder zu kühl wird.
3. Je ein Abschnitt für die Kategorien aus ranking.categories, die von der Region abhängen (Strecken, Gelände, Gewässer, Wege) – nicht für Hotel-Ausstattung wie Verpflegung oder Regeneration. Typische, bekannte Strecken, Anstiege, Wege, Seen oder Buchten mit Namen; dazu die Daten (bike_area, Wassertemperatur, Ausstattung der ${r.entities} wie Becken oder Bahnen).
4. Anreise und Gepäck: nächstgelegene Flughäfen, ungefähre Flugzeit aus Deutschland, Österreich und der Schweiz, Transfer, worauf man beim Transport von Sportgerät achten sollte.
5. Ruhetag und Ausflüge: zwei bis vier lohnende Ziele oder Erlebnisse in der Region.
6. Für wen sich die Region eignet: kurzes, klares Fazit – Stärken und Einschränkungen, Leistungsniveau, Jahreszeit.

Regeln:
- Zahlen (Temperaturen, Regentage, Wind, Wasser, Anzahl der ${r.entities}, Radrevier) ausschließlich aus den Daten.
- Allgemeines Wissen nur für gut belegte, dauerhafte Tatsachen: Landschaft, Orte, bekannte Strecken und Anstiege, Flughäfen, Sehenswürdigkeiten. Wenn du dir bei einem Namen oder einer Angabe nicht sicher bist, lass sie weg. Nichts erfinden.
- Keine Preise, Öffnungszeiten, Fahrpläne, Personen, Veranstaltungsdaten oder Links. Flugzeiten nur als grobe Spanne („etwa drei bis vier Stunden“).
- Keine Empfehlung einzelner ${r.entities} und kein Ranking – die Liste auf der Seite sortiert neutral. Orte, an denen die ${r.entities} liegen (entities.places), darfst du nennen.
- Keine Aussagen über unsere Prüfung, Datenqualität oder Methodik. Kein Wort über den Klimapunkt oder Modellwerte – das steht unter der Tabelle.
- Sachlich, Du-Form, kurze klare Sätze, konkret statt allgemein. Keine Werbesprache, keine leeren Superlative („Paradies“, „perfekt“, „traumhaft“), keine Buchungsaufforderung.
- Insgesamt 500–750 Wörter. Abschnitte 2–5 Sätze; ein Abschnitt darf aus zwei Absätzen bestehen (durch Leerzeile getrennt).

Ausgabe:
- summary: genau ein Satz, höchstens 155 Zeichen, mit Regionsname und dem wichtigsten Grund, hier zu trainieren (dient als Meta-Beschreibung).
- sections: die Abschnitte wie oben, jeweils title und text.`;
}

// Für die Dokumentation im Admin: Prompt mit Platzhaltern statt echter Daten
function promptTemplate(ranking) {
  const input = { ranking: { name: ranking.name, entity: ranking.entity_label_sg, entities: ranking.entity_label_pl, categories: ['[Kategorien des Rankings]'] },
    region: { name: '[Region]', name_in: '[in/auf der Region]', country: '[Land]' }, notes: '[Redaktionelle Notizen – nur wenn vorhanden]' };
  return prompt(input).replace(JSON.stringify(input, null, 2), '[Daten der Region als JSON: Klima je Monat, beste Reisezeit mit Begründung, Radrevier, Orte und Ausstattung der Objekte, Camps]');
}

async function generate(input) {
  const { z } = require('zod');
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const llm = require('../lib/llm');
  const Schema = z.object({ summary: z.string(), sections: z.array(z.object({ title: z.string(), text: z.string() })) });
  await llm.assertBudget();
  const response = await llm.anthropic().messages.parse(
    {
      model: llm.modelFor('describe'),
      max_tokens: 12000,
      output_config: { effort: 'medium', format: zodOutputFormat(Schema) },
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt(input) }],
    },
    { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } }
  );
  const usage = { model: response.model, raw: response.usage };
  if (response.stop_reason === 'refusal' || !response.parsed_output) return { text: null, usage };
  const p = response.parsed_output;
  return { text: { summary: describer.shorten(p.summary, describer.SUMMARY_MAX), body: describer.toBody({ sections: p.sections }) }, usage };
}

async function get(regionId) {
  return db.one('SELECT * FROM region_texts WHERE region_id = $1', [regionId]);
}

async function published(regionId) {
  return db.one(`SELECT summary, body, published_at FROM region_texts WHERE region_id = $1 AND status = 'published' AND body <> ''`, [regionId]);
}

const wordCount = (body) => String(body || '').replace(/^## .*$/gm, '').split(/\s+/).filter(Boolean).length;

module.exports = { gather, inputHash, prompt, promptTemplate, generate, get, published, wordCount };
