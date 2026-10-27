// Partnerlinks (Affiliate) je Objekt: Programme, Links, Weiterleitung mit Klickzählung.
// Grundsatz: Partnerlinks beeinflussen weder Score noch Reihenfolge der Objekte; Anbieter erscheinen in der vom Admin
// festgelegten Reihenfolge (sort_order), immer als Anzeige gekennzeichnet, wenn Provision möglich ist.
// Objekte ohne eigenen Link bekommen bei Programmen mit auto_search die Suchseite des Anbieters (Name + Ort).
const db = require('../db');

const KINDS = { booking: 'Preise / Buchung', reviews: 'Bewertungen' };

// Nur eine Nummer eingetragen (z. B. Expedia-Hotel-ID 793891)? Dann Adresse aus der Vorlage des Programms (id_url mit {id})
function fromId(program, raw) {
  const v = String(raw || '').trim();
  return program.id_url && /^\d{3,12}$/.test(v) ? program.id_url.replace(/\{id\}/g, v) : v;
}

// Nummer aus einer Adresse lesen, die nach der Vorlage des Programms gebaut ist – auch aus langen Adressen mit Hotelnamen
// (…/h1786689.Hotel-Information oder …/Playitas.h1786689.Hotel-Information → 1786689). Gesucht wird das letzte Pfadstück
// vor {id} und der Text danach (bei Expedia „h“ und „.Hotel-Information“). Steht {id} in einem Parameter
// (CHECK24: ?c24pp_hotel_id={id}), zählt der Parameter an beliebiger Stelle der Adresse.
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function idOf(program, url) {
  if (!program || !program.id_url || !url || !program.id_url.includes('{id}')) return null;
  const [before, after] = program.id_url.split('{id}');
  const param = /[?&]([\w.-]+)=$/.exec(before);
  if (param) {
    const m = new RegExp(`[?&]${escRe(param[1])}=(\\d{3,12})(?:[&#]|$)`).exec(String(url));
    return m ? m[1] : null;
  }
  const lead = before.slice(before.lastIndexOf('/') + 1);
  const tail = (after || '').split(/[/?#]/)[0];
  const m = new RegExp(`${escRe(lead)}(\\d{3,12})${escRe(tail)}(?:[/?#]|$)`).exec(String(url));
  return m ? m[1] : null;
}

// Programm mit id_from (z. B. Hotels.com ← Expedia): Adresse aus der Nummer im Link des anderen Programms
function derivedUrl(program, source, sourceUrl) {
  const id = idOf(source, sourceUrl);
  return id && program.id_url ? program.id_url.replace(/\{id\}/g, id) : null;
}

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
// {slug} = Objekt-Slug, z. B. als Unterkennung (CJ: sid), damit im Netzwerk sichtbar ist, welches Objekt die Buchung brachte
function buildUrl(program, url, { slug = '' } = {}) {
  if (program.link_template) {
    return program.link_template.replace(/\{url_enc\}/g, encodeURIComponent(url)).replace(/\{url\}/g, url)
      .replace(/\{slug\}/g, encodeURIComponent(slug));
  }
  const u = new URL(url);
  for (const [k, v] of Object.entries(program.link_params || {})) if (!u.searchParams.has(k)) u.searchParams.set(k, String(v));
  return u.toString();
}

async function programs({ activeOnly = false } = {}) {
  return db.many(`SELECT * FROM partner_programs ${activeOnly ? "WHERE status = 'active'" : ''} ORDER BY sort_order, lower(name)`);
}

// Suchseite des Anbieters für ein Objekt ({q} = Name + Ort); null, wenn das Programm keine hat
function searchUrl(program, entity) {
  if (!program.search_url || !/\{q\}/.test(program.search_url)) return null;
  const q = [entity.name, entity.city].filter(Boolean).join(' ');
  return program.search_url.replace(/\{q\}/g, encodeURIComponent(q));
}

// Links eines Objekts für die öffentliche Seite: nur aktive Programme, in Admin-Reihenfolge.
// Ohne eigenen Link: Suchseite bei Programmen mit auto_search (auto: true, id: null).
async function linksFor(entityOrId) {
  const entity = typeof entityOrId === 'object' ? entityOrId : await db.one('SELECT id, name, city FROM entities WHERE id = $1', [entityOrId]);
  if (!entity) return [];
  const rows = await db.many(
    `SELECT l.id, l.kind, l.url, p.code, p.name, p.label_booking, p.label_reviews, p.link_params, p.link_template, p.sort_order,
            p.direct_link, p.trademark_notice
       FROM entity_links l JOIN partner_programs p ON p.id = l.program_id
      WHERE l.entity_id = $1 AND p.status = 'active'`, [entity.id]);
  // Nummer von einem anderen Programm übernehmen (id_from), wenn kein eigener Preis-Link eingetragen ist
  for (const p of await db.many(`SELECT * FROM partner_programs WHERE status = 'active' AND id_from IS NOT NULL AND id_url IS NOT NULL`)) {
    if (rows.some((r) => r.code === p.code && r.kind === 'booking')) continue;
    const src = await db.one(
      `SELECT l.url, s.id_url FROM entity_links l JOIN partner_programs s ON s.id = l.program_id
        WHERE l.entity_id = $1 AND s.code = $2 AND l.kind = 'booking'`, [entity.id, p.id_from]);
    const url = src && derivedUrl(p, src, src.url);
    if (url) rows.push({ id: null, kind: 'booking', url, code: p.code, name: p.name, label_booking: p.label_booking, label_reviews: p.label_reviews, link_params: p.link_params, link_template: p.link_template, sort_order: p.sort_order, direct_link: p.direct_link, trademark_notice: p.trademark_notice, derived: true });
  }
  for (const p of await db.many(`SELECT * FROM partner_programs WHERE status = 'active' AND auto_search IS NOT NULL`)) {
    if (rows.some((r) => r.code === p.code && r.kind === p.auto_search)) continue;
    const url = searchUrl(p, entity);
    if (url) rows.push({ id: null, kind: p.auto_search, url, code: p.code, name: p.name, label_booking: p.label_booking, label_reviews: p.label_reviews, link_params: p.link_params, link_template: p.link_template, sort_order: p.sort_order, direct_link: p.direct_link, trademark_notice: p.trademark_notice, auto: true });
  }
  rows.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'de') || a.kind.localeCompare(b.kind));
  for (const r of rows) r.monetized = monetized(r);
  return rows;
}

// Links je Anbieter gruppieren (Hotelseite, Vergleich): href je Art – über /go oder direkt (direct_link, Zählung per Beacon)
function groupLinks(links, slug) {
  const groups = [];
  for (const l of links) {
    let g = groups.find((x) => x.code === l.code);
    if (!g) {
      groups.push((g = { code: l.code, name: l.name, label_booking: l.label_booking, label_reviews: l.label_reviews, monetized: l.monetized,
        trademark_notice: l.trademark_notice || null, kinds: [], href: {}, count: {} }));
    }
    g.kinds.push(l.kind);
    const go = `/go/${slug}/${l.code}${l.kind === 'reviews' ? '/bewertungen' : ''}`;
    g.href[l.kind] = l.direct_link ? buildUrl(l, l.url, { slug }) : go;
    g.count[l.kind] = l.direct_link ? `${go}/klick` : null;
  }
  return groups;
}

// Admin: Links eines Objekts speichern (leer = löschen). input: { [programId]: { booking, reviews, absent } }
// absent = „gibt es nicht“ (Objekt beim Anbieter nicht gelistet) – nur ohne Preis-Link; ein Link hebt den Vermerk auf.
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
      // Adresse mit erkennbarer Hotel-Nummer auf die kurze Form der Vorlage bringen (ohne Reisedaten, die veralten)
      const id = idOf(p, raw);
      const url = allowedUrl(p, fromId(p, id || raw));
      if (!url) { errors.push(`${p.name} (${KINDS[kind]}): nur https-Adressen${p.domains.length ? ` von ${p.domains.join(', ')}` : ''}.`); continue; }
      if (old && old.url === url) continue;
      await db.query(
        `INSERT INTO entity_links (entity_id, program_id, kind, url, created_by) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (entity_id, program_id, kind) DO UPDATE SET url = EXCLUDED.url, updated_at = now()`,
        [entityId, p.id, kind, url, adminId]);
      changes.push({ program: p.code, kind, old: old ? old.url : null, new: url });
    }
    const hasBooking = Boolean(await db.one(`SELECT 1 FROM entity_links WHERE entity_id = $1 AND program_id = $2 AND kind = 'booking'`, [entityId, p.id]));
    const wantAbsent = !hasBooking && ((input || {})[p.id] || {}).absent === 'on';
    const wasAbsent = Boolean(await db.one('SELECT 1 FROM entity_link_absences WHERE entity_id = $1 AND program_id = $2', [entityId, p.id]));
    if (wantAbsent && !wasAbsent) {
      await db.query('INSERT INTO entity_link_absences (entity_id, program_id, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [entityId, p.id, adminId]);
      changes.push({ program: p.code, kind: 'absent', old: null, new: true });
    } else if (!wantAbsent && wasAbsent) {
      await db.query('DELETE FROM entity_link_absences WHERE entity_id = $1 AND program_id = $2', [entityId, p.id]);
      changes.push({ program: p.code, kind: 'absent', old: true, new: null });
    }
  }
  return { errors, changes };
}

// Weiterleitung: Link über Objekt-Slug, Programm-Code und Art finden; sonst Suchseite (auto_search)
async function resolve(entityType, slug, code, kind) {
  const link = await db.one(
    `SELECT l.*, p.link_params, p.link_template, p.status FROM entity_links l
       JOIN partner_programs p ON p.id = l.program_id JOIN entities e ON e.id = l.entity_id
      WHERE e.entity_type = $1 AND e.slug = $2 AND p.code = $3 AND l.kind = $4 AND p.status = 'active'`,
    [entityType, slug, code, kind]);
  if (link) return link;
  // Nummer aus dem Link eines anderen Programms (id_from)
  if (kind === 'booking') {
    const d = await db.one(
      `SELECT p.*, l.url AS source_url, s.id_url AS source_id_url FROM partner_programs p
         JOIN partner_programs s ON s.code = p.id_from
         JOIN entities e ON e.entity_type = $1 AND e.slug = $2
         JOIN entity_links l ON l.entity_id = e.id AND l.program_id = s.id AND l.kind = 'booking'
        WHERE p.code = $3 AND p.status = 'active' AND p.id_url IS NOT NULL`, [entityType, slug, code]);
    const url = d && derivedUrl(d, { id_url: d.source_id_url }, d.source_url);
    if (url) return { id: null, program_id: d.id, url, link_params: d.link_params, link_template: d.link_template, derived: true };
  }
  const p = await db.one(`SELECT * FROM partner_programs WHERE code = $1 AND status = 'active' AND auto_search = $2`, [code, kind]);
  const entity = p && await db.one('SELECT id, name, city FROM entities WHERE entity_type = $1 AND slug = $2', [entityType, slug]);
  const url = entity && searchUrl(p, entity);
  return url ? { id: null, program_id: p.id, url, link_params: p.link_params, link_template: p.link_template, auto: true } : null;
}

// Klicks nur als Anzahl je Tag (keine personenbezogenen Daten); Suchlinks je Programm
async function countClick(link) {
  const [kind, target] = typeof link === 'object' && !link.id ? ['partner_search', link.program_id] : ['entity_link', typeof link === 'object' ? link.id : link];
  await db.query(
    `INSERT INTO outbound_clicks (kind, target_id, day, clicks) VALUES ($1, $2, current_date, 1)
     ON CONFLICT (kind, target_id, day) DO UPDATE SET clicks = outbound_clicks.clicks + 1`, [kind, target]);
}

// Admin-Übersicht: Klicks der letzten Tage je Programm und je Objekt
async function stats(days = 30) {
  const byProgram = await db.many(
    `SELECT p.id, p.name, p.auto_search, count(DISTINCT l.id)::int AS links, COALESCE(sum(c.clicks), 0)::int AS clicks,
            (SELECT COALESCE(sum(s.clicks), 0)::int FROM outbound_clicks s WHERE s.kind = 'partner_search' AND s.target_id = p.id
              AND s.day > current_date - $1::int) AS search_clicks
       FROM partner_programs p LEFT JOIN entity_links l ON l.program_id = p.id
       LEFT JOIN outbound_clicks c ON c.kind = 'entity_link' AND c.target_id = l.id AND c.day > current_date - $1::int
      GROUP BY p.id, p.name ORDER BY p.sort_order, lower(p.name)`, [days]);
  const top = await db.many(
    `SELECT e.name, p.name AS program, l.kind, sum(c.clicks)::int AS clicks
       FROM outbound_clicks c JOIN entity_links l ON l.id = c.target_id JOIN partner_programs p ON p.id = l.program_id JOIN entities e ON e.id = l.entity_id
      WHERE c.kind = 'entity_link' AND c.day > current_date - $1::int
      GROUP BY e.name, p.name, l.kind ORDER BY clicks DESC LIMIT 15`, [days]);
  return { byProgram, top };
}

module.exports = { KINDS, fromId, idOf, derivedUrl, allowedUrl, monetized, buildUrl, searchUrl, programs, linksFor, groupLinks, saveLinks, resolve, countClick, stats };
