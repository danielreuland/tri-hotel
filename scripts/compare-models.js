// Vergleicht die Website-Extraktion mehrerer Modelle für ein Objekt – Probelauf, es wird nichts übernommen.
// Die Website wird einmal gelesen, jedes Modell bekommt denselben Text. Verbrauch landet als "compare" in llm_usage.
// Aufruf: npm run compare-models -- <slug oder Namensteil> [modell1 modell2 …]
// Beispiel: npm run compare-models -- zafiro-tropic claude-opus-5-5 claude-sonnet-5-5
const { pool, one } = require('../src/db');
const config = require('../src/config');
const rankings = require('../src/services/rankings');
const featureService = require('../src/services/features');
const extractor = require('../src/services/extractor');
const scoring = require('../src/services/scoring');
const llm = require('../src/lib/llm');

async function main() {
  const [query, ...models] = process.argv.slice(2);
  if (!query) throw new Error('Bitte Slug oder Namensteil des Objekts angeben.');
  if (config.llm.provider !== 'anthropic') throw new Error('LLM_PROVIDER ist nicht „anthropic“.');
  const list = models.length ? models : ['claude-opus-5-5', 'claude-sonnet-5-5'];

  const entity = await one(
    `SELECT * FROM entities WHERE slug = $1 OR name ILIKE '%' || $1 || '%' ORDER BY (slug = $1) DESC, name LIMIT 1`, [query]);
  if (!entity || !entity.website) throw new Error(`Kein Objekt mit Website zu „${query}“ gefunden.`);
  const er = await one(
    `SELECT er.ranking_id FROM entity_rankings er JOIN rankings r ON r.id = er.ranking_id WHERE er.entity_id = $1 ORDER BY r.is_default DESC LIMIT 1`,
    [entity.id]);
  const ranking = await rankings.getRanking(er.ranking_id);
  const criteria = await rankings.getCriteria(ranking.id);
  const catalog = await featureService.catalog(ranking.entity_type);

  console.log(`${entity.name} – ${entity.website}`);
  const pages = await extractor.fetchSite(entity.website, { labels: [...criteria.map((c) => c.label), ...catalog.map((f) => f.label)] });
  console.log(`${pages.length} Seiten gelesen, ${pages.reduce((n, p) => n + p.text.length, 0)} Zeichen Text\n`);

  const results = [];
  for (const model of list) {
    const t0 = Date.now();
    try {
      const found = await extractor.extract({ ranking, criteria, entity, pages, features: catalog, model });
      const cost = await llm.record({ purpose: 'compare', model: found.usage.model, usage: found.usage.raw, entityId: entity.id });
      results.push({ model, found, cost, secs: Math.round((Date.now() - t0) / 1000) });
    } catch (err) {
      results.push({ model, error: err.message });
    }
  }

  const critName = Object.fromEntries(criteria.map((c) => [c.id, c]));
  const featName = Object.fromEntries(catalog.map((f) => [f.id, f.label]));
  const show = (r) => {
    const facts = new Map(r.found.facts.map((f) => [critName[f.criterionId].label, scoring.describeValue(critName[f.criterionId], f.value)]));
    const feats = new Set(r.found.features.map((f) => featName[f.featureId]));
    return { facts, feats };
  };

  for (const r of results) {
    if (r.error) {
      console.log(`■ ${r.model}: Fehler – ${r.error}\n`);
      continue;
    }
    const { facts, feats } = show(r);
    console.log(`■ ${r.model}${r.found.usage.model !== r.model ? ` (geantwortet: ${r.found.usage.model})` : ''} – ${r.secs} s, ${llm.formatTokens(r.cost)}`);
    for (const [k, v] of facts) console.log(`   ${k}: ${v}`);
    if (feats.size) console.log(`   Leistungen: ${[...feats].join(', ')}`);
    console.log('');
  }

  // Unterschiede gegenüber dem ersten Modell
  const ok = results.filter((r) => !r.error);
  if (ok.length > 1) {
    const base = show(ok[0]);
    for (const r of ok.slice(1)) {
      const cur = show(r);
      const keys = new Set([...base.facts.keys(), ...cur.facts.keys()]);
      const diff = [...keys].filter((k) => base.facts.get(k) !== cur.facts.get(k))
        .map((k) => `   ${k}: ${base.facts.get(k) || '–'}  ↔  ${cur.facts.get(k) || '–'}`);
      const fa = [...base.feats].filter((f) => !cur.feats.has(f));
      const fb = [...cur.feats].filter((f) => !base.feats.has(f));
      console.log(`Unterschiede ${ok[0].model} ↔ ${r.model}:`);
      console.log(diff.length ? diff.join('\n') : '   Werte identisch');
      if (fa.length || fb.length) console.log(`   Leistungen nur links: ${fa.join(', ') || '–'} · nur rechts: ${fb.join(', ') || '–'}`);
      console.log(`   Kosten: ${ok[0].cost.usd.toFixed(3)} $ ↔ ${r.cost.usd.toFixed(3)} $\n`);
    }
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
