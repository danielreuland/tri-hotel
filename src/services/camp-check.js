// Automatische Qualifikation von Camp-Anbietern: Website lesen, Angaben mit Fundstelle auswerten, Prüfregeln anwenden.
// Grundsatz wie bei Hotels: Maschine bereitet vor, der Admin gibt frei. „Nicht gefunden“ ist kein „nein“ –
// nur ausdrückliche Gegenbelege (Website nicht erreichbar, Angebot passt nicht zum Thema) ergeben „nicht qualifiziert“.
const db = require('../db');
const config = require('../config');

const QUALIFICATION = {
  qualified: 'qualifiziert',
  review: 'prüfen',
  not_qualified: 'nicht qualifiziert',
};

// Prüfregeln. required: muss erfüllt sein; review: fehlt es, wird die Ampel gelb (kein Ausschluss); sonst nur Hinweis
const RULES = [
  { key: 'website', label: 'Website erreichbar', required: true },
  { key: 'topic', label: 'Angebot passt zum Thema der Site', required: true },
  { key: 'imprint', label: 'Impressum mit Firma und Anschrift', required: true },
  { key: 'contact', label: 'Kontaktweg (E-Mail, Formular oder Telefon)', required: true },
  { key: 'dates', label: 'Termine in der laufenden oder nächsten Saison', review: true },
  { key: 'destinations', label: 'Zielorte oder Hotels genannt' },
  { key: 'prices', label: 'Preise erkennbar' },
];

const MODELS = ['operator', 'coach', 'resort', 'community', 'group'];
const HOTEL = ['yes', 'optional', 'partner', 'required', 'no', 'unknown'];
const FLIGHT = ['yes', 'partner', 'no', 'unknown'];
const FLAG_KEYS = ['beginner', 'women', 'swim', 'family', 'camp_only'];

function normalizeWs(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

// Fundstelle prüfen: wörtliches Zitat muss auf der angegebenen Seite stehen
function evidenceOk(item, pageText) {
  if (!item || !item.evidence_url) return false;
  const quote = normalizeWs(item.evidence_text);
  const source = pageText.get(item.evidence_url);
  return Boolean(quote && source && source.includes(quote));
}

function ev(item) {
  return { evidence_url: item.evidence_url, evidence_text: String(item.evidence_text || '').slice(0, 500) };
}

const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const str = (v, max) => { const s = normalizeWs(v); return s ? s.slice(0, max) : null; };

// Ausgabe des Modells bereinigen: nur Angaben mit überprüfbarer Fundstelle, nur erlaubte Werte
function sanitize(raw, pages) {
  const pageText = new Map(pages.map((p) => [p.url, normalizeWs(p.text)]));
  const links = new Set(pages.flatMap((p) => (p.links || []).map((l) => l.url.replace(/\/$/, ''))));
  const r = raw || {};
  const out = { topic: null, imprint: null, contact: null, model: null, seat: null, summary: null, destinations: [], features: {}, prices: [], dates: [], hotels: [] };
  if (r.topic && typeof r.topic.on_topic === 'boolean' && evidenceOk(r.topic, pageText)) {
    out.topic = { on_topic: r.topic.on_topic, reason: str(r.topic.reason, 300), ...ev(r.topic) };
  }
  if (r.imprint && str(r.imprint.company, 200) && str(r.imprint.address, 300) && evidenceOk(r.imprint, pageText)) {
    out.imprint = { company: str(r.imprint.company, 200), address: str(r.imprint.address, 300), ...ev(r.imprint) };
  }
  if (r.contact && (str(r.contact.email, 200) || r.contact.form || str(r.contact.phone, 60)) && evidenceOk(r.contact, pageText)) {
    out.contact = { email: str(r.contact.email, 200), form: Boolean(r.contact.form), phone: str(r.contact.phone, 60), ...ev(r.contact) };
  }
  if (r.profile && evidenceOk(r.profile, pageText)) {
    out.model = MODELS.includes(r.profile.model) ? r.profile.model : null;
    out.seat = str(r.profile.seat, 120);
    out.summary = str(r.profile.summary, 1500);
    out.profileEvidence = ev(r.profile);
  }
  for (const d of r.destinations || []) {
    const name = str(d.name, 120);
    if (name && evidenceOk(d, pageText) && !out.destinations.some((x) => x.name === name)) out.destinations.push({ name, ...ev(d) });
  }
  const f = r.features || {};
  const feat = (key, allowed) => (f[key] && allowed.includes(f[key].value) && evidenceOk(f[key], pageText) ? { value: f[key].value, ...ev(f[key]) } : null);
  out.features.hotel = feat('hotel', HOTEL);
  out.features.flight = feat('flight', FLIGHT);
  for (const k of FLAG_KEYS) out.features[k] = f[k] && typeof f[k].value === 'boolean' && evidenceOk(f[k], pageText) ? { value: f[k].value, ...ev(f[k]) } : null;
  out.features.max_group = f.max_group && str(f.max_group.value, 40) && evidenceOk(f.max_group, pageText) ? { value: str(f.max_group.value, 40), ...ev(f.max_group) } : null;
  for (const p of (r.prices || []).slice(0, 8)) {
    if (str(p.price, 80) && evidenceOk(p, pageText)) out.prices.push({ label: str(p.label, 120), duration: str(p.duration, 60), price: str(p.price, 80), included: str(p.included, 300), ...ev(p) });
  }
  for (const d of (r.dates || []).slice(0, 30)) {
    const start = isoDate(d.start);
    if (start && evidenceOk(d, pageText)) out.dates.push({ label: str(d.label, 120), start, end: isoDate(d.end), ...ev(d) });
  }
  for (const h of (r.hotels || []).slice(0, 30)) {
    const name = str(h.name, 160);
    if (!name || !evidenceOk(h, pageText) || out.hotels.some((x) => x.name === name)) continue;
    const country = /^[A-Z]{2}$/.test(String(h.country || '').toUpperCase()) ? String(h.country).toUpperCase() : null;
    // Website nur, wenn sie auf den gelesenen Seiten verlinkt ist (nicht vom Modell geraten)
    let website = null;
    try {
      const u = h.website ? new URL(h.website).toString() : null;
      website = u && links.has(u.replace(/\/$/, '')) ? u : null;
    } catch { website = null; }
    out.hotels.push({ name, place: str(h.place, 120), country, website, ...ev(h) });
  }
  return out;
}

// Laufende oder nächste Saison: Termine ab heute bis 18 Monate voraus
function upcomingDates(dates, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const limit = new Date(now.getTime() + 548 * 86400000).toISOString().slice(0, 10);
  return dates.filter((d) => (d.end || d.start) >= today && d.start <= limit);
}

// Prüfregeln anwenden. pagesRead: Anzahl gelesener Seiten (0 = Website nicht erreichbar)
function qualify(x, { pagesRead, now = new Date() }) {
  const rule = (key, level, text, evidence = null) => {
    const def = RULES.find((r) => r.key === key);
    return { key, label: def.label, required: Boolean(def.required), review: Boolean(def.review), level, text, ...(evidence || {}) };
  };
  const rules = [];
  rules.push(pagesRead ? rule('website', 'ok', `${pagesRead} Seiten gelesen`) : rule('website', 'fail', 'Website nicht erreichbar'));
  if (!pagesRead) {
    return { rules, qualification: 'not_qualified', completeness: 0 };
  }
  rules.push(!x.topic ? rule('topic', 'warn', 'Nicht eindeutig erkennbar – bitte prüfen')
    : x.topic.on_topic ? rule('topic', 'ok', x.topic.reason || 'passt', x.topic)
      : rule('topic', 'fail', x.topic.reason || 'passt nicht zum Thema', x.topic));
  rules.push(x.imprint ? rule('imprint', 'ok', `${x.imprint.company}, ${x.imprint.address}`, x.imprint) : rule('imprint', 'warn', 'Kein Impressum mit Firma und Anschrift gefunden'));
  rules.push(x.contact ? rule('contact', 'ok', [x.contact.email, x.contact.phone, x.contact.form ? 'Kontaktformular' : null].filter(Boolean).join(' · '), x.contact)
    : rule('contact', 'warn', 'Kein Kontaktweg gefunden'));
  const upcoming = upcomingDates(x.dates, now);
  rules.push(upcoming.length ? rule('dates', 'ok', `${upcoming.length} Termin(e), z. B. ${upcoming[0].label || upcoming[0].start}`, upcoming[0])
    : x.dates.length ? rule('dates', 'warn', 'Nur vergangene Termine gefunden') : rule('dates', 'warn', 'Keine Termine gefunden'));
  rules.push(x.destinations.length || x.hotels.length
    ? rule('destinations', 'ok', [...x.destinations.map((d) => d.name), ...x.hotels.map((h) => h.name)].slice(0, 6).join(', '), x.destinations[0] || x.hotels[0])
    : rule('destinations', 'warn', 'Keine Zielorte oder Hotels gefunden'));
  rules.push(x.prices.length ? rule('prices', 'ok', x.prices.map((p) => p.price).slice(0, 3).join(' · '), x.prices[0]) : rule('prices', 'warn', 'Keine Preise gefunden'));

  const qualification = qualificationOf(rules);
  // Vollständigkeit des Profils: Anteil der belegten Profilangaben
  const fields = [x.model, x.seat, x.summary, x.destinations.length, x.prices.length, x.features.hotel, x.features.flight, upcoming.length, x.contact, x.imprint];
  const completeness = Math.round((100 * fields.filter(Boolean).length) / fields.length);
  return { rules, qualification, completeness };
}

// Ampel aus den Regeln: Pflicht verletzt → rot; Pflicht oder „bei Fehlen prüfen“ offen → gelb; sonst grün
function qualificationOf(rules) {
  if (rules.some((r) => r.required && r.level === 'fail')) return 'not_qualified';
  if (rules.some((r) => (r.required || r.review) && r.level !== 'ok')) return 'review';
  return 'qualified';
}

// Kontakt im Profil (vom Admin eingetragen oder übernommen) erfüllt die Regel „Kontaktweg“
function withProfileContact(rules, p) {
  const contact = [p.contact_email, p.contact_phone].filter(Boolean);
  if (!contact.length) return rules;
  return rules.map((r) => (r.key === 'contact' && r.level !== 'ok'
    ? { ...r, level: 'ok', text: `Im Profil: ${contact.join(' · ')}`, evidence_url: p.contact_evidence || r.evidence_url || null, evidence_text: null }
    : r));
}

// ---------- Auswertung per KI (festes Schema, jede Angabe mit Fundstelle) ----------

// Flache Liste statt verschachtelter Objekte: ein Eintragstyp hält das Antwortschema klein (strukturierte Ausgabe).
// kind: topic | imprint | contact | profile | destination | feature | price | date | hotel – Felder je kind siehe Prompt.
const KINDS = ['topic', 'imprint', 'contact', 'profile', 'destination', 'feature', 'price', 'date', 'hotel'];

// Einträge der KI in die Form bringen, die sanitize() erwartet (erster Eintrag je Einzelangabe zählt)
function fromItems(items) {
  const raw = { topic: null, imprint: null, contact: null, profile: null, destinations: [], features: {}, prices: [], dates: [], hotels: [] };
  const evd = (i) => ({ evidence_url: i.evidence_url, evidence_text: i.evidence_text });
  for (const i of items || []) {
    if (i.kind === 'topic' && !raw.topic && ['yes', 'no'].includes(i.value)) raw.topic = { on_topic: i.value === 'yes', reason: i.detail, ...evd(i) };
    if (i.kind === 'imprint' && !raw.imprint) raw.imprint = { company: i.name, address: i.detail, ...evd(i) };
    if (i.kind === 'contact' && !raw.contact) raw.contact = { email: i.value, form: /form/i.test(i.detail || ''), phone: i.place, ...evd(i) };
    if (i.kind === 'profile' && !raw.profile) raw.profile = { model: i.value, seat: i.place, summary: i.detail, ...evd(i) };
    if (i.kind === 'destination') raw.destinations.push({ name: i.name, ...evd(i) });
    if (i.kind === 'feature' && !raw.features[i.name]) {
      const v = FLAG_KEYS.includes(i.name) ? (i.value === 'yes' ? true : i.value === 'no' ? false : null) : i.value;
      if (v !== null && v !== undefined && v !== '') raw.features[i.name] = { value: v, ...evd(i) };
    }
    if (i.kind === 'price') raw.prices.push({ label: i.name, duration: i.place, price: i.value, included: i.detail, ...evd(i) });
    if (i.kind === 'date') raw.dates.push({ label: i.name, start: i.start, end: i.end, ...evd(i) });
    if (i.kind === 'hotel') raw.hotels.push({ name: i.name, place: i.place, country: i.country, website: i.website, ...evd(i) });
  }
  return raw;
}

async function extractCamp({ provider, topic, pages }) {
  const { z } = require('zod');
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const Item = z.object({
    kind: z.enum(KINDS), name: z.string(), value: z.string(), detail: z.string(), place: z.string(), country: z.string(),
    website: z.string(), start: z.string(), end: z.string(), evidence_url: z.string(), evidence_text: z.string(),
  });
  const Schema = z.object({ items: z.array(Item) });
  const pageBlock = pages.map((p, i) => {
    const links = (p.links || []).length ? `\nExterne Links: ${p.links.map((l) => `${l.text || '–'} → ${l.url}`).join(' | ')}` : '';
    return `<page index="${i + 1}" url="${p.url}">\n${p.text}${links}\n</page>`;
  }).join('\n\n');
  const prompt = `Du prüfst die Website des Camp-Anbieters „${provider.name}“ (${provider.website}) für eine neutrale Übersicht von Trainingscamps.
Thema der Übersicht: ${topic}

Gib unter "items" je Angabe einen Eintrag zurück – nur, was auf den Seiten ausdrücklich steht. Nicht benötigte Felder leer ("").
- kind "topic" (genau einer): value "yes" oder "no" – passt das Angebot zum Thema? "no" nur, wenn klar ein anderes Angebot vorliegt; detail = kurze Begründung.
- kind "imprint": name = Firma bzw. Name, detail = Postanschrift (aus dem Impressum).
- kind "contact": value = Kontakt-E-Mail, place = Telefon, detail = "form", wenn es ein Kontaktformular gibt.
- kind "profile" (einer): value = operator (Reiseveranstalter) | coach (Coach-Camp) | resort (Sportresort/Trainingszentrum) | community (Spezial-/Community-Camp) | group (Vereins-/Gruppenreise); place = Sitz (Ort); detail = Kurzprofil in 2–3 eigenen, sachlichen Sätzen ohne Werbesprache.
- kind "destination": name = Zielort bzw. Region der Camps (z. B. „Mallorca“).
- kind "feature": name = hotel (value yes = im Paket | optional | partner = über Partner | required = Pflicht/Resort | no), flight (value yes | partner | no), beginner | women | swim | family | camp_only (value yes nur bei ausdrücklichem Angebot, no nur bei ausdrücklichem Ausschluss), max_group (value = maximale Gruppengröße als Text).
- kind "price": name = Bezeichnung, place = Dauer, value = Preis wie angegeben, detail = was enthalten ist.
- kind "date": name = Bezeichnung, start/end = Termin im Format JJJJ-MM-TT (end leer, wenn nicht angegeben).
- kind "hotel": Unterkunft, in der Camps stattfinden: name, place = Ort, country = ISO-Code (z. B. ES), website nur, wenn die Seite das Hotel verlinkt (aus „Externe Links“), sonst leer.

Regeln:
- evidence_url: url der Seite mit dem Beleg; evidence_text: wörtliches Zitat (max. 300 Zeichen) von dieser Seite.
- Nichts erfinden, nichts aus Allgemeinwissen ergänzen. Kurzprofil und Begründung auf Deutsch.

${pageBlock}`;
  const llm = require('../lib/llm');
  await llm.assertBudget();
  const response = await llm.anthropic().messages.parse(
    {
      model: llm.modelFor('extract'),
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(Schema) },
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    },
    { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } }
  );
  const usage = { model: response.model, raw: response.usage };
  if (response.stop_reason === 'refusal' || !response.parsed_output) return { raw: null, usage };
  return { raw: fromItems(response.parsed_output.items), usage };
}

// ---------- Prüflauf (Job „camp-check“) ----------

let enqueue = async () => {};
function setEnqueue(fn) {
  enqueue = fn;
}

async function queue(providerId) {
  await db.query(`UPDATE camp_providers SET check_status = 'queued', updated_at = now() WHERE id = $1`, [providerId]);
  await enqueue('camp-check', { providerId });
}

const LINK_LABELS = ['Impressum', 'Kontakt', 'Termine', 'Preise', 'Camps', 'Trainingslager', 'Reisen', 'Hotel', 'Unterkunft', 'Leistungen'];

async function run(providerId) {
  const p = await db.one('SELECT * FROM camp_providers WHERE id = $1', [providerId]);
  if (!p) return;
  const log = [];
  const note = (step, ok, info) => log.push({ step, ok, info, at: new Date().toISOString() });
  await db.query(`UPDATE camp_providers SET check_status = 'running', updated_at = now() WHERE id = $1`, [p.id]);
  try {
    const site = await db.one('SELECT * FROM sites WHERE id = $1', [p.site_id]);
    const topic = (site && site.camp_topic) || (site && site.name) || 'Trainingscamps';

    // 1. Website lesen
    const extractor = require('./extractor');
    let pages = [];
    try {
      pages = await extractor.fetchSite(p.website, { labels: LINK_LABELS });
      note('Website', pages.length > 0, pages.length ? `${pages.length} Seiten gelesen` : 'Website nicht erreichbar');
    } catch (err) {
      note('Website', false, err.message);
    }

    // 2. Angaben per KI (ohne LLM_PROVIDER: nur Erreichbarkeit, Rest bleibt „prüfen“)
    let x = sanitize(null, pages);
    if (pages.length && config.llm.provider === 'anthropic') {
      try {
        const { raw, usage } = await extractCamp({ provider: p, topic, pages });
        if (usage) await require('../lib/llm').record({ purpose: 'camp_check', model: usage.model, usage: usage.raw });
        x = sanitize(raw, pages);
        note('Auswertung', true, `${x.destinations.length} Zielorte, ${x.hotels.length} Hotels, ${x.dates.length} Termine, ${x.prices.length} Preise mit Fundstelle`);
      } catch (err) {
        note('Auswertung', false, err.message);
      }
    } else if (pages.length) {
      note('Auswertung', false, 'Keine KI eingerichtet (LLM_PROVIDER) – Angaben bitte von Hand prüfen');
    }

    // 3. Prüfregeln
    const result = qualify(x, { pagesRead: pages.length });

    // 3b. Keine E-Mail auf der Website: Hunter.io (nur allgemeine Adresse, Vorschlag im Bericht; Ergebnis 180 Tage wiederverwenden)
    let hunterLookup = (p.check_report || {}).hunter || null;
    if (pages.length && !(x.contact && x.contact.email)) {
      const hunter = require('./hunter');
      const fresh = hunterLookup && !hunter.lookupFailed(hunterLookup) && Date.now() - new Date(hunterLookup.at).getTime() < 180 * 86400000;
      if (!fresh && hunter.enabled()) {
        const { suggestion, reason, failed } = await hunter.findGenericEmail(p.website, { campProviderId: p.id });
        hunterLookup = { at: new Date().toISOString(), suggestion, reason: reason || null, failed: Boolean(failed) };
      }
      if (hunterLookup) {
        const s = hunterLookup.suggestion;
        note('Kontakt (Hunter.io)', Boolean(s), s ? `Vorschlag ${s.email} (${s.confidence} %)` : hunterLookup.reason);
        const rule = result.rules.find((r) => r.key === 'contact');
        if (s && rule) rule.text = `${rule.level === 'ok' ? `${rule.text} · ` : ''}Vorschlag Hunter.io: ${s.email} (${s.confidence} %) – bitte prüfen`;
        if (s && rule && !rule.evidence_url) rule.evidence_url = s.evidenceUrl;
      }
    }

    // 4. Hotels abgleichen bzw. als Hotel-Meldung anlegen
    const hotelLog = await matchHotels(p, x.hotels, note);

    // 5. Profil des Entwurfs mit belegten Angaben füllen (nur leere Felder; beim ersten Lauf auch die Vorgabe „coach“)
    await fillProfile(p, x);
    // 5b. Kontakt (auch bei freigegebenen Anbietern, nur leere Felder) – danach zählt der Kontakt im Profil für die Regel
    await fillContact(p, x);
    const fresh = await db.one('SELECT contact_email, contact_phone, contact_evidence FROM camp_providers WHERE id = $1', [p.id]);
    result.rules = withProfileContact(result.rules, fresh);
    result.qualification = qualificationOf(result.rules);

    await db.query(
      `UPDATE camp_providers SET check_status = 'done', qualification = $2, check_report = $3, checked_at = now(), updated_at = now() WHERE id = $1`,
      [p.id, result.qualification, JSON.stringify({ rules: result.rules, completeness: result.completeness, log, hotels: hotelLog, extracted: x, pages: pages.length, hunter: hunterLookup })]
    );
    await require('../lib/audit').logAction(null, 'camp_provider', p.id, 'camp_check', { qualification: result.qualification, completeness: result.completeness });
  } catch (err) {
    note('Prüfung', false, err.message);
    await db.query(`UPDATE camp_providers SET check_status = 'failed', check_report = jsonb_set(check_report, '{log}', $2::jsonb), updated_at = now() WHERE id = $1`,
      [p.id, JSON.stringify(log)]);
    console.error('[camp-check]', p.id, err.message);
  }
}

// Genannte Hotels: gleicher Name im Ranking → verknüpfen (vorausgewählt, Admin kann entfernen); ähnlicher Name → freie Zeile
// mit Vorschlag; unbekannt → Hotel-Meldung anlegen (normaler Hotel-Ablauf, Admin gibt frei, danach automatisch verknüpft)
async function matchHotels(p, hotels, note) {
  const camps = require('./camps');
  const out = [];
  if (!hotels.length) return out;
  const options = await camps.entityOptions(p.site_id);
  const rows = await db.many('SELECT * FROM camp_provider_hotels WHERE provider_id = $1', [p.id]);
  const ranking = await require('./rankings').getDefaultRanking(p.site_id);
  let order = rows.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  for (const h of hotels) {
    const hit = camps.suggestEntity({ hotel_name: h.name, place: h.place }, options);
    if (hit && rows.some((r) => r.entity_id === hit.entity.id)) {
      out.push({ name: h.name, result: 'linked', entity: hit.entity.name });
      continue;
    }
    if (hit && hit.exact) {
      await db.query(
        `INSERT INTO camp_provider_hotels (provider_id, entity_id, hotel_name, place, sort_order, evidence_url, evidence_text) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.id, hit.entity.id, hit.entity.name, hit.entity.city || h.place, order++, h.evidence_url, h.evidence_text]);
      out.push({ name: h.name, result: 'linked', entity: hit.entity.name });
      continue;
    }
    // freie Zeile (gibt es sie schon, nicht doppelt anlegen)
    let row = rows.find((r) => !r.entity_id && r.hotel_name.toLowerCase() === h.name.toLowerCase());
    if (!row) {
      row = await db.one(
        `INSERT INTO camp_provider_hotels (provider_id, hotel_name, place, sort_order, evidence_url, evidence_text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [p.id, h.name, h.place, order++, h.evidence_url, h.evidence_text]);
    }
    if (hit) {
      out.push({ name: h.name, result: 'suggested', entity: hit.entity.name });
      continue;
    }
    if (row.submission_id) {
      out.push({ name: h.name, result: 'submitted', submission: row.submission_id });
      continue;
    }
    if (p.hotel_submissions === false) {
      out.push({ name: h.name, result: 'skipped', reason: 'Hotel-Meldungen für diesen Anbieter ausgeschaltet' });
      continue;
    }
    const sub = ranking && (await createHotelSubmission(p, h, ranking, note));
    if (sub) {
      await db.query('UPDATE camp_provider_hotels SET submission_id = $2 WHERE id = $1', [row.id, sub.id]);
      out.push({ name: h.name, result: 'submitted', submission: sub.id, website: sub.website || null });
    } else {
      out.push({ name: h.name, result: 'skipped', reason: ranking ? 'Land unbekannt' : 'kein Standard-Ranking' });
    }
  }
  note('Hotels', true, out.map((o) => `${o.name}: ${{ linked: 'verknüpft', suggested: 'Vorschlag', submitted: 'als Hotel-Meldung angelegt', skipped: `übersprungen (${o.reason})` }[o.result]}`).join(' · '));
  return out;
}

// Hotel-Meldung aus der Camp-Prüfung: Website von der Anbieterseite, sonst aus OpenStreetMap, sonst ohne (Admin ergänzt)
async function createHotelSubmission(p, h, ranking, note) {
  if (!h.country) return null;
  // schon als offene Meldung vorhanden (z. B. von einem anderen Anbieter genannt)?
  const open = await db.one(
    `SELECT * FROM submissions WHERE ranking_id = $1 AND lower(entity_name) = lower($2) AND status NOT IN ('rejected', 'expired', 'duplicate') ORDER BY created_at LIMIT 1`,
    [ranking.id, h.name]);
  if (open) return open;
  let website = h.website;
  let source = website ? 'Link auf der Anbieterseite' : null;
  if (!website) {
    try {
      const osm = await require('./geo').findWebsite({ name: h.name, city: h.place, country: h.country });
      if (osm) {
        website = osm.website;
        source = `OpenStreetMap (${osm.osmUrl})`;
      }
    } catch (err) {
      note('Hotel-Website', false, `${h.name}: OpenStreetMap nicht erreichbar (${err.message})`);
    }
  }
  const submissions = require('./submissions');
  return submissions.create(ranking, {
    name: h.name, city: h.place || '', country: h.country, website: website || null,
    notes: `Aus der Camp-Prüfung von „${p.name}“: ${h.evidence_text} (${h.evidence_url}). Website: ${source || 'nicht gefunden – bitte in den Stammdaten eintragen'}.`,
    sourceCampProviderId: p.id,
  }, { adminId: p.created_by || (await db.one('SELECT id FROM admin_users ORDER BY created_at LIMIT 1')).id });
}

// Kontakt-E-Mail und Telefon von der Website (mit Fundstelle) in leere Felder übernehmen
async function fillContact(p, x) {
  if (!x.contact || (!x.contact.email && !x.contact.phone)) return;
  await db.query(
    `UPDATE camp_providers SET
       contact_email = COALESCE(contact_email, $2), contact_phone = COALESCE(contact_phone, $3),
       contact_source = CASE WHEN contact_email IS NULL AND contact_phone IS NULL THEN 'website' ELSE contact_source END,
       contact_evidence = CASE WHEN contact_email IS NULL AND contact_phone IS NULL THEN $4 ELSE contact_evidence END
     WHERE id = $1`,
    [p.id, x.contact.email || null, x.contact.phone || null, x.contact.evidence_url]
  );
}

// Nach Änderungen am Profil (Kontakt eingetragen): gespeicherte Regeln und Ampel neu bewerten, ohne neue Prüfung
async function requalify(providerId) {
  const p = await db.one('SELECT id, check_report, contact_email, contact_phone, contact_evidence FROM camp_providers WHERE id = $1', [providerId]);
  const rules = (p && p.check_report && p.check_report.rules) || [];
  if (!rules.length) return null;
  const next = withProfileContact(rules, p);
  const qualification = qualificationOf(next);
  await db.query(`UPDATE camp_providers SET check_report = jsonb_set(check_report, '{rules}', $2::jsonb), qualification = $3 WHERE id = $1`,
    [p.id, JSON.stringify(next), qualification]);
  return qualification;
}

// Belegte Angaben in leere Profilfelder des Entwurfs übernehmen (Admin-Eingaben werden nie überschrieben)
async function fillProfile(p, x) {
  if (p.status !== 'draft') return;
  // Vorgabe „coach“ ersetzen, solange noch keine Prüfung selbst einen Typ ermittelt hat (auch nach abgebrochenem Lauf)
  const firstRun = !(((p.check_report || {}).extracted || {}).model);
  const features = { ...(p.features || {}) };
  for (const [k, v] of Object.entries(x.features)) {
    if (!v) continue;
    const empty = features[k] === undefined || features[k] === null || features[k] === 'unknown' || features[k] === '';
    if (empty) features[k] = v.value;
  }
  await db.query(
    `UPDATE camp_providers SET
       model = CASE WHEN $2::text IS NOT NULL AND ($9 OR model IS NULL) THEN $2 ELSE model END,
       seat = COALESCE(seat, $3), summary = COALESCE(summary, $4),
       destinations = CASE WHEN cardinality(destinations) = 0 THEN $5 ELSE destinations END,
       features = $6,
       prices = CASE WHEN jsonb_array_length(prices) = 0 THEN $7 ELSE prices END,
       as_of = COALESCE(as_of, current_date), source_url = COALESCE(source_url, $8)
     WHERE id = $1`,
    [p.id, x.model, x.seat, x.summary, x.destinations.map((d) => d.name), JSON.stringify(features),
      JSON.stringify(x.prices.map(({ label, duration, price, included }) => ({ label, duration, price, included }))), p.website, firstRun]
  );
}

module.exports = { QUALIFICATION, RULES, sanitize, qualify, qualificationOf, withProfileContact, requalify, upcomingDates, evidenceOk, fromItems, extractCamp, setEnqueue, queue, run, matchHotels, fillProfile, fillContact };
