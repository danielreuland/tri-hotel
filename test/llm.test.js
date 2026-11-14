const test = require('node:test');
const assert = require('node:assert/strict');
const llm = require('../src/lib/llm');

test('llm.priceFor: Modellfamilie aus der Modell-ID, unbekannt -> null', () => {
  assert.deepEqual(llm.priceFor('claude-opus-4-8', llm.DEFAULT_PRICES), llm.DEFAULT_PRICES.opus);
  assert.deepEqual(llm.priceFor('claude-sonnet-4-6', llm.DEFAULT_PRICES), llm.DEFAULT_PRICES.sonnet);
  // aktuelle Modelle haben eigene Preise (Sonnet 5.5: 2/10 $, Opus 5.5: 4/20 $), nicht die der älteren Familie
  assert.deepEqual(llm.priceFor('claude-sonnet-5-5', llm.DEFAULT_PRICES), { input: 2, output: 10, cacheRead: 0.1 });
  assert.deepEqual(llm.priceFor('claude-opus-5-5', llm.DEFAULT_PRICES), { input: 4, output: 20, cacheRead: 0.2 });
  assert.equal(llm.costOf('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e5, cache_read_input_tokens: 1e6 }, llm.DEFAULT_PRICES).usd, 3.1);
  assert.equal(llm.priceFor('irgendwas', llm.DEFAULT_PRICES), null);
  const own = { 'claude-sonnet-5-5': { input: 2, output: 10 }, sonnet: { input: 3, output: 15 } };
  assert.equal(llm.priceFor('claude-sonnet-5-5', own).input, 2, 'genaue Modell-ID vor Familie');
});

test('llm.costOf: Ein-/Ausgabe und Cache nach Preistabelle', () => {
  const prices = { opus: { input: 5, output: 25 } };
  const c = llm.costOf('claude-opus-5-5', { input_tokens: 40000, output_tokens: 3000 }, prices);
  assert.equal(c.usd, 0.275); // 0,20 + 0,075
  const cached = llm.costOf('claude-opus-5-5', { input_tokens: 0, cache_read_input_tokens: 100000, cache_creation_input_tokens: 0, output_tokens: 0 }, prices);
  assert.equal(cached.usd, 0.05);
  const unknown = llm.costOf('fremdes-modell', { input_tokens: 1000, output_tokens: 1000 }, prices);
  assert.equal(unknown.usd, 0);
  assert.equal(unknown.priced, false);
  assert.equal(llm.costOf('claude-opus-5-5', null, prices).usd, 0);
});

test('llm.formatTokens', () => {
  assert.equal(llm.formatTokens({ input: 38000, cacheRead: 0, cacheWrite: 0, output: 2500, usd: 0.2525 }), '38,0 Tsd. Tokens ein, 2,5 Tsd. aus, ca. 0,25 $');
});

test('KI-Budget: Eingabe aus dem Admin prüfen, gespeicherter Wert vor der .env', () => {
  assert.equal(llm.parseBudget('30'), 30);
  assert.equal(llm.parseBudget(' 30,5 '), 30.5);
  assert.equal(llm.parseBudget(12.345), 12.35);
  for (const bad of ['', null, undefined, 'abc', '0', '-5', '0,5', '501', 'Infinity']) assert.equal(llm.parseBudget(bad), null, String(bad));
  assert.deepEqual(llm.resolveBudget(30, 20), { usd: 30, source: 'admin' });
  assert.deepEqual(llm.resolveBudget(null, 20), { usd: 20, source: 'env' });
  assert.deepEqual(llm.resolveBudget('kaputt', 20), { usd: 20, source: 'env' });
  assert.deepEqual(llm.resolveBudget(null, null), { usd: null, source: 'env' }, 'ohne beides kein Limit');
});
