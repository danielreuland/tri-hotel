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
  basics: 'Grunddaten fehlen',
  partner_link: 'Partnerlink',
  user_review: 'Bewertung',
  google_place: 'Google Place ID',
  camp_lead: 'Camp-Anfrage',
  camp_check: 'Camp-Anbieter prüfen',
  camp_pitch: 'Partnerschaft anbieten',
  camp_call: 'Anbieter anrufen',
  contact: 'Kontaktanfrage',
  mail: 'E-Mail',
  mail_unassigned: 'E-Mail zuordnen',
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
    push({ source: 'review', source_key: `review:${l.entity.id}:${l.ranking.id}`, title: l.entity.name, detail: lines, link: detailLink(s.id, 'pruefliste'), entity_id: l.entity.id });
  }

  const latestSub = `(SELECT s.id FROM submissions s WHERE s.entity_id = e.id ORDER BY s.created_at DESC LIMIT 1)`;
  // Antworten von Betreibern
  for (const r of await db.many(
    `SELECT i.id, i.entity_id, e.name, COALESCE(i.submission_id, ${latestSub}) AS sub_id, count(a.id)::int AS n
       FROM inquiries i JOIN entities e ON e.id = i.entity_id
       JOIN (SELECT inquiry_id, id FROM inquiry_answers WHERE status = 'pending'
             UNION ALL SELECT inquiry_id, id FROM inquiry_feature_answers WHERE status = 'pending') a ON a.inquiry_id = i.id
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
  // Partnerlink prüfen / generieren: live, aber ohne Preis-Link bei einem aktiven Programm mit Provision
  //   (Fingerabdruck = fehlende Programme: erledigt bleibt erledigt, bis ein weiteres Programm dazukommt)
  const partnerSvc = require('./partners');
  const paying = (await db.many(`SELECT * FROM partner_programs WHERE status = 'active' ORDER BY sort_order, name`)).filter(partnerSvc.monetized);
  if (paying.length) {
    for (const r of await db.many(
      `SELECT e.id AS entity_id, e.name, ${latestSub} AS sub_id,
              COALESCE(array_agg(DISTINCT l.program_id) FILTER (WHERE l.kind = 'booking'), '{}')
                || COALESCE((SELECT array_agg(a.program_id) FROM entity_link_absences a WHERE a.entity_id = e.id), '{}') AS have
         FROM entities e JOIN entity_rankings er ON er.entity_id = e.id AND er.status = 'live'
         LEFT JOIN entity_links l ON l.entity_id = e.id
        GROUP BY e.id ORDER BY lower(e.name)`)) {
      const missing = paying.filter((p) => !p.auto_search && !r.have.includes(p.id));
      if (!missing.length) continue;
      push({ source: 'partner_link', source_key: `partner-link:${r.entity_id}`, title: `${r.name} – Partnerlink prüfen / generieren`,
        detail: [{ level: 'todo', text: `${missing.map((p) => p.name).join(', ')}: Link fehlt – Seite des Hotels suchen und eintragen; gibt es keine: beim Hotel „nicht vorhanden“ anhaken` }],
        fingerprint: `partner:${missing.map((p) => p.code).join(',')}`, link: detailLink(r.sub_id, 'partnerlinks'), entity_id: r.entity_id });
    }
  }
  // Grunddaten fehlen: Auto-Prüfung wartet auf Website, Google-Eintrag oder Koordinaten
  const basicsService = require('./basics');
  for (const s of await db.many(
    `SELECT s.id, s.entity_name, e.id AS entity_id, e.name, e.website, e.lat, e.lng, e.attributes
       FROM submissions s JOIN entities e ON e.id = s.entity_id WHERE s.status = 'basics' ORDER BY s.updated_at`)) {
    const miss = basicsService.missing(s);
    const gs = (s.attributes || {}).geo_suggestion;
    const lines = miss.map((k) => ({ level: 'todo', text: k === 'coords' && gs && gs.candidates && gs.candidates.length
      ? `Koordinaten: Vorschlag bestätigen (${gs.reason})` : `${basicsService.KEYS[k]} fehlt` }));
    if (!lines.length) lines.push({ level: 'todo', text: 'Vollständig – Auto-Prüfung läuft gleich weiter' });
    push({ source: 'basics', source_key: `basics:${s.id}`, title: s.name || s.entity_name, detail: lines, link: detailLink(s.id, 'grunddaten'), entity_id: s.entity_id });
  }
  // Bewertungen: zur Freigabe (bestätigt) bzw. E-Mail unbestätigt
  for (const r of await db.many(
    `SELECT r.id, r.status, r.author_name, r.title, r.body, r.entity_id, e.name FROM reviews r JOIN entities e ON e.id = r.entity_id
      WHERE r.status IN ('pending', 'received') ORDER BY r.created_at`)) {
    push({ source: 'user_review', source_key: `review-item:${r.id}`, title: r.name,
      detail: [{ level: 'todo', text: `${r.status === 'pending' ? 'Freigeben oder ablehnen' : 'E-Mail unbestätigt'} – ${r.author_name}: ${(r.title || r.body).replace(/\s+/g, ' ').slice(0, 140)}` }],
      link: `/admin/bewertungen#r-${r.id}`, entity_id: r.entity_id });
  }
  // Camp-Anfragen: bestätigt, aber noch nicht weitergeleitet
  for (const l of await db.many(
    `SELECT l.id, l.name, l.persons, l.period_month, COALESCE(p.name, e.name) AS provider FROM camp_leads l
       LEFT JOIN camp_providers p ON p.id = l.provider_id LEFT JOIN entities e ON e.id = l.entity_id
      WHERE l.status = 'confirmed' ORDER BY l.confirmed_at NULLS LAST`)) {
    push({ source: 'camp_lead', source_key: `lead:${l.id}`, title: `${l.provider} – Anfrage ${l.name}`,
      detail: [{ level: 'todo', text: `${l.persons} Person(en)${l.period_month ? `, ${new Date(l.period_month).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })}` : ''} – prüfen und weiterleiten` }],
      link: `/admin/camp-anfragen#l-${l.id}`, entity_id: null });
  }
  // Camp-Anfragen an Anbieter ohne Vereinbarung: positive Rückmeldung → Ben bietet die Partnerschaft an (je Anbieter eine Karte)
  for (const r of await db.many(
    `SELECT p.id, p.name, p.contact_email, p.contact_phone, count(*)::int AS n FROM camp_leads l JOIN camp_providers p ON p.id = l.provider_id
      WHERE l.outcome = 'offer_sent' AND l.partner_at_forward = false AND NOT p.lead_active GROUP BY p.id`)) {
    push({ source: 'camp_pitch', source_key: `camp-pitch:${r.id}`, title: r.name,
      detail: [{ level: 'todo', text: `${r.n} ${r.n === 1 ? 'Anfrage' : 'Anfragen'} mit Angebot beantwortet – Ben bietet eine Partnerschaft an` },
        { level: 'todo', text: [r.contact_email, r.contact_phone].filter(Boolean).join(' · ') || 'Kontakt im Profil ergänzen' }],
      link: `/admin/camps/${r.id}`, entity_id: null });
  }
  // Keine Rückmeldung 5 Tage nach der Nachfrage → anrufen (je Anbieter eine Karte)
  for (const r of await db.many(
    `SELECT p.id, p.name, p.contact_phone, count(*)::int AS n, min(l.followup_sent_at) AS since FROM camp_leads l JOIN camp_providers p ON p.id = l.provider_id
      WHERE l.status = 'forwarded' AND l.outcome IS NULL AND l.followup_sent_at < now() - interval '5 days' AND l.anonymized_at IS NULL GROUP BY p.id`)) {
    push({ source: 'camp_call', source_key: `camp-call:${r.id}`, title: r.name,
      detail: [{ level: 'todo', text: `${r.n} ${r.n === 1 ? 'Anfrage' : 'Anfragen'} ohne Rückmeldung seit ${new Date(r.since).toLocaleDateString('de-DE')} – anrufen und nachfragen` },
        { level: r.contact_phone ? 'todo' : 'block', text: r.contact_phone ? `Telefon: ${r.contact_phone}` : 'Keine Telefonnummer im Profil' }],
      link: `/admin/camps/${r.id}`, entity_id: null });
  }
  // Camp-Anbieter in Prüfung: Ergebnis der automatischen Qualifikation freigeben oder ablehnen
  const Q = { qualified: ['todo', 'Automatische Prüfung grün – freigeben?'], review: ['todo', 'Automatische Prüfung gelb – Punkte ansehen'], not_qualified: ['block', 'Automatische Prüfung rot – ablehnen oder klären'] };
  for (const c of await db.many(
    `SELECT id, name, qualification, check_status, check_report FROM camp_providers WHERE status = 'draft' AND check_status IN ('done', 'failed')`)) {
    const open = ((c.check_report || {}).rules || []).filter((r) => r.level !== 'ok' && (r.required || r.review)).map((r) => r.label);
    const [level, text] = c.check_status === 'failed' ? ['block', 'Automatische Prüfung abgebrochen – erneut starten'] : Q[c.qualification] || Q.review;
    push({ source: 'camp_check', source_key: `camp-check:${c.id}`, title: c.name,
      detail: [{ level, text }, ...open.slice(0, 3).map((t) => ({ level: 'todo', text: t }))], link: `/admin/camps/${c.id}#pruefung`, entity_id: null });
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
  // Postfach: jede neue Mail eine Karte – zugeordnete unter dem Objekt bzw. Anbieter, sonst „zuordnen“
  for (const m of await db.many(
    `SELECT m.id, m.kind, m.from_email, m.from_name, m.subject, m.body_text, m.entity_id, e.name AS entity_name, cp.name AS provider_name, p.name AS persona_name
       FROM mail_messages m LEFT JOIN entities e ON e.id = m.entity_id LEFT JOIN camp_providers cp ON cp.id = m.camp_provider_id
       LEFT JOIN personas p ON p.id = m.persona_id
      WHERE m.status = 'new' ORDER BY m.received_at`)) {
    const assigned = m.entity_name || m.provider_name;
    const who = m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email;
    const lead = m.kind === 'bounce' ? 'Unzustellbar' : `${who}${m.persona_name ? ` an ${m.persona_name}` : ''}`;
    push({ source: assigned ? 'mail' : 'mail_unassigned', source_key: `mail:${m.id}`,
      title: assigned ? `${assigned} – ${m.subject || '(ohne Betreff)'}` : `Neue Mail – zuordnen: ${m.subject || '(ohne Betreff)'}`,
      detail: [{ level: m.kind === 'bounce' ? 'block' : 'todo', text: `${lead}: ${(m.body_text || '').replace(/\s+/g, ' ').slice(0, 200)}` }],
      fingerprint: assigned ? 'assigned' : 'open', link: `/admin/postfach/${m.id}`, entity_id: m.entity_id });
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

// Nicht erledigte Karten (Offen + In Arbeit) je Label, mit demselben Personenfilter wie das Board
async function openCounts({ assignee = null, me = null } = {}) {
  const rows = await db.many(
    `SELECT source, count(*)::int AS n FROM admin_tasks
      WHERE status <> 'done' AND ($1::text IS NULL OR ($1 = 'me' AND assignee_id = $2) OR ($1 = 'none' AND assignee_id IS NULL))
      GROUP BY source`, [assignee, me]);
  return Object.fromEntries(rows.map((r) => [r.source, r.n]));
}

// Karte verschieben: Status setzen und Reihenfolge der Zielspalte übernehmen.
// Wer eine Karte ohne Zuständigen nach „In Arbeit“ zieht, wird zuständig. Rückgabe: Zuständiger danach
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
    // Mail-Karte erledigt = Mail im Postfach erledigt
    if (status === 'done' && t.source_key && t.source_key.startsWith('mail:')) {
      await c.query(`UPDATE mail_messages SET status = 'done', handled_at = now(), handled_by = $2 WHERE id = $1 AND status = 'new'`, [t.source_key.slice(5), adminId]);
    }
    if (status === 'in_progress' && !t.assignee_id && adminId) {
      await c.query('UPDATE admin_tasks SET assignee_id = $2 WHERE id = $1', [id, adminId]);
      await logAction(adminId, 'task', id, 'assign_task', { assignee: adminId, auto: true }, c);
    }
  });
  return status === 'in_progress' && !t.assignee_id && adminId ? adminId : t.assignee_id;
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

module.exports = { STATUSES, LABELS, collect, sync, board, openCounts, move, assign, createManual, removeManual, fingerprint: fp };
