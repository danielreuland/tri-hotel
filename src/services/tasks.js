// Kanban-Board „Aufgaben“: Karten aus automatischen Quellen und eigene Aufgaben.
// sync() gleicht die Karten mit dem aktuellen Stand ab: neue Anlässe -> Karte in „Offen“,
// entfallene Anlässe -> „Erledigt“ (automatisch), geänderte Anlässe öffnen eine erledigte Karte wieder.
const db = require('../db');
const reviewlist = require('./reviewlist');
const { logAction } = require('../lib/audit');

const STATUSES = { open: 'Offen', in_progress: 'In Arbeit', done: 'Erledigt' };
const LABELS = {
  review: 'Prüfbericht',
  answers: 'Betreiber-Antwort',
  draft: 'Anfrage-Entwurf',
  inquiry_failed: 'Anfrage fehlgeschlagen',
  recheck: 'Nachprüfung',
  image_rights: 'Bildrechte',
  stuck: 'Auto-Prüfung hängt',
  unconfirmed: 'Neue Meldung',
  user_review: 'Bewertung',
  google_place: 'Google Place ID',
  contact: 'Kontaktanfrage',
  camp_partner: 'Camp-Anbieter',
  manual: 'Eigene Aufgabe',
};
// Punkte, die eine eigene Karte haben, erscheinen nicht noch einmal im Prüfbericht
const OWN_CARD_KEYS = new Set(['inquiry-draft', 'answers', 'place-suggestion']);
const DONE_DAYS = 30;

const fp = (lines) => lines.map((l) => `${l.level}:${l.text}`).join('|');
const detailLink = (subId, anchor) => (subId ? `/admin/meldungen/${subId}${anchor ? `#${anchor}` : ''}` : null);

// Alle aktuellen Anlässe
async function collect() {
  const out = [];
  const push = (t) => out.push({ ...t, fingerprint: t.fingerprint || fp(t.detail) });

  // Prüfberichte (Admin-Prüfung und live)
  const subs = await db.many(`SELECT id FROM submissions WHERE entity_id IS NOT NULL AND status IN ('admin_review','live') ORDER BY entity_name`);
  for (const s of subs) {
    const l = await reviewlist.load(s.id);
    if (!l) continue;
    const lines = l.review.items.filter((i) => i.level !== 'hint' && !OWN_CARD_KEYS.has(i.key)).map((i) => ({ level: i.level, text: i.text }));
    if (!lines.length) continue;
    push({ source: 'review', source_key: `review:${l.entity.id}:${l.ranking.id}`, title: l.sub.entity_name, detail: lines, link: detailLink(s.id, 'pruefliste'), entity_id: l.entity.id });
  }

  const latestSub = `(SELECT s.id FROM submissions s WHERE s.entity_id = e.id ORDER BY s.created_at DESC LIMIT 1)`;
  // Antworten von Betreibern
  for (const r of await db.many(
    `SELECT i.id, i.entity_id, e.name, COALESCE(i.submission_id, ${latestSub}) AS sub_id, count(a.id)::int AS n
       FROM inquiries i JOIN entities e ON e.id = i.entity_id JOIN inquiry_answers a ON a.inquiry_id = i.id AND a.status = 'pending'
      GROUP BY i.id, e.id`)) {
    push({ source: 'answers', source_key: `answers:${r.id}`, title: r.name, detail: [{ level: 'todo', text: `${r.n} ${r.n === 1 ? 'Antwort' : 'Antworten'} übernehmen oder verwerfen` }], link: detailLink(r.sub_id, 'anfragen'), entity_id: r.entity_id });
  }
  // Anfrage-Entwürfe und fehlgeschlagene Anfragen
  for (const r of await db.many(
    `SELECT i.id, i.status, i.recipient, i.error, cardinality(i.criteria_ids) AS n, i.entity_id, e.name, COALESCE(i.submission_id, ${latestSub}) AS sub_id
       FROM inquiries i JOIN entities e ON e.id = i.entity_id WHERE i.status IN ('draft', 'failed')`)) {
    if (r.status === 'draft') {
      push({ source: 'draft', source_key: `draft:${r.id}`, title: r.name, detail: [{ level: 'todo', text: `${r.n} Fragen an ${r.recipient} – freigeben oder verwerfen` }], link: detailLink(r.sub_id, 'anfragen'), entity_id: r.entity_id });
    } else {
      push({ source: 'inquiry_failed', source_key: `failed:${r.id}`, title: r.name, detail: [{ level: 'block', text: r.error || 'Versand fehlgeschlagen' }], link: detailLink(r.sub_id, 'anfragen'), entity_id: r.entity_id });
    }
  }
  // Fällige Nachprüfungen (live, Werte älter als recheck_months)
  for (const r of await db.many(
    `SELECT e.id AS entity_id, e.name, r.id AS ranking_id, ${latestSub} AS sub_id, count(*)::int AS n
       FROM entity_facts f JOIN criteria c ON c.id = f.criterion_id JOIN rankings r ON r.id = c.ranking_id JOIN entities e ON e.id = f.entity_id
       JOIN entity_rankings er ON er.entity_id = e.id AND er.ranking_id = r.id AND er.status = 'live'
      WHERE f.checked_at < now() - make_interval(months => COALESCE((r.formula->>'recheck_months')::int, 18))
      GROUP BY e.id, r.id`)) {
    push({ source: 'recheck', source_key: `recheck:${r.entity_id}:${r.ranking_id}`, title: r.name, detail: [{ level: 'todo', text: `${r.n} Werte älter als die Nachprüffrist` }], link: detailLink(r.sub_id, 'fakten'), entity_id: r.entity_id });
  }
  // Bildrechte laufen ab oder sind abgelaufen
  for (const r of await db.many(
    `SELECT e.id AS entity_id, e.name, ${latestSub} AS sub_id, count(*)::int AS n, min(i.valid_until) AS first
       FROM entity_images i JOIN entities e ON e.id = i.entity_id
      WHERE i.approved_at IS NOT NULL AND i.valid_until IS NOT NULL AND i.valid_until < current_date + 30 GROUP BY e.id`)) {
    push({ source: 'image_rights', source_key: `images:${r.entity_id}`, title: r.name, detail: [{ level: 'todo', text: `${r.n} ${r.n === 1 ? 'Bild' : 'Bilder'}: Nutzungsrecht endet ${new Date(r.first).toLocaleDateString('de-DE')}` }], link: detailLink(r.sub_id, 'bilder'), entity_id: r.entity_id });
  }
  // Meldungen: wartet auf Bestätigung bzw. Auto-Prüfung hängt
  for (const s of await db.many(`SELECT id, entity_name, status, created_at, updated_at FROM submissions WHERE status IN ('received','verified','auto_check')`)) {
    if (s.status === 'received') {
      push({ source: 'unconfirmed', source_key: `unconfirmed:${s.id}`, title: s.entity_name, detail: [{ level: 'todo', text: 'Wartet auf E-Mail-Bestätigung – ohne Bestätigung prüfen oder ablehnen' }], link: detailLink(s.id), entity_id: null });
    } else if (new Date(s.updated_at) < new Date(Date.now() - 3600 * 1000)) {
      push({ source: 'stuck', source_key: `stuck:${s.id}`, title: s.entity_name, detail: [{ level: 'block', text: 'Auto-Prüfung seit über einer Stunde ohne Ergebnis – erneut starten' }], link: detailLink(s.id), entity_id: null });
    }
  }
  // Bewertungen: zur Freigabe (bestätigt) bzw. E-Mail unbestätigt
  for (const r of await db.many(
    `SELECT r.id, r.status, r.author_name, r.title, r.body, r.entity_id, e.name FROM reviews r JOIN entities e ON e.id = r.entity_id
      WHERE r.status IN ('pending', 'received') ORDER BY r.created_at`)) {
    push({ source: 'user_review', source_key: `review-item:${r.id}`, title: r.name,
      detail: [{ level: 'todo', text: `${r.status === 'pending' ? 'Freigeben oder ablehnen' : 'E-Mail unbestätigt'} – ${r.author_name}: ${(r.title || r.body).replace(/\s+/g, ' ').slice(0, 140)}` }],
      link: `/admin/bewertungen#r-${r.id}`, entity_id: r.entity_id });
  }
  // Google Place IDs: eine Sammelkarte für alle offenen Vorschläge
  const places = await db.many(
    `SELECT e.name FROM entities e
      WHERE NOT (e.attributes ? 'google_place_id') AND e.attributes->'google_place_suggestion'->>'status' = 'found'
        AND EXISTS (SELECT 1 FROM entity_rankings er WHERE er.entity_id = e.id AND er.status IN ('in_review', 'live'))
      ORDER BY lower(e.name)`);
  if (places.length) {
    push({ source: 'google_place', source_key: 'google-place-suggestions', title: `${places.length} ${places.length === 1 ? 'Vorschlag' : 'Vorschläge'} für Google Place IDs`,
      detail: [{ level: 'todo', text: `In Maps prüfen und übernehmen: ${places.map((p) => p.name).join(', ')}` }],
      // nur bei neuen Vorschlägen wieder öffnen, nicht bei jeder übernommenen ID
      fingerprint: 'google-place', link: '/admin/google-orte', entity_id: null });
  }
  // Kontaktformular: offene Nachrichten
  for (const m of await db.many(`SELECT id, name, email, message, topic, company, request FROM contact_messages WHERE handled_at IS NULL ORDER BY created_at`)) {
    const isPartner = m.topic === 'anbieter';
    push({ source: isPartner ? 'camp_partner' : 'contact', source_key: `contact:${m.id}`,
      title: isPartner ? `${m.company} – ${({ korrektur: 'Korrektur', aufnahme: 'Aufnahme', partner: 'Partnerschaft', sonstiges: 'Anfrage' })[m.request] || 'Anfrage'}` : (m.name ? `${m.name} (${m.email})` : m.email),
      detail: [{ level: 'todo', text: m.message.replace(/\s+/g, ' ').slice(0, 300) }], link: `/admin/kontakt#m-${m.id}`, entity_id: null });
  }
  return out;
}

async function sync() {
  const current = await collect();
  const keys = new Set(current.map((t) => t.source_key));
  const existing = new Map((await db.many(`SELECT * FROM admin_tasks WHERE source_key IS NOT NULL`)).map((t) => [t.source_key, t]));
  const nextPos = async () => (await db.one(`SELECT COALESCE(max(position), 0) + 1 AS p FROM admin_tasks WHERE status = 'open'`)).p;
  for (const t of current) {
    const old = existing.get(t.source_key);
    if (!old) {
      await db.query(
        `INSERT INTO admin_tasks (source, source_key, title, detail, link, entity_id, fingerprint, status, position) VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8)
         ON CONFLICT (source_key) DO NOTHING`,
        [t.source, t.source_key, t.title, JSON.stringify(t.detail), t.link, t.entity_id, t.fingerprint, await nextPos()]
      );
      continue;
    }
    // Erledigte Karte wieder öffnen, wenn das System sie geschlossen hatte oder sich der Anlass geändert hat
    const reopen = old.status === 'done' && (old.done_auto || old.fingerprint !== t.fingerprint);
    await db.query(
      `UPDATE admin_tasks SET title = $2, detail = $3, link = $4, fingerprint = $5,
         status = CASE WHEN $6 THEN 'open' ELSE status END, done_auto = CASE WHEN $6 THEN false ELSE done_auto END,
         done_at = CASE WHEN $6 THEN NULL ELSE done_at END, position = CASE WHEN $6 THEN $7 ELSE position END,
         updated_at = CASE WHEN $6 OR detail <> $3 THEN now() ELSE updated_at END
       WHERE id = $1`,
      [old.id, t.title, JSON.stringify(t.detail), t.link, t.fingerprint, reopen, reopen ? await nextPos() : old.position]
    );
  }
  // Entfallene Anlässe: automatisch erledigt
  for (const old of existing.values()) {
    if (!keys.has(old.source_key) && old.status !== 'done') {
      await db.query(`UPDATE admin_tasks SET status = 'done', done_auto = true, done_at = now(), updated_at = now() WHERE id = $1`, [old.id]);
    }
  }
}

async function board({ assignee = null, label = null, me = null } = {}) {
  const rows = await db.many(
    `SELECT t.*, u.email AS assignee_email, u.display_name AS assignee_name, d.email AS done_by_email
       FROM admin_tasks t LEFT JOIN admin_users u ON u.id = t.assignee_id LEFT JOIN admin_users d ON d.id = t.done_by
      WHERE (t.status <> 'done' OR t.done_at > now() - make_interval(days => $1))
        AND ($2::text IS NULL OR t.source = $2)
        AND ($3::text IS NULL OR ($3 = 'me' AND t.assignee_id = $4) OR ($3 = 'none' AND t.assignee_id IS NULL))
      ORDER BY t.position, t.created_at`,
    [DONE_DAYS, label, assignee, me]
  );
  const columns = Object.fromEntries(Object.keys(STATUSES).map((s) => [s, []]));
  for (const r of rows) columns[r.status].push(r);
  columns.done.sort((a, b) => new Date(b.done_at || b.updated_at) - new Date(a.done_at || a.updated_at));
  return columns;
}

// Karte verschieben: Status setzen und Reihenfolge der Zielspalte übernehmen
async function move(id, status, order, adminId) {
  if (!STATUSES[status]) throw new Error('Unbekannte Spalte.');
  const t = await db.one('SELECT * FROM admin_tasks WHERE id = $1', [id]);
  if (!t) throw new Error('Aufgabe nicht gefunden.');
  await db.tx(async (c) => {
    await c.query(
      `UPDATE admin_tasks SET status = $2, updated_at = now(),
         done_at = CASE WHEN $2 = 'done' THEN COALESCE(done_at, now()) ELSE NULL END,
         done_by = CASE WHEN $2 = 'done' THEN $3::uuid ELSE NULL END,
         done_auto = false
       WHERE id = $1`,
      [id, status, adminId]
    );
    const ids = (order || []).filter((x) => typeof x === 'string');
    for (let i = 0; i < ids.length; i++) await c.query('UPDATE admin_tasks SET position = $2 WHERE id = $1 AND status = $3', [ids[i], i + 1, status]);
    if (t.status !== status) await logAction(adminId, 'task', id, 'move_task', { from: t.status, to: status, title: t.title }, c);
  });
}

async function assign(id, assigneeId, adminId) {
  await db.query('UPDATE admin_tasks SET assignee_id = $2, updated_at = now() WHERE id = $1', [id, assigneeId || null]);
  await logAction(adminId, 'task', id, 'assign_task', { assignee: assigneeId || null });
}

async function createManual({ title, note, link, assigneeId }, adminId) {
  const t = String(title || '').trim().slice(0, 200);
  if (!t) throw new Error('Bitte einen Titel angeben.');
  const lines = String(note || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8).map((text) => ({ level: 'hint', text: text.slice(0, 300) }));
  const safeLink = /^\/admin(\/|$)/.test(String(link || '')) ? String(link).slice(0, 300) : null;
  const pos = (await db.one(`SELECT COALESCE(max(position), 0) + 1 AS p FROM admin_tasks WHERE status = 'open'`)).p;
  const row = await db.one(
    `INSERT INTO admin_tasks (source, title, detail, link, status, position, assignee_id, created_by) VALUES ('manual', $1, $2, $3, 'open', $4, $5, $6) RETURNING id`,
    [t, JSON.stringify(lines), safeLink, pos, assigneeId || null, adminId]
  );
  await logAction(adminId, 'task', row.id, 'create_task', { title: t });
}

async function removeManual(id, adminId) {
  const r = await db.query(`DELETE FROM admin_tasks WHERE id = $1 AND source = 'manual'`, [id]);
  if (r.rowCount) await logAction(adminId, 'task', id, 'delete_task');
}

module.exports = { STATUSES, LABELS, collect, sync, board, move, assign, createManual, removeManual, fingerprint: fp };
