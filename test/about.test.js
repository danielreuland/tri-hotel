const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const ejs = require('ejs');
const about = require('../src/services/about');
const seo = require('../src/lib/seo');

const VIEWS = path.join(__dirname, '..', 'src', 'views');
const site = { code: 'tri-hotel', name: 'TRI-HOTEL', primary_domain: 'tri-hotel.de', legal: {} };
const ranking = (reviewsOn, athleteOn = false) => ({
  id: 1, is_default: true, slug: 'triathlon-hotel', score_name: 'TriScore', entity_type: 'hotel', entity_label_sg: 'Hotel', entity_label_pl: 'Hotels',
  review_config: { enabled: reviewsOn }, formula: { athlete_enabled: athleteOn }, labels: [{ min: 85, label: 'Top' }, { min: 0, label: 'Eingeschränkt' }],
});
const appLocals = {
  assetVersion: 't', ldJson: seo.ldJson, fitTitle: seo.fitTitle, fitDescription: seo.fitDescription, noindexAll: false, plausibleSrc: null,
};

// Kleine App wie in server.js: Kontext (Site, Host-Ranking, Pfade) gestubbt, echte Route und Vorlagen
async function withApp({ reviewsOn = true, athleteOn = false, siteOverride = site } = {}, fn) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', VIEWS);
  Object.assign(app.locals, appLocals);
  app.use((req, res, next) => {
    const r = ranking(reviewsOn, athleteOn);
    const page = about.pageFor(siteOverride);
    req.site = siteOverride;
    req.hostRanking = r;
    Object.assign(res.locals, {
      site: siteOverride, siteUrl: 'https://tri-hotel.de', hostRanking: r, scorePath: '/triscore', listPath: '/hotels', path: req.path,
      aboutPath: page ? page.path : null, aboutLabel: page ? `Über ${siteOverride.code}` : null,
    });
    next();
  });
  app.use('/', require('../src/routes/about'));
  app.use((req, res) => res.status(404).send('nicht gefunden'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const get = async (p) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${p}`);
    return { status: res.status, html: await res.text() };
  };
  try { await fn(get); } finally { server.close(); }
}

test('Über-Seite: rendert mit 200, Titel, Beschreibung, Canonical, indexierbar', async () => {
  await withApp({}, async (get) => {
    const { status, html } = await get('/ueber-tri-hotel');
    assert.equal(status, 200);
    assert.match(html, /<h1>Über tri-hotel\.de<\/h1>/);
    assert.match(html, /<title>Über tri-hotel\.de – neutrales Ranking für Trainingshotels/);
    assert.match(html, /<meta name="description" content="Wie tri-hotel\.de Hotels fürs Triathlon-Trainingslager vergleicht: TriScore aus geprüften Fakten, Herkunft jedes Werts, Platzierungen nicht käuflich\.">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/tri-hotel\.de\/ueber-tri-hotel">/);
    assert.doesNotMatch(html, /name="robots"/);
    // Links im Text
    assert.match(html, /href="\/triscore">So funktioniert der TriScore<\/a>/);
    assert.match(html, /href="\/hotel-hinzufuegen">Hotel hinzufügen<\/a>/);
    assert.match(html, /href="https:\/\/danielreuland\.com"/);
  });
});

test('Über-Seite: Kontakt als sichtbarer Text, mailto und Link zum Formular', async () => {
  await withApp({}, async (get) => {
    const { html } = await get('/ueber-tri-hotel');
    assert.match(html, /<a href="mailto:daniel@tri-hotel\.de">daniel@tri-hotel\.de<\/a>/);
    assert.match(html, /<a href="\/kontakt">Kontaktformular<\/a>/);
  });
});

test('Über-Seite: strukturierte Daten AboutPage mit Organization und Gründer', async () => {
  await withApp({}, async (get) => {
    const { html } = await get('/ueber-tri-hotel');
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const ld = blocks.find((b) => b['@type'] === 'AboutPage');
    assert.ok(ld);
    assert.equal(ld.url, 'https://tri-hotel.de/ueber-tri-hotel');
    assert.equal(ld.mainEntity['@type'], 'Organization');
    assert.equal(ld.mainEntity.name, 'tri-hotel.de');
    assert.deepEqual(ld.mainEntity.founder, {
      '@type': 'Person', name: 'Daniel Reuland', url: 'https://danielreuland.com', jobTitle: 'Gründer und Betreiber',
      image: 'https://tri-hotel.de/static/sites/tri-hotel/ueber-portrait.jpg',
    });
    assert.equal(ld.dateModified, '2026-11-09');
    assert.match(html, /Stand: <time datetime="2026-11-09">09\.11\.2026<\/time>/);
    assert.ok(ld.name.length <= 60, 'Titel passt in die Trefferzeile');
  });
});

test('Über-Seite: Gründer-Daten nur mit dem, was vorhanden ist; Stand nur mit gültigem Datum', () => {
  const about = require('../src/services/about');
  assert.deepEqual(about.founderLd({ name: 'A', url: 'https://a.de' }, 'https://x.de', null), { '@type': 'Person', name: 'A', url: 'https://a.de' });
  assert.deepEqual(
    about.founderLd({ name: 'A', url: 'https://a.de', same_as: ['https://www.linkedin.com/in/a', 'javascript:x', 'http://b.de'] }, 'https://x.de', { src: '/static/p.jpg' }),
    { '@type': 'Person', name: 'A', url: 'https://a.de', image: 'https://x.de/static/p.jpg', sameAs: ['https://www.linkedin.com/in/a'] }
  );
  assert.deepEqual(about.updated({ updated: '2026-11-09' }), { iso: '2026-11-09', label: '09.11.2026' });
  assert.equal(about.updated({ updated: '9.11.2026' }), null);
  assert.equal(about.updated({}), null);
});

test('Über-Seite: Bewertungen möglich, zählen aber noch nicht – „Zusätzlich zum TriScore“, Punkt „Du warst im Trainingslager?“', async () => {
  await withApp({ reviewsOn: true, athleteOn: false }, async (get) => {
    const { html } = await get('/ueber-tri-hotel');
    assert.match(html, /Er beruht auf geprüften <strong>Fakten<\/strong> zu Schwimmen, Rad, Laufen, Verpflegung, Regeneration und Logistik\./);
    assert.match(html, /Zusätzlich zum TriScore helfen dir die <strong>Bewertungen<\/strong> anderer Triathletinnen und Triathleten/);
    assert.doesNotMatch(html, /Er setzt sich zusammen aus/);
    assert.match(html, /Du warst im Trainingslager\?<\/strong> Deine Bewertung hilft anderen bei der Wahl\. <a href="\/hotels">/);
  });
});

test('Über-Seite: Bewertungen fließen in den Score ein – „Fakten und Bewertungen“', async () => {
  await withApp({ reviewsOn: true, athleteOn: true }, async (get) => {
    const { html } = await get('/ueber-tri-hotel');
    assert.match(html, /Er setzt sich zusammen aus/);
    assert.match(html, /<li><strong>Bewertungen<\/strong> von Athletinnen und Athleten, die selbst dort trainiert haben\.<\/li>/);
    assert.doesNotMatch(html, /Zusätzlich zum TriScore/);
    assert.match(html, /Du warst im Trainingslager/);
  });
});

test('Über-Seite: ohne Bewertungsfunktion – nur Fakten, kein Wort zu Bewertungen, auch wenn die Formel sie einrechnen würde', async () => {
  for (const athleteOn of [false, true]) {
    await withApp({ reviewsOn: false, athleteOn }, async (get) => {
      const { html } = await get('/ueber-tri-hotel');
      assert.match(html, /Er beruht auf geprüften <strong>Fakten<\/strong>/);
      assert.doesNotMatch(html, /<strong>Bewertungen<\/strong>/);
      assert.doesNotMatch(html, /Du warst im Trainingslager/);
    });
  }
});

test('Über-Seite: Klima steht nicht bei den Fakten des Scores, sondern als beste Reisezeit; kein Becken-K.O.', async () => {
  for (const athleteOn of [false, true]) {
    await withApp({ athleteOn }, async (get) => {
      const { html } = await get('/ueber-tri-hotel');
      assert.doesNotMatch(html, /Logistik und Klima/);
      assert.match(html, /Das Klima zeigen wir je Monat als beste Reisezeit\. In den TriScore fließt es nicht ein/);
      assert.doesNotMatch(html, /gibt es keinen TriScore/);
    });
  }
});

test('Über-Seite: nur für die eigene Site und nur mit Vorlage', async () => {
  await withApp({}, async (get) => {
    assert.equal((await get('/ueber-andere-site')).status, 404);
  });
  await withApp({ siteOverride: { ...site, code: 'ohne-vorlage' } }, async (get) => {
    assert.equal((await get('/ueber-ohne-vorlage')).status, 404);
  });
  assert.equal(about.pageFor({ code: '../x' }), null);
  assert.equal(about.pageFor(null), null);
});

test('Über-Seite: Bilder als eigene Kopie mit Alt-Text; ohne Datei kein Bild, ohne Vermerk nur mit ausdrücklichem Verzicht', async () => {
  await withApp({}, async (get) => {
    const { html } = await get('/ueber-tri-hotel');
    // tri-hotel: beide Bilder liegen im Repo und sind ausdrücklich ohne Vermerk freigegeben (no_credit)
    assert.match(html, /<img src="\/static\/sites\/tri-hotel\/ueber-portrait\.jpg\?v=t" width="240" height="240" alt="Daniel Reuland, Betreiber von tri-hotel\.de"/);
    assert.match(html, /<img src="\/static\/sites\/tri-hotel\/ueber-action\.jpg\?v=t"/);
    assert.doesNotMatch(html, /<figcaption/);
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'about-'));
  try {
    assert.equal(about.photo(site, dir), null);
    fs.mkdirSync(path.join(dir, 'sites', 'tri-hotel'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sites', 'tri-hotel', 'ueber-portrait.jpg'), '');
    const ph = about.photo(site, dir);
    assert.deepEqual(ph, { src: '/static/sites/tri-hotel/ueber-portrait.jpg' });
    const html = await ejs.renderFile(path.join(VIEWS, 'sites', 'tri-hotel', 'ueber.ejs'), {
      ...appLocals, title: 'x', site, hostRanking: ranking(true), ranking: ranking(true), scorePath: '/triscore', listHref: '/hotels',
      reviewsLive: true, scoreUsesReviews: false, email: 'daniel@tri-hotel.de', photo: about.credited({ alt: 'Daniel Reuland, Betreiber von tri-hotel.de', credit: '© Beispiel' }, ph),
      action: about.credited({ alt: 'Auf dem Rad', credit: 'Foto: Beispiel' }, { src: '/static/sites/tri-hotel/ueber-action.jpg' }),
    });
    assert.match(html, /<img src="\/static\/sites\/tri-hotel\/ueber-action\.jpg\?v=t" width="1086" height="724" alt="Auf dem Rad"/);
    assert.match(html, /<small>Foto: Beispiel<\/small>/);
    // ohne Urhebervermerk kein Bild, auch wenn die Datei da ist – außer mit ausdrücklichem Verzicht
    assert.deepEqual(about.credited({ alt: 'x', credit: '', no_credit: true }, ph), { ...ph, alt: 'x', credit: null });
    assert.equal(about.credited({ alt: 'x', no_credit: 'ja' }, ph), null);
    assert.equal(about.credited({ alt: 'x', credit: '' }, ph), null);
    assert.equal(about.credited({ alt: 'x', credit: '©' }, null), null);
    assert.match(html, /<img src="\/static\/sites\/tri-hotel\/ueber-portrait\.jpg\?v=t" width="240" height="240" alt="Daniel Reuland, Betreiber von tri-hotel\.de"/);
    assert.match(html, /<figcaption class="muted"><small>© Beispiel<\/small><\/figcaption>/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Fußzeile: „Über tri-hotel“ neben „Methodik“, nur wenn die Site die Seite hat', async () => {
  await withApp({}, async (get) => {
    const { html } = await get('/ueber-tri-hotel');
    assert.match(html, /<a href="\/triscore">Methodik<\/a>\s*<a href="\/ueber-tri-hotel">Über tri-hotel<\/a>/);
  });
  const foot = (extra) => ejs.renderFile(path.join(VIEWS, 'partials', 'foot.ejs'), { ...appLocals, hostRanking: ranking(true), scorePath: '/triscore', ...extra });
  assert.doesNotMatch(await foot({}), /ueber-/);
});

test('Methodik (/triscore): Hinweis am Ende „Wer hinter tri-hotel.de steht: Über tri-hotel“', async () => {
  const method = (extra) => ejs.renderFile(path.join(VIEWS, 'public', 'method.ejs'), {
    ...appLocals, title: 'So funktioniert der TriScore', site, hostRanking: ranking(true), ranking: ranking(true), scorePath: '/triscore', listPath: '/hotels',
    siteMedia: { slots: {}, regions: {} }, heading: 'So funktioniert der TriScore', intro: [], faq: [], example: null, bestTimeRule: null,
    formula: { fact_weight: 0.6, athlete_weight: 0.4, bayes_c: 5, bayes_m: 70, min_completeness: 70, recheck_months: 18, min_reviews: 3 },
    categories: [], totalPoints: 106, explainScoring: () => '', listHref: '/hotels', entityPath: () => '/', ...extra,
  });
  const html = await method({ aboutPath: '/ueber-tri-hotel', aboutLabel: 'Über tri-hotel' });
  assert.match(html, /Wer hinter tri-hotel\.de steht: <a href="\/ueber-tri-hotel">Über tri-hotel<\/a>/);
  assert.doesNotMatch(await method({}), /Wer hinter/);
});
