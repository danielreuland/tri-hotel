const test = require('node:test');
const assert = require('node:assert/strict');
const rich = require('../src/lib/richtext');

test('Formatierung: Link und fett, alles andere bleibt Text und wird maskiert', () => {
  const html = rich.toHtml('Das <b>Becken</b> ist **50 m** lang, siehe [Website](https://www.hotel.example/pool?a=1&b=2).');
  assert.equal(html, 'Das &lt;b&gt;Becken&lt;/b&gt; ist <strong>50 m</strong> lang, siehe <a href="https://www.hotel.example/pool?a=1&amp;b=2" rel="nofollow noopener" target="_blank">Website</a>.');
});

test('Formatierung: interne Links ohne neuen Tab, fremde mit nofollow', () => {
  assert.equal(rich.toHtml('[Mallorca](/region/mallorca)'), '<a href="/region/mallorca">Mallorca</a>');
  assert.equal(rich.toHtml('[Start](https://tri-hotel.de/hotels)', { siteHost: 'tri-hotel.de' }), '<a href="https://tri-hotel.de/hotels">Start</a>');
  assert.match(rich.toHtml('[Start](https://www.tri-hotel.de/hotels)', { siteHost: 'tri-hotel.de' }), /^<a href="[^"]+">Start<\/a>$/);
  assert.match(rich.toHtml('[x](https://anders.example/)', { siteHost: 'tri-hotel.de' }), /rel="nofollow noopener" target="_blank"/);
});

test('Formatierung: unsichere oder kaputte Ziele werden nicht zum Link', () => {
  for (const bad of ['javascript:alert(1)', 'http://unsicher.example/', '//fremd.example/x', 'data:text/html,x', 'kein-link']) {
    const html = rich.toHtml(`[Text](${bad})`);
    assert.ok(!html.includes('<a '), bad);
    assert.ok(html.includes('[Text]('), 'bleibt sichtbar als Text');
  }
  assert.deepEqual(rich.links('[a](javascript:x) und [b](https://ok.example/)').invalid, ['javascript:x']);
  assert.equal(rich.links('[a](javascript:x) und [b](https://ok.example/)').valid.length, 1);
});

test('Formatierung: reiner Text für Prüfungen – Linktext statt Adresse, keine Sternchen', () => {
  assert.equal(rich.plain('Siehe [Preisliste 2026](https://x.example/2027/liste) – **wichtig**.'), 'Siehe Preisliste 2026 – wichtig.');
  assert.equal(rich.plain('ohne Formatierung'), 'ohne Formatierung');
  assert.equal(rich.plain(null), '');
});
