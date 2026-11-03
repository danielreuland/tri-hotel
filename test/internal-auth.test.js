const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/lib/internal-auth');
const vectors = require('../docs/internal-api/fixtures/signature-examples.json');

const SECRET = 'a'.repeat(32);
const OLD = 'b'.repeat(40);
const lower = (h) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
const NOW = 1793620800 * 1000;

test('Signatur: Testvektoren aus dem Vertrag (auch für den Hub)', () => {
  for (const v of vectors.examples) {
    assert.equal(auth.canonical(v), v.canonical);
    assert.equal(auth.sign(v.secret, v), v.signature);
  }
  assert.equal(auth.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(auth.sha256Hex(undefined), auth.sha256Hex(''));
});

test('Schlüssel-Parser: mehrere Apps, mehrere Schlüssel je App, ungültige übersprungen', () => {
  const warnings = [];
  const keys = auth.parseKeys(` hub:${SECRET}, hub:${OLD},triprep:kurz, :${SECRET},HUB!:${SECRET},,ohnedoppelpunkt`, { warn: (m) => warnings.push(m) });
  assert.deepEqual([...keys.keys()], ['hub']);
  assert.deepEqual(keys.get('hub'), [SECRET, OLD]);
  assert.equal(warnings.length, 4);
  assert.ok(warnings.every((w) => !w.includes(SECRET)), 'Geheimnisse nie im Log');
  assert.equal(auth.parseKeys('').size, 0);
  assert.equal(auth.parseKeys(undefined).size, 0);
  // Doppelpunkte im Geheimnis bleiben erhalten
  assert.deepEqual(auth.parseKeys(`hub:${SECRET}:x`, { warn: () => {} }).get('hub'), [`${SECRET}:x`]);
});

test('verify: gültige Anfrage, auch mit altem Schlüssel (Schlüsselwechsel)', () => {
  const keys = auth.parseKeys(`hub:${SECRET},hub:${OLD}`);
  const req = { method: 'GET', path: '/internal/v1/stats' };
  for (const secret of [SECRET, OLD]) {
    const h = lower(auth.headers({ app: 'hub', secret, ...req, now: NOW }));
    assert.deepEqual(auth.verify({ keys, headers: h, ...req, now: NOW }), { ok: true, app: 'hub', nonce: null });
  }
});

test('verify: Zeitfenster ±300 s', () => {
  const keys = auth.parseKeys(`hub:${SECRET}`);
  const req = { method: 'GET', path: '/internal/v1/stats' };
  const h = lower(auth.headers({ app: 'hub', secret: SECRET, ...req, now: NOW }));
  assert.equal(auth.verify({ keys, headers: h, ...req, now: NOW + 300 * 1000 }).ok, true);
  assert.equal(auth.verify({ keys, headers: h, ...req, now: NOW - 300 * 1000 }).ok, true);
  assert.equal(auth.verify({ keys, headers: h, ...req, now: NOW + 301 * 1000 }).reason, 'expired');
  assert.equal(auth.verify({ keys, headers: h, ...req, now: NOW - 301 * 1000 }).reason, 'expired');
  assert.equal(auth.verify({ keys, headers: { ...h, 'x-internal-timestamp': '12.5' }, ...req, now: NOW }).reason, 'bad_timestamp');
});

test('verify: falsche Signatur, anderer Pfad/Body/Methode, unbekannte App, fehlende Header', () => {
  const keys = auth.parseKeys(`hub:${SECRET}`);
  const req = { method: 'GET', path: '/internal/v1/entities?q=club' };
  const h = lower(auth.headers({ app: 'hub', secret: SECRET, ...req, now: NOW }));
  const v = (over, hdr = h) => auth.verify({ keys, headers: hdr, ...req, now: NOW, ...over });
  assert.equal(v({ path: '/internal/v1/entities?q=clubx' }).reason, 'bad_signature');
  assert.equal(v({ method: 'POST' }).reason, 'bad_signature');
  assert.equal(v({ body: 'x' }).reason, 'bad_signature');
  assert.equal(v({}, { ...h, 'x-internal-signature': 'f'.repeat(64) }).reason, 'bad_signature');
  assert.equal(v({}, { ...h, 'x-internal-signature': 'zu-kurz' }).reason, 'bad_signature');
  assert.equal(v({}, { ...h, 'x-internal-signature': h['x-internal-signature'].toUpperCase() }).ok, true, 'Hex in Großbuchstaben ok');
  assert.equal(v({}, { ...h, 'x-internal-app': 'triprep' }).reason, 'unknown_app');
  assert.equal(v({}, { ...h, 'x-internal-app': 'Hub!' }).reason, 'bad_app');
  assert.equal(v({}, { 'x-internal-app': 'hub' }).reason, 'missing_headers');
  assert.equal(auth.verify({ keys: new Map(), headers: h, ...req, now: NOW }).reason, 'unknown_app');
});

test('verify: Nonce ist Teil der Signatur und kann Pflicht sein', () => {
  const keys = auth.parseKeys(`tri-hotel:${SECRET}`);
  const req = { method: 'POST', path: '/internal/v1/events', body: '{"id":"1"}' };
  const nonce = '5f0c7c1e-8d2b-4f6a-9e3d-1a2b3c4d5e6f';
  const h = lower(auth.headers({ app: 'tri-hotel', secret: SECRET, ...req, nonce, now: NOW }));
  assert.equal(h['x-internal-nonce'], nonce);
  assert.deepEqual(auth.verify({ keys, headers: h, ...req, now: NOW, requireNonce: true }), { ok: true, app: 'tri-hotel', nonce });
  assert.equal(auth.verify({ keys, headers: { ...h, 'x-internal-nonce': `${nonce.slice(0, -1)}0` }, ...req, now: NOW }).reason, 'bad_signature');
  assert.equal(auth.verify({ keys, headers: { ...h, 'x-internal-nonce': 'kurz' }, ...req, now: NOW }).reason, 'bad_nonce');
  const without = lower(auth.headers({ app: 'tri-hotel', secret: SECRET, ...req, now: NOW }));
  assert.equal(auth.verify({ keys, headers: without, ...req, now: NOW, requireNonce: true }).reason, 'missing_nonce');
  assert.equal(auth.verify({ keys, headers: without, ...req, now: NOW }).ok, true);
});
