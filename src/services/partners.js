// Partnerlinks (Affiliate) je Objekt: Programme, Links, Weiterleitung mit Klickzählung.
// Grundsatz: Partnerlinks beeinflussen weder Score noch Reihenfolge; Anbieter erscheinen alphabetisch, immer als Anzeige gekennzeichnet.
const db = require('../db');

const KINDS = { booking: 'Preise / Buchung', reviews: 'Bewertungen' };

// Zieladresse zulässig? Nur https und – wenn das Programm Domains vorgibt – nur diese (inkl. Subdomains)
function allowedUrl(program, raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const domains = program.domains || [];
  if (domains.length && !domains.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`))) return null;
  return u.toString();
}

// Verdient das Programm an Klicks? (Partnerkennung oder Netzwerk-Vorlage eingetragen)
const monetized = (program) => Boolean(program.link_template || Object.keys(program.link_params || {}).length);

// Ausgehende Adresse: Netzwerk-Vorlage ({url}, {url_enc}) oder Parameter anhängen (vorhandene bleiben)
function buildUrl(program, url) {
  if (program.link_template) {
    return program.link_template.replace(/\{url_enc\}/g, encodeURIComponent(url)).replace(/\{url\}/g, url);
  }
  const u = new URL(url);
  for (const [k, v] of Object.entries(program.link_params || {})) if (!u.searchParams.has(k)) u.searchParams.set(k, String(v));
  return u.toString();
}

async function programs({ activeOnly = false } = {}) {
  return db.many(`SELECT * FROM partner_programs ${activeOnly ? "WHERE status = 'active'" : ''} ORDER BY lower(name)`);
}

// Links eines Objekts für die öffentliche Seite: nur aktive Programme, alphabetisch
async function linksFor(entityId) {
  const rows = await db.many(
    `SELECT l.id, l.kind, l.url, p.code, p.name, p.label_booking, p.label_reviews, p.link_params, p.link_template
       FROM entity_links l JOIN partner_programs p ON p.id = l.program_id
      WHERE l.entity_id = $1 AND p.status = 'active' ORDER BY lower(p.name), l.kind`, [entityId]);
  for (const r of rows) r.monetized = monetized(r);
  return rows;
}

// Admin: Links eines Objekts speichern (leer = löschen). input: { [programId]: { booking, reviews } }
async function saveLinks(entityId, input, adminId) {
  const progs = await programs();
  const errors = [];
  const changes = [];
  for (const p of progs) {
    for (const kind of Object.keys(KINDS)) {
      const raw = String(((input || {})[p.id] || {})[kind] || '').trim();
      const old = await db.one('SELECT * FROM entity_links WHERE entity_id = $1 AND program_id = $2 AND kind = $3', [entityId, p.id, kind]);
      if (!raw) {
        if (old) { await db.query('DELETE FROM entity_links WHERE id = $1', [old.id]); changes.push({ program: p.code, kind, old: old.url, new: null }); }
        continue;
      }
      const url = allowedUrl(p, raw);
      if (!url) { errors.push(`${p.name} (${KINDS[kind]}): nur https-Adressen${p.domains.length ? ` von ${p.domains.join(', ')}` : ''}.`); continue; }
      if (old && old.url === url) continue;
      await db.query(
        `INSERT INTO entity_links (entity_id, program_id, kind, url, created_by) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (entity_id, program_id, kind) DO UPDATE SET url = EXCLUDED.url, updated_at = now()`,
        [entityId, p.id, kind, url, adminId]);
      changes.push({ program: p.code, kind, old: old ? old.url : null, new: url });
    }
  }
  return { errors, changes };
}

// Weiterleitung: Link über Objekt-Slug, Programm-Code und Art finden
async function resolve(entityType, slug, code, kind) {
  return db.one(
    `SELECT l.*, p.link_params, p.link_template, p.status FROM entity_links l
       JOIN partner_programs p ON p.id = l.program_id JOIN entities e ON e.id = l.entity_id
      WHERE e.entity_type = $1 AND e.slug = $2 AND p.code = $3 AND l.kind = $4 AND p.status = 'active'`,
    [entityType, slug, code, kind]);
}

// Klicks nur als Anzahl je Tag (keine personenbezogenen Daten)
async function countClick(linkId) {
  await db.query(
    `INSERT INTO outbound_clicks (kind, target_id, day, clicks) VALUES ('entity_link', $1, current_date, 1)
     ON CONFLICT (kind, target_id, day) DO UPDATE SET clicks = outbound_clicks.clicks + 1`, [linkId]);
}

// Admin-Übersicht: Klicks der letzten Tage je Programm und je Objekt
async function stats(days = 30) {
  const byProgram = await db.many(
    `SELECT p.id, p.name, count(DISTINCT l.id)::int AS links, COALESCE(sum(c.clicks), 0)::int AS clicks
       FROM partner_programs p LEFT JOIN entity_links l ON l.program_id = p.id
       LEFT JOIN outbound_clicks c ON c.kind = 'entity_link' AND c.target_id = l.id AND c.day > current_date - $1::int
      GROUP BY p.id, p.name ORDER BY lower(p.name)`, [days]);
  const top = await db.many(
    `SELECT e.name, p.name AS program, l.kind, sum(c.clicks)::int AS clicks
       FROM outbound_clicks c JOIN entity_links l ON l.id = c.target_id JOIN partner_programs p ON p.id = l.program_id JOIN entities e ON e.id = l.entity_id
      WHERE c.kind = 'entity_link' AND c.day > current_date - $1::int
      GROUP BY e.name, p.name, l.kind ORDER BY clicks DESC LIMIT 15`, [days]);
  return { byProgram, top };
}

module.exports = { KINDS, allowedUrl, monetized, buildUrl, programs, linksFor, saveLinks, resolve, countClick, stats };
