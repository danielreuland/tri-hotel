const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ejs = require('ejs');
const brands = require('../src/lib/brands');
const seo = require('../src/lib/seo');

test('Marken und Werbewörter in Meta-Texten erkennen', () => {
  for (const t of ['FeWo-direkt Trainingslager', 'fewo direkt', 'FeWodirekt', 'Ferienhäuser bei Vrbo', 'VRBO', 'Expedia Hotels', 'Trainingslager-Gutschein', 'Top-Deal', 'Rabatt']) {
    assert.ok(brands.metaProblems(t).length, t);
  }
  for (const t of ['Trainingslager in der Ferienwohnung', 'FeWo-Checkliste', 'Ideal für Gruppen', 'Hotels auf Mallorca']) {
    assert.deepEqual(brands.metaProblems(t), [], t);
  }
});

test('Kopf einer Seite prüfen: title, description, og:*, twitter:*, JSON-LD der Seite – Fließtext zählt nicht', () => {
  const html = `<html><head><title>Ferienwohnung-Guide</title>
    <meta name="description" content="Planen mit Checkliste">
    <meta property="og:title" content="Guide mit FeWo-direkt">
    <meta name="twitter:image" content="https://x.example/og.png">
    <script type="application/ld+json">{"@type":"Article","headline":"Guide","description":"Tipps von Expedia"}</script>
    <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"name":"Vrbo?"}]}</script>
    </head><body><a>Ferienwohnungen auf FeWo-direkt suchen</a> VRBO ist eine Marke</body></html>`;
  const v = brands.headViolations(html);
  assert.deepEqual(v.map((x) => x.where), ['og:title', 'ld:Article.description']);
});

// Seitenköpfe der Listen- und Regionsseiten mit typischen Werten (Title/Description bauen die Routen aus Ranking und Region)
test('Kopf der Listen- und Regionsseiten ohne Partnermarken', async () => {
  const head = path.join(__dirname, '..', 'src', 'views', 'partials', 'head.ejs');
  const locals = { assetVersion: 't', ldJson: seo.ldJson, fitTitle: seo.fitTitle, fitDescription: seo.fitDescription, site: { name: 'TRI-HOTEL', primary_domain: 'tri-hotel.de' }, siteUrl: 'https://tri-hotel.de', path: '/' };
  for (const [title, description] of [
    ['Hotels im Ranking nach TriScore', '12 geprüfte Hotels, sortiert nach TriScore.'],
    ['Hotels auf Mallorca – Ranking nach TriScore', '5 geprüfte Hotels auf Mallorca, sortiert nach TriScore.'],
  ]) {
    const html = await ejs.renderFile(head, { ...locals, title, description, jsonLd: [seo.breadcrumbLd([{ name: title, url: 'https://tri-hotel.de/' }])] });
    assert.deepEqual(brands.headViolations(html), [], title);
  }
});
