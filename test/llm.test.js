const test = require('node:test');
const assert = require('node:assert/strict');
const llm = require('../src/lib/llm');

test('llm.priceFor: Modellfamilie aus der Modell-ID, unbekannt -> null', () => {
  assert.deepEqual(llm.priceFor('claude-opus-5-5', llm.DEFAULT_PRICES), llm.DEFAULT_PRICES.opus);
  assert.deepEqual(llm.priceFor('claude-sonnet-5-5', llm.DEFAULT_PRICES), llm.DEFAULT_PRICES.sonnet);
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
