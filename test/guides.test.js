const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ejs = require('ejs');
const express = require('express');
const guides = require('../src/services/guides');
const partners = require('../src/services/partners');
const brands = require('../src/lib/brands');
const seo = require('../src/lib/seo');
const richtext = require('../src/lib/richtext');
const describer = require('../src/services/describer');
const { faq } = require('../src/content/guides/trainingslager-ferienwohnung');

const VIEWS = path.join(__dirname, '..', 'src', 'views');
const TEMPLATE = 'https://www.jdoqocy.com/jt82gv30v2IKJKSJQSMJIKJSOJSLJ?sid={sid}&url={url_enc}';
const fewo = { code: 'fewo-direkt', name: 'FeWo-direkt', status: 'active', link_template: TEMPLATE, domains: ['fewo-direkt.de', 'www.fewo-direkt.de'],
  trademark_notice: 'VRBO ist eine Marke oder eingetragene Marke von Expedia, Inc.' };
const CJ_HOSTS = /ftjcfx\.com|lduhtrp\.net|awltovhc\.com/;

// ---------- Deeplinks (US4) ----------

test('Deeplink-Vorlage: Ziel codiert, {sid} = Seite und Slot; ohne sid bleibt der Objekt-Slug', () => {
  const target = 'https://www.fewo-direkt.de/search?destination=Palma%2C%20Mallorca&adults=4';
  assert.equal(partners.buildUrl(fewo, target, { sid: 'ratgeber-palma' }),
    'https://www.jdoqocy.com/jt82gv30v2IKJKSJQSMJIKJSOJSLJ?sid=ratgeber-palma&url=https%3A%2F%2Fwww.fewo-direkt.de%2Fsearch%3Fdestination%3DPalma%252C%2520Mallorca%26adults%3D4');
  assert.match(partners.buildUrl({ link_template: TEMPLATE }, target, { slug: 'hotel-x' }), /sid=hotel-x&/);
  // bestehende Vorlagen mit {slug} bleiben unverändert
  assert.match(partners.buildUrl({ link_template: 'https://n.example/c?u={url_enc}&s={slug}' }, target, { slug: 'h', sid: 'egal' }), /&s=h$/);
});

test('Link-Slot: fester Netzwerk-Link steht unverändert im href, Deeplink nur mit erlaubter Domain', () => {
  const fixed = { key: 'allgemein', active: true, fixed_href: 'https://www.dpbolvw.net/eh102hz74z6MONOWNUWQNMONTWUTRU', anchor: 'Ferienwohnungen suchen' };
  assert.equal(guides.slotHref(fixed, fewo), fixed.fixed_href);
  const deep = { key: 'palma', active: true, target_url: 'https://www.fewo-direkt.de/search?destination=Palma', anchor: 'Palma' };
  assert.match(guides.slotHref(deep, fewo), /^https:\/\/www\.jdoqocy\.com\/jt82gv30v2IKJKSJQSMJIKJSOJSLJ\?sid=ratgeber-palma&url=https%3A%2F%2Fwww\.fewo-direkt\.de/);
  assert.match(guides.slotHref(deep, fewo, 'box'), /sid=box-palma/);
  assert.equal(guides.slotHref({ ...deep, target_url: 'https://evil.example/x' }, fewo), null, 'fremde Domain');
  assert.equal(guides.slotHref({ ...deep, active: false }, fewo), null, 'Slot inaktiv');
  assert.equal(guides.slotHref(deep, { ...fewo, status: 'inactive' }), null, 'Programm inaktiv');
  assert.equal(guides.slotHref({ key: 'x', active: true, anchor: 'x' }, fewo), null, 'ohne Ziel kein Link');
  assert.equal(guides.slotHref({ ...fixed, fixed_href: 'https://www.anrdoezrs.net/click?url=%zl' }, fewo), null, 'CJ-Platzhalter %zl');
});

test('Link-Komponente: Beacon-Adresse ohne /go/-Weiterleitung, Markenhinweis des Programms', () => {
  const l = guides.linkView({ key: 'allgemein', active: true, fixed_href: 'https://www.dpbolvw.net/eh102hz74z6MONOWNUWQNMONTWUTRU', anchor: 'Suchen' }, fewo);
  assert.equal(l.count, '/go/ratgeber/fewo-direkt/allgemein/klick');
  assert.equal(l.trademark, fewo.trademark_notice);
  assert.equal(guides.linkView({ key: 'x', active: false }, fewo), null);
});

test('Link-Komponente rendert href direkt, rel sponsored nofollow noopener, target _blank und „(Werbung)“', async () => {
  const link = guides.linkView({ key: 'kanaren', active: true, fixed_href: 'https://www.anrdoezrs.net/mb116nmvsmu9BABJAHJDA9BDFHDJDB', anchor: 'Ferienwohnungen auf den Kanaren ansehen' }, fewo);
  const html = await ejs.renderFile(path.join(VIEWS, 'partials', 'partner-link.ejs'), { link });
  assert.match(html, /<a href="https:\/\/www\.anrdoezrs\.net\/mb116nmvsmu9BABJAHJDA9BDFHDJDB" target="_blank" rel="sponsored nofollow noopener" data-count="\/go\/ratgeber\/fewo-direkt\/kanaren\/klick"/);
  assert.match(html, /<\/a> <span class="ad-inline">\(Werbung\)<\/span>/);
  assert.doesNotMatch(html, /href="\/go\//);
  assert.doesNotMatch(html, /<img/);
});

test('Link-Slot prüfen: Domain, utm, entweder Ziel oder fester Link, aktiv nur mit Link', () => {
  assert.deepEqual(guides.validateSlot({ anchor: 'a', target_url: 'https://www.fewo-direkt.de/x', active: true }, fewo), []);
  assert.ok(guides.validateSlot({ anchor: 'a', target_url: 'https://www.fewo-direkt.de/x?utm_source=cj' }, fewo).some((e) => /utm/.test(e)));
  assert.ok(guides.validateSlot({ anchor: 'a', target_url: 'https://booking.com/x' }, fewo).some((e) => /nur https/.test(e)));
  assert.ok(guides.validateSlot({ anchor: 'a', target_url: 'https://www.fewo-direkt.de/x', fixed_href: 'https://www.dpbolvw.net/a' }, fewo).length);
  assert.ok(guides.validateSlot({ anchor: 'a', active: true }, fewo).some((e) => /Aktiv nur/.test(e)));
  assert.ok(guides.validateSlot({ anchor: '' }, fewo).some((e) => /Ankertext/.test(e)));
});

// ---------- Nur geprüfte Inhalte ----------

test('Karten mit [PRÜFEN] oder Platzhaltern gehen nie live und lassen sich nicht aktivieren', () => {
  const ok = { status: 'active', title: 'Lanzarote', body: '**Club La Santa:** drei 50-m-Becken ([Quelle](https://www.clublasanta.co.uk/activity/triathlon/))' };
  assert.equal(guides.cardPublic(ok), true);
  assert.equal(guides.cardPublic({ ...ok, body: `${ok.body}\n\n[PRÜFEN: Preis]` }), false);
  assert.equal(guides.cardPublic({ ...ok, body: '[LINK: FeWo-direkt – Suche Palma]' }), false);
  assert.equal(guides.cardPublic({ ...ok, status: 'hidden' }), false);
  assert.deepEqual(guides.validateCard(ok), []);
  assert.ok(guides.validateCard({ ...ok, body: 'Son Hugo [PRÜFEN: Status 2026]' }).some((e) => /PRÜFEN/.test(e)));
  assert.deepEqual(guides.validateCard({ ...ok, status: 'hidden', body: 'Son Hugo [PRÜFEN: Status 2026]' }), [], 'ausgeblendet speichern geht');
  assert.ok(guides.validateCard({ ...ok, body: '[Quelle](http://unsicher.example)' }).some((e) => /Ungültige Links/.test(e)));
});

test('Meta-Angaben des Ratgebers: keine Marken, keine Werbewörter, keine Platzhalter', () => {
  const ok = { title: 'Trainingslager selbst organisieren: Ferienwohnung-Guide 2027', description: 'Trainingslager in der Ferienwohnung planen: FeWo-Checkliste (Radraum, Waschmaschine).', h1: 'Trainingslager selbst organisieren' };
  assert.deepEqual(guides.validateMeta(ok), []);
  assert.ok(guides.validateMeta({ ...ok, title: 'Trainingslager mit FeWo-direkt' }).length);
  assert.ok(guides.validateMeta({ ...ok, description: 'Ferienhäuser von Vrbo' }).length);
  assert.ok(guides.validateMeta({ ...ok, h1: 'Expedia-Tipps' }).length);
  assert.ok(guides.validateMeta({ ...ok, title: 'Trainingslager-Gutschein' }).length);
  assert.ok(guides.validateMeta({ ...ok, h1: 'Camp [PRÜFEN]' }).length);
});

// ---------- Liste „Unterkünfte mit Ferienwohnung“ (US3) ----------

test('Liste: nur live und mit Merkmal, nach Score absteigend, höchstens 6 – Partnerstatus egal', () => {
  const fe = { vacation_rental: { value: true, evidence_url: 'https://x.example' } };
  const rows = [
    { name: 'B', status: 'live', score: 71, attributes: fe, partner: true, booking_links: 5 },
    { name: 'A', status: 'live', score: 88, attributes: fe },
    { name: 'Ohne Merkmal', status: 'live', score: 99, attributes: {} },
    { name: 'Merkmal false', status: 'live', score: 98, attributes: { vacation_rental: { value: false } } },
    { name: 'Entwurf', status: 'draft', score: 97, attributes: fe },
    { name: 'C', status: 'live', score: null, attributes: fe },
  ];
  assert.deepEqual(guides.pickRental(rows).map((r) => r.name), ['A', 'B', 'C']);
  const many = Array.from({ length: 9 }, (_, i) => ({ name: `H${i}`, status: 'live', score: 50 + i, attributes: fe }));
  assert.deepEqual(guides.pickRental(many).map((r) => r.name), ['H8', 'H7', 'H6', 'H5', 'H4', 'H3']);
  assert.deepEqual(guides.pickRental([]), []);
  // gleiche Scores: Name entscheidet, nicht ein Partnerfeld
  const tie = [{ name: 'Zeta', status: 'live', score: 80, attributes: fe, partner: true }, { name: 'Alpha', status: 'live', score: 80, attributes: fe }];
  assert.deepEqual(guides.pickRental(tie).map((r) => r.name), ['Alpha', 'Zeta']);
});

test('Liste rendert Name, Ort, Score mit Label, Kernfakten mit Herkunft – ohne Buchungslink; leer = kein Abschnitt', async () => {
  const ranking = { score_name: 'TriScore', entity_label_pl: 'Hotels', entity_type: 'hotel' };
  const rentals = [{ name: 'Villa Vista Mar', slug: 'villa-vista-mar-gran-canaria', city: 'Maspalomas', country: 'ES', score: 78, label: 'Sehr gut geeignet',
    facts: [{ label: 'Becken', text: '25 m im Hotel', origin: 'geprüft am 19.11.2026', evidence_url: 'https://villa.example/pool' }] }];
  const file = path.join(VIEWS, 'partials', 'rental-list.ejs');
  const html = await ejs.renderFile(file, { rentals, ranking, entityPath: (e) => `/hotel/${e.slug}`, countryName: seo.countryName });
  assert.match(html, /Villa Vista Mar/);
  assert.match(html, /Maspalomas, Spanien/);
  assert.match(html, /TriScore 78<\/strong> · Sehr gut geeignet/);
  assert.match(html, /Becken: 25 m im Hotel <small class="muted">\(geprüft am 19\.11\.2026 · <a href="https:\/\/villa\.example\/pool"/);
  assert.doesNotMatch(html, /sponsored|Werbung|\/go\//);
  assert.equal((await ejs.renderFile(file, { rentals: [], ranking, entityPath: () => '', countryName: seo.countryName })).trim(), '');
});

// ---------- Ratgeberseite (US2, US6) ----------

async function renderGuide({ links = {}, cards = [], rentals = [] } = {}) {
  const guide = { slug: 'trainingslager-ferienwohnung', view: 'trainingslager-ferienwohnung', h1: 'Trainingslager selbst organisieren: So klappt dein Camp in der Ferienwohnung',
    title: 'Trainingslager selbst organisieren: Ferienwohnung-Guide 2027',
    description: 'Trainingslager in der Ferienwohnung planen: FeWo-Checkliste (Radraum, Waschmaschine), 50-m-Becken je Region mit Quellen, Kosten & Packliste für Triathleten.' };
  const ranking = { score_name: 'TriScore', entity_label_pl: 'Hotels', entity_label_sg: 'Hotel', entity_type: 'hotel', is_default: true };
  const site = { name: 'tri-hotel.de', code: 'tri-hotel', primary_domain: 'tri-hotel.de' };
  const adKeys = Object.keys(links);
  for (const c of cards) c.blocks = describer.parseBody(c.body);
  return ejs.renderFile(path.join(VIEWS, 'public', 'guides', 'trainingslager-ferienwohnung.ejs'), {
    assetVersion: 't', ldJson: seo.ldJson, fitTitle: seo.fitTitle, fitDescription: seo.fitDescription, noindexAll: false, plausibleSrc: null,
    MONTHS: [], formatDate: (d) => String(d),
    site, siteUrl: 'https://tri-hotel.de', hostRanking: ranking, scorePath: '/triscore', listPath: '/hotels', path: '/ratgeber/trainingslager-ferienwohnung',
    campGuide: true, regionGuide: true, aboutPath: '/ueber-tri-hotel', aboutLabel: 'Über tri-hotel', siteMedia: { slots: {}, regions: {} },
    title: guide.title, description: guide.description, canonical: 'https://tri-hotel.de/ratgeber/trainingslager-ferienwohnung', ogType: 'article',
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'Article', headline: guide.h1, description: guide.description }, seo.faqLd(faq.map((f) => ({ q: f.q, a: richtext.plain(f.a) })))],
    guide, cards, links, rentals, faq, ranking,
    targets: { region: (s) => (['mallorca', 'lanzarote', 'gran-canaria'].includes(s) ? { href: `/region/${s}`, name: s, nameIn: `auf ${s}` } : null), entity: () => null },
    adPrograms: adKeys.length ? ['FeWo-direkt'] : [], trademarks: adKeys.length ? [fewo.trademark_notice] : [], hasAds: adKeys.length > 0,
    updatedLabel: 'November 2026', updatedIso: '2026-11-19', researchLabel: '10.11.2026', dayLabel: (d) => String(d), countryName: seo.countryName,
    rich: (t) => richtext.toHtml(t, { siteHost: 'tri-hotel.de' }), entityPath: (e) => `/hotel/${e.slug}`,
  }, { filename: path.join(VIEWS, 'public', 'guides', 'trainingslager-ferienwohnung.ejs') });
}

const allLinks = () => {
  const out = {};
  const slots = [
    { key: 'allgemein', fixed_href: 'https://www.dpbolvw.net/eh102hz74z6MONOWNUWQNMONTWUTRU', anchor: 'Ferienwohnungen auf FeWo-direkt suchen' },
    { key: 'gruppen', target_url: 'https://www.fewo-direkt.de/search?bedrooms=3', anchor: 'Gruppen-Ferienhäuser mit Waschmaschine auf FeWo-direkt ansehen' },
    { key: 'waschmaschine', target_url: 'https://www.fewo-direkt.de/search?amenities=washer', anchor: 'Unterkünfte mit Waschmaschine und Parkplatz finden' },
    { key: 'mallorca-preise', target_url: 'https://www.fewo-direkt.de/search?destination=Mallorca', anchor: 'Aktuelle Preise prüfen' },
    { key: 'vereinsgruppen', target_url: 'https://www.fewo-direkt.de/search?bedrooms=5', anchor: 'Fincas für Vereinsgruppen' },
  ];
  for (const s of slots) out[s.key] = guides.linkView({ ...s, active: true }, fewo);
  return out;
};

test('Ratgeberseite: keine Marken in Title/Meta/OG/Twitter/JSON-LD der Seite, kein [PRÜFEN], keine CJ-Pixel', async () => {
  const html = await renderGuide({ links: allLinks() });
  assert.deepEqual(brands.headViolations(html), []);
  assert.doesNotMatch(html, /PRÜFEN|\[LINK:|\[INTERN:|\[QUELLE:/);
  assert.doesNotMatch(html, CJ_HOSTS);
  assert.doesNotMatch(html, /<iframe/i);
  // Marke im Fließtext ist erlaubt
  assert.match(html, /Ferienwohnungen auf FeWo-direkt suchen<\/a> <span class="ad-inline">\(Werbung\)<\/span>/);
});

test('Ratgeberseite: jeder Partnerlink direkt mit rel sponsored, „(Werbung)“ und Beacon; Hinweis unter H1 und Markenhinweis unten', async () => {
  const html = await renderGuide({ links: allLinks() });
  const anchors = html.match(/<a [^>]*data-count="\/go\/ratgeber\/[^"]+"[^>]*>[^<]*<\/a>[^<]*<span class="ad-inline">\(Werbung\)<\/span>/g) || [];
  assert.equal(anchors.length, 5);
  for (const a of anchors) {
    assert.match(a, /href="https:\/\/www\.(dpbolvw\.net|jdoqocy\.com)\//);
    assert.match(a, /target="_blank" rel="sponsored nofollow noopener"/);
  }
  assert.ok(html.indexOf('Diese Seite enthält Affiliate-Links') < html.indexOf('data-count="/go/ratgeber/'), 'kurzer Hinweis vor dem ersten Link');
  assert.match(html, /<footer class="card ad-note ratgeber-foot" id="transparenz">/, 'ausführlicher Text unten, Sprungziel des Hinweises');
  // Quellenangaben samt Klammern klein, Partnerlinks nicht
  assert.match(html, /<span class="src">\(<a href="https:\/\/www\.wahoofitness\.com\/blog\/\?p=6324" target="_blank" rel="nofollow noopener">Wahoo<\/a>\)<\/span>/);
  assert.doesNotMatch(html, /<span class="src">(?:(?!<\/span>)[^])*data-count/);
  assert.match(html, /VRBO ist eine Marke oder eingetragene Marke von Expedia, Inc\./);
});

test('Ratgeberseite ohne Partnerlinks: kein Satz mit totem Link, kein Werbehinweis, Seite bleibt vollständig', async () => {
  const html = await renderGuide({ links: {} });
  assert.doesNotMatch(html, /data-count="\/go\/ratgeber|\(Werbung\)|Affiliate-Links|Ob Räder erlaubt sind/);
  for (const id of ['kurz', 'vergleich', 'planen', 'fewo-check', 'schwimmen', 'ernaehrung', 'logistik', 'kosten', 'beispielwoche', 'packliste', 'gruppe', 'fehler', 'faq', 'weiterlesen']) {
    assert.match(html, new RegExp(`<section id="${id}"`), id);
  }
  assert.doesNotMatch(html, /<section class="rental-list"/, 'ohne Treffer keine Liste');
});

test('Ratgeberseite: Bad-Karte mit Quelle und Stand, Partnerlink nur an der Karte, interne Regionsseite', async () => {
  const card = { id: 'c1', section: 'baeder', title: 'Lanzarote', status: 'active', checked_on: '10.11.2026', region_slug: 'lanzarote', entity_slugs: [],
    body: '**Club La Santa:** drei 50-m-Becken ([Club La Santa](https://www.clublasanta.co.uk/activity/triathlon/)).', link: null };
  const html = await renderGuide({ cards: [card] });
  assert.match(html, /<h4 id="card-c1">Lanzarote<\/h4>/);
  assert.match(html, /<strong>Club La Santa:<\/strong> drei 50-m-Becken \(<a href="https:\/\/www\.clublasanta\.co\.uk\/activity\/triathlon\/" rel="nofollow noopener" target="_blank">/);
  assert.match(html, /Stand: 10\.11\.2026/);
  assert.match(html, /<a href="\/region\/lanzarote">Hotels auf lanzarote<\/a>/);
});

test('FAQ: Schema-Texte entsprechen den sichtbaren Antworten, ohne Partnerlinks und ohne [PRÜFEN]', () => {
  assert.ok(faq.length >= 8);
  for (const f of faq) {
    assert.doesNotMatch(f.a, /PRÜFEN|fewo-direkt|dpbolvw|jdoqocy|anrdoezrs|tkqlhce/i);
    assert.equal(richtext.plain(f.a), richtext.tokens(f.a).map((t) => t.text).join(''));
  }
  const ld = seo.faqLd(faq.map((f) => ({ q: f.q, a: richtext.plain(f.a) })));
  assert.equal(ld.mainEntity.length, faq.length);
});

// ---------- Klickzählung per Beacon (US4) ----------

test('Beacon: POST /go/ratgeber/:programm/:slot/klick zählt nur bekannte Slots, keine GET-Weiterleitung', async () => {
  const counted = [];
  const orig = { slotForClick: guides.slotForClick, countClick: guides.countClick };
  guides.slotForClick = async (siteId, program, key) => (siteId === 's1' && program === 'fewo-direkt' && key === 'allgemein' ? { id: 'slot-1' } : null);
  guides.countClick = async (id, source) => { counted.push([id, source]); };
  const app = express();
  app.use((req, res, next) => { req.site = { id: 's1', primary_domain: 'tri-hotel.de' }; next(); });
  app.use('/', require('../src/routes/guides'));
  app.use((req, res) => res.status(404).end());
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ua = { 'user-agent': 'Mozilla/5.0 (Macintosh) Safari/605.1', referer: 'https://tri-hotel.de/ratgeber/trainingslager-ferienwohnung' };
  try {
    assert.equal((await fetch(`${base}/go/ratgeber/fewo-direkt/allgemein/klick`, { method: 'POST', headers: ua })).status, 204);
    assert.equal((await fetch(`${base}/go/ratgeber/fewo-direkt/unbekannt/klick`, { method: 'POST', headers: ua })).status, 204);
    assert.equal((await fetch(`${base}/go/ratgeber/fewo-direkt/allgemein/klick`, { method: 'POST', headers: { 'user-agent': 'Googlebot/2.1' } })).status, 204);
    assert.equal((await fetch(`${base}/go/ratgeber/fewo-direkt/allgemein`, { redirect: 'manual' })).status, 404, 'keine Weiterleitung');
    assert.deepEqual(counted, [['slot-1', 'tri-hotel.de']]);
  } finally {
    server.close();
    Object.assign(guides, orig);
  }
});

// Hinweis Ferienwohnung als Zeile der Rangliste (gleiche Vorlage und Höhe wie ein Hotel)
test('Hinweis Ferienwohnung: Zeile mit Anzeige, Direktlink ohne /go/, Bild nur als Dekoration, kurze Texte mit Rückfall', async () => {
  const ejs = require('ejs');
  const path = require('path');
  const file = path.join(__dirname, '../src/views/partials/rental-box.ejs');
  const rentalBox = {
    heading: 'Oder doch lieber in eine Ferienwohnung?', headingShort: 'Lieber eine Ferienwohnung?', shortText: 'Kurz', guidePath: '/ratgeber/x', guideLabel: 'Ratgeber lesen',
    buttonLabel: 'FeWo-direkt suchen', buttonLabelShort: 'Suchen',
    link: { href: 'https://www.anrdoezrs.net/click-1-2?url=x&sid=liste', count: '/go/ratgeber/fewo-direkt/allgemein/klick', program: 'FeWo-direkt' },
  };
  const img = { id: 'abc', variants: [320, 640], width: 640, height: 420, credit: 'Foto: Beispiel', focal: '50% 50%' };
  const html = await ejs.renderFile(file, { rentalBox, siteMedia: { slots: { rental_box: img } } });
  assert.match(html, /class="rank-item rank-row rental-row"/);
  assert.match(html, />Anzeige</);
  assert.match(html, /href="https:\/\/www\.anrdoezrs\.net\/click-1-2\?url=x&amp;sid=liste"/);
  assert.doesNotMatch(html, /href="\/go\//);
  assert.match(html, /rel="sponsored nofollow noopener"/);
  assert.match(html, /<a class="rank-link" href="\/ratgeber\/x">/);
  assert.match(html, /Foto: Beispiel/, 'Urhebervermerk sichtbar');
  assert.doesNotMatch(html.slice(html.indexOf('<img'), html.indexOf('>', html.indexOf('<img'))), /href/, 'Bild ist kein Link');
  const noImg = await ejs.renderFile(file, { rentalBox, siteMedia: { slots: {} } });
  assert.match(noImg, /rental-house/);
  assert.equal((await ejs.renderFile(file, {})).trim(), '', 'ohne Kasten nichts');
});
