// Ratgeber (redaktionelle Seiten je Site, /ratgeber/:slug), Karten, Partner-Link-Slots und der Hinweiskasten
// „Oder doch lieber in eine Ferienwohnung?“ (docs/fewo-ratgeber-umsetzung.md, US2–US5).
//
// Grundsätze:
// - Neutralität: Partnerlinks und Merkmal „Ferienwohnung“ ändern weder Score noch Reihenfolge. Die Liste ist nach Score sortiert.
// - Partnerlinks stehen unverändert im href (fester Netzwerk-Link oder Deeplink aus link_template), nie über /go/.
//   Gezählt wird per Beacon (POST /go/ratgeber/:programm/:slot/klick) in outbound_clicks mit kind 'guide_link'.
// - Nur geprüfte Inhalte: Karten mit „[PRÜFEN“ oder Platzhaltern („[LINK:“, „[INTERN:“) gehen nie live.
const db = require('../db');
const partners = require('./partners');
const rental = require('./rental');
const scoring = require('./scoring');
const rankings = require('./rankings');
const brands = require('../lib/brands');
const richtext = require('../lib/richtext');
const { trustText } = require('../lib/provenance');

const CLICK_KIND = 'guide_link';
const LIST_MAX = 6;
// Offene Prüfpunkte und Platzhalter aus der Vorlage
const UNVERIFIED = /\[\s*(PRÜFEN|PRUEFEN|LINK\s*:|INTERN\s*:|QUELLE\s*:|DOWNLOAD\s*:)/i;

const unverified = (text) => UNVERIFIED.test(String(text || ''));

// ---------- Ratgeber ----------

async function bySlug(siteId, slug, { includeDraft = false } = {}) {
  if (!siteId || !/^[a-z0-9-]+$/.test(String(slug || ''))) return null;
  return db.one(`SELECT * FROM guides WHERE site_id = $1 AND slug = $2 ${includeDraft ? '' : "AND status = 'active'"}`, [siteId, slug]);
}

async function activeForSite(siteId) {
  return siteId ? db.many(`SELECT * FROM guides WHERE site_id = $1 AND status = 'active' ORDER BY slug`, [siteId]) : [];
}

// Prüfung der Meta-Angaben beim Speichern im Admin: Pflicht, Länge, keine Marken/Werbewörter, keine Platzhalter
function validateMeta({ title, description, h1 }) {
  const errors = [];
  for (const [label, v, max] of [['Title', title, 70], ['Meta-Description', description, 170], ['H1', h1, 120]]) {
    const t = String(v || '').trim();
    if (!t) errors.push(`${label} fehlt.`);
    else if (t.length > max) errors.push(`${label}: höchstens ${max} Zeichen.`);
    const p = brands.metaProblems(t);
    if (p.length) errors.push(`${label}: ${p.join(', ')} ist in Meta-Angaben nicht erlaubt (Programmbedingungen).`);
    if (unverified(t)) errors.push(`${label}: Platzhalter oder [PRÜFEN] entfernen.`);
  }
  return errors;
}

// ---------- Karten ----------

// Darf die Karte öffentlich erscheinen? Aktiv und ohne offene Prüfpunkte/Platzhalter
const cardPublic = (c) => c.status === 'active' && !unverified(c.title) && !unverified(c.body);

function validateCard(c) {
  const errors = [];
  if (!String(c.title || '').trim()) errors.push('Titel fehlt.');
  if (!String(c.body || '').trim()) errors.push('Text fehlt.');
  if (c.status === 'active' && (unverified(c.title) || unverified(c.body))) {
    errors.push('Karte enthält noch „[PRÜFEN …]“ oder einen Platzhalter – erst prüfen und Marker entfernen, dann aktivieren.');
  }
  const { invalid } = richtext.links(c.body);
  if (invalid.length) errors.push(`Ungültige Links: ${invalid.join(', ')} (nur https oder interne Pfade).`);
  return errors;
}

async function cards(guideId, { publicOnly = true } = {}) {
  const rows = await db.many(`SELECT * FROM guide_cards WHERE guide_id = $1 ORDER BY section, sort_order, title`, [guideId]);
  return publicOnly ? rows.filter(cardPublic) : rows;
}

// ---------- Link-Slots ----------

// sid: Seite und Slot als Unterkennung im Netzwerk (z. B. ratgeber-palma, box-kanaren)
const sidFor = (where, key) => `${where}-${key}`.replace(/[^a-z0-9-]/g, '').slice(0, 60);

// Adresse eines Slots oder null (Slot inaktiv, Programm nicht aktiv, Ziel fehlt oder nicht erlaubt)
function slotHref(slot, program, where = 'ratgeber') {
  if (!slot || !slot.active || !program || program.status !== 'active') return null;
  if (slot.fixed_href) return validFixedHref(slot.fixed_href) ? slot.fixed_href : null;
  const target = slot.target_url && partners.allowedUrl(program, slot.target_url);
  if (!target || !program.link_template) return null;
  return partners.buildUrl(program, target, { sid: sidFor(where, slot.key) });
}

// Fester Netzwerk-Link: nur https, unverändert übernommen (keine Platzhalter wie %zl aus dem CJ-Code)
const validFixedHref = (h) => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/\S*$/i.test(String(h || '')) && !/[%][a-z]{2}\b|\{|\}/i.test(String(h).replace(/%[0-9a-f]{2}/gi, ''));

// Fertiger Link für die Vorlage (Komponente partials/partner-link.ejs) oder null
function linkView(slot, program, where = 'ratgeber') {
  const href = slotHref(slot, program, where);
  if (!href) return null;
  return {
    key: slot.key, href, anchor: slot.anchor, program: program.name,
    count: `/go/ratgeber/${program.code}/${slot.key}/klick`,
    trademark: program.trademark_notice || null,
  };
}

// Alle Slots einer Site mit Programm: Map key → link (nur nutzbare Links)
async function links(siteId, where = 'ratgeber') {
  const rows = await db.many(
    `SELECT s.*, p.code AS p_code, p.name AS p_name, p.status AS p_status, p.link_template AS p_link_template,
            p.domains AS p_domains, p.trademark_notice AS p_trademark_notice
       FROM partner_slots s LEFT JOIN partner_programs p ON p.id = s.program_id WHERE s.site_id = $1`, [siteId]);
  const out = {};
  for (const r of rows) {
    const program = r.p_code ? { code: r.p_code, name: r.p_name, status: r.p_status, link_template: r.p_link_template, domains: r.p_domains, trademark_notice: r.p_trademark_notice } : null;
    const l = linkView(r, program, where);
    if (l) out[r.key] = l;
  }
  return out;
}

function validateSlot(s, program) {
  const errors = [];
  if (!String(s.anchor || '').trim()) errors.push('Ankertext fehlt.');
  if (s.fixed_href && s.target_url) errors.push('Entweder Zieladresse oder fester Netzwerk-Link, nicht beides.');
  if (s.fixed_href && !validFixedHref(s.fixed_href)) errors.push('Fester Link: vollständige https-Adresse aus dem Netzwerk, ohne Platzhalter.');
  if (s.target_url) {
    if (!program) errors.push('Für eine Zieladresse ein Partnerprogramm wählen.');
    else if (!partners.allowedUrl(program, s.target_url)) errors.push(`Zieladresse: nur https und nur ${(program.domains || []).join(', ') || 'erlaubte Domains'}.`);
    else if (!program.link_template) errors.push('Das Programm hat keine Deeplink-Vorlage – festen Link eintragen.');
    else if (/[?&]utm_/i.test(s.target_url)) errors.push('Zieladresse ohne utm_…-Parameter eintragen.');
  }
  if (s.active && !s.fixed_href && !s.target_url) errors.push('Aktiv nur mit Zieladresse oder festem Link.');
  return errors;
}

// Klick zählen (Beacon): Slot muss zur Site gehören, aktiv sein und zum Programm passen
async function slotForClick(siteId, programCode, key) {
  if (!/^[a-z0-9-]+$/.test(String(key || '')) || !/^[a-z0-9_-]+$/.test(String(programCode || ''))) return null;
  return db.one(
    `SELECT s.id FROM partner_slots s JOIN partner_programs p ON p.id = s.program_id
      WHERE s.site_id = $1 AND s.key = $2 AND p.code = $3 AND s.active AND p.status = 'active'`, [siteId, key, programCode]);
}

async function countClick(slotId, source = '') {
  await db.query(
    `INSERT INTO outbound_clicks (kind, target_id, day, source, placement, clicks) VALUES ($1, $2, (now() AT TIME ZONE 'Europe/Berlin')::date, $3, 'ratgeber', 1)
     ON CONFLICT (kind, target_id, day, source, placement, position, variant, list) DO UPDATE SET clicks = outbound_clicks.clicks + 1`, [CLICK_KIND, slotId, String(source || '').slice(0, 60)]);
}

// ---------- Liste „Unterkünfte mit Ferienwohnung“ (US3) ----------

// Auswahl aus fertigen Zeilen (rein, testbar): nur live, nur mit Merkmal, nach Score absteigend, höchstens max.
// Partnerstatus, Buchungslinks oder Klicks spielen keine Rolle.
function pickRental(rows, max = LIST_MAX) {
  return rows
    .filter((r) => r.status === 'live' && rental.has(r))
    .sort((a, b) => (b.score === null || b.score === undefined ? -1 : b.score) - (a.score === null || a.score === undefined ? -1 : a.score)
      || String(a.name).localeCompare(String(b.name), 'de'))
    .slice(0, max);
}

// Live-Objekte des Rankings mit Merkmal, optional nur in einer Region (Mittelpunkt + Radius), mit Kernfakten
// (Kriterien-Codes aus der Konfiguration des Ratgebers) und Herkunft je Wert
async function rentalList(ranking, { criteria = [], max = LIST_MAX, region = null } = {}) {
  const rows = await db.many(
    `SELECT e.id, e.name, e.slug, e.city, e.country, e.lat, e.lng, e.attributes, er.status, er.score, er.completeness
       FROM entity_rankings er JOIN entities e ON e.id = er.entity_id
      WHERE er.ranking_id = $1 AND er.status = 'live' AND ${rental.sqlHas('e')}`, [ranking.id]);
  const inRegion = region ? require('../lib/seo').inRegion : null;
  const picked = pickRental(region ? rows.filter((r) => inRegion(r, region)) : rows, max);
  if (!picked.length) return [];
  const crit = (await rankings.getCriteria(ranking.id)).filter((c) => criteria.includes(c.code))
    .sort((a, b) => criteria.indexOf(a.code) - criteria.indexOf(b.code)).slice(0, 3);
  const facts = crit.length ? await db.many(
    `SELECT entity_id, criterion_id, value, trust_level, checked_at, evidence_url, evidence_text, editorial_assessment
       FROM entity_facts WHERE entity_id = ANY($1::uuid[]) AND criterion_id = ANY($2::uuid[]) AND NOT disputed`,
    [picked.map((e) => e.id), crit.map((c) => c.id)]) : [];
  return picked.map((e) => ({
    ...e,
    label: scoring.labelFor(e.score, ranking.labels),
    facts: crit.map((c) => {
      const f = facts.find((x) => x.entity_id === e.id && x.criterion_id === c.id);
      if (!f || f.value === null) return null;
      const text = scoring.describeValue(c, f.value);
      return text ? { label: c.label, text, origin: trustText(f, ranking), evidence_url: f.evidence_url || null } : null;
    }).filter(Boolean),
  }));
}

// ---------- Hinweiskasten (US5) ----------

// Kasten für eine Liste oder Regionsseite: { heading, text, after, link, guidePath } oder null.
// Erscheint nur, wenn der Ratgeber aktiv ist und ein Link vorhanden ist; verdrängt kein Objekt (fester Platz nach `after`).
async function box(site, { regionSlug = null } = {}) {
  if (!site) return null;
  const guide = (await activeForSite(site.id)).find((g) => g.settings && g.settings.box && g.settings.box.active);
  if (!guide) return null;
  const cfg = guide.settings.box;
  const slotKey = (regionSlug && cfg.regions && cfg.regions[regionSlug]) || cfg.default_slot;
  const link = (await links(site.id, 'box'))[slotKey] || null;
  if (!link) return null;
  return {
    heading: cfg.heading, text: cfg.text, after: Number.isInteger(Number(cfg.after)) && Number(cfg.after) > 0 ? Number(cfg.after) : null,
    link, guidePath: `/ratgeber/${guide.slug}`, guideLabel: cfg.guide_label || 'Ratgeber lesen',
  };
}

module.exports = {
  CLICK_KIND, LIST_MAX, unverified, bySlug, activeForSite, validateMeta, cardPublic, validateCard, cards,
  sidFor, slotHref, validFixedHref, linkView, links, validateSlot, slotForClick, countClick, pickRental, rentalList, box,
};
