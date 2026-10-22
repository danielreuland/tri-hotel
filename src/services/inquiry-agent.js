// Agent für Betreiber-Anfragen: formuliert Mail und Fragen zu unklaren Werten.
// Anbieter wie beim Extraktor über LLM_PROVIDER ('anthropic' | 'none' = feste Vorlage).
//
// Leitplanken (werden unabhängig vom Modell im Code durchgesetzt):
// - nur die vom Admin gewählten Kriterien, nur gültige Antwortwerte aus dem Punkteschema
// - genau ein Link: der persönliche Antwortlink ({{LINK}}), keine anderen URLs
// - keine Werbung: die Mail ist eine reine Faktenanfrage
// - Absender ist eine virtuelle Mitarbeiterin/ein virtueller Mitarbeiter (Persona); der KI-Hinweis
//   wird immer im Code angehängt (Transparenzpflicht, EU AI Act Art. 50)
const config = require('../config');
const consents = require('../lib/consents');
const aimail = require('./aimail');

const LINK = '{{LINK}}';
const GERMAN_SPEAKING = ['DE', 'AT', 'CH', 'LI', 'LU'];

function languageFor(country) {
  return GERMAN_SPEAKING.includes(String(country || '').toUpperCase()) ? 'de' : 'en';
}

// Gültige Antwortwerte je Kriterium (Formularwert -> gespeicherter Wert)
function answerOptions(c) {
  const s = c.scoring || {};
  if (s.type === 'option') return Object.keys(s.points || {}).map((k) => ({ value: k, text: (s.labels && s.labels[k]) || k }));
  if (s.type === 'bool') return [{ value: 'true', text: 'ja' }, { value: 'false', text: 'nein' }];
  return null; // rating (Admin-Einstufung) und climate (Klimadaten) fragt man den Betreiber nicht
}

function isAskable(c) {
  return Boolean(answerOptions(c));
}

// Kriterien, die man beim Betreiber nachfragen sollte: unbekannt, strittig oder nur automatisch ermittelt
function unclearCriteria(criteria, facts) {
  const byCrit = new Map(facts.map((f) => [f.criterion_id, f]));
  return criteria.filter((c) => {
    if (!isAskable(c)) return false;
    const f = byCrit.get(c.id);
    return !f || f.disputed || f.trust_level === 4;
  });
}

function toFactValue(c, raw) {
  const v = String(raw || '');
  if (c.scoring.type === 'bool') return v === 'true' ? { bool: true } : v === 'false' ? { bool: false } : null;
  return Object.prototype.hasOwnProperty.call(c.scoring.points || {}, v) ? { option: v } : null;
}

const T = {
  de: {
    subject: (e) => `Kurze Rückfrage zu Ihrem Profil: ${e.name}`,
    body: (e, r, brand, photos, signer) => `Sehr geehrte Damen und Herren,

${brand} ist eine unabhängige Übersicht über ${r.entity_label_pl}, bewertet nach geprüften Fakten. ${e.name} ist bei uns erfasst. Damit Ihr Profil vollständig und korrekt ist, haben wir ein paar kurze Fragen zu Ihrem Angebot.

Die Beantwortung dauert etwa zwei Minuten:
${LINK}
${photos ? `
Über denselben Link können Sie uns auch gern Fotos Ihres Hauses mit Nutzungserlaubnis senden. Wir zeigen sie mit Ihrem Urhebervermerk auf Ihrem Profil.
` : ''}
Ihre Angaben werden auf Ihrem Profil als „vom ${r.entity_label_sg} bestätigt“ gekennzeichnet. Der Eintrag ist kostenlos; die Platzierung lässt sich nicht kaufen.

Sie können auch einfach auf diese Mail antworten.

Mit freundlichen Grüßen
${signer}`,
    yes: 'ja', no: 'nein',
  },
  en: {
    subject: (e) => `Quick question about your profile: ${e.name}`,
    body: (e, r, brand, photos, signer) => `Dear Sir or Madam,

${brand} is an independent overview of ${r.entity_label_pl.toLowerCase()} for athletes, rated on verified facts. ${e.name} is listed with us. To make sure your profile is complete and correct, we have a few short questions about your facilities.

Answering takes about two minutes:
${LINK}
${photos ? `
Using the same link, you are welcome to send us photos of your property along with permission to use them. We will show them on your profile with your photo credit.
` : ''}
Your answers will be marked on your profile as confirmed by you. The listing is free of charge; rankings cannot be bought.

You are also welcome to simply reply to this email.

Kind regards
${signer}`,
    yes: 'yes', no: 'no',
  },
};

function personaOr(persona, brand) {
  return persona || { name: `${brand}`, title: 'KI-Assistenz' };
}

// ---------- Bekannte Angaben bestätigen lassen ----------
// confirm = { criteria: [Kriterium], features: [Leistung, schon erfasst], offer: [Leistung, „Bieten Sie außerdem …?“] }
// In der Mail steht nur die Anzahl (criteria + features); die Liste steht im Antwortformular.

function confirmCount(confirm) {
  return confirm ? (confirm.criteria || []).length + (confirm.features || []).length : 0;
}

// Antwortwert eines Fakts in Formular-Schreibweise (wie answerOptions) bzw. null
function formValue(c, value) {
  if (!value) return null;
  if (c.scoring.type === 'bool') return typeof value.bool === 'boolean' ? String(value.bool) : null;
  // mehrere Ausprägungen lassen sich im Antwortformular (eine Auswahl) nicht bestätigen, ohne welche zu verlieren
  if (Array.isArray(value.options) && value.options.length > 1) return null;
  return value.option && Object.prototype.hasOwnProperty.call(c.scoring.points || {}, value.option) ? value.option : null;
}

// Bestätigungsliste ohne KI: Bezeichnungen aus dem Ranking und dem Leistungskatalog
function fallbackConfirmations(confirm, facts = {}, language = 'de') {
  if (!confirmCount(confirm) && !(confirm && (confirm.offer || []).length)) return {};
  const t = T[language] || T.de;
  const optionsOf = (c) => answerOptions(c).map((o) => ({
    value: o.value, text: c.scoring.type === 'bool' ? (o.value === 'true' ? t.yes : t.no) : o.text,
  }));
  const criteria = (confirm.criteria || []).map((c) => {
    const f = facts[c.id];
    const current = f ? formValue(c, f.value) : null;
    if (!current) return null;
    const options = optionsOf(c);
    return { criterion_id: c.id, label: c.label, current, current_text: options.find((o) => o.value === current).text, options };
  }).filter(Boolean);
  const features = [
    ...(confirm.features || []).map((ft) => ({ feature_id: ft.id, text: ft.label, known: true })),
    ...(confirm.offer || []).map((ft) => ({ feature_id: ft.id, text: ft.label, known: false })),
  ];
  return { criteria, features };
}

// Formular auswerten: k_<id> = ok | wrong | unknown (bei wrong: kv_<id> = richtiger Wert),
// Leistungen nur, wenn „Liste geprüft“ (features_checked) angehakt ist; f_<id> = bietet an
function parseConfirmAnswers(confirmations, body, criteria) {
  const out = { criteria: [], features: [], incomplete: [] };
  const byId = new Map(criteria.map((c) => [c.id, c]));
  for (const item of (confirmations && confirmations.criteria) || []) {
    const c = byId.get(item.criterion_id);
    if (!c) continue;
    const choice = body[`k_${item.criterion_id}`];
    const previous = toFactValue(c, item.current);
    let value = null;
    if (choice === 'ok') value = previous;
    else if (choice === 'wrong') value = toFactValue(c, body[`kv_${item.criterion_id}`]);
    if (choice === 'wrong' && !value) out.incomplete.push(item.label);
    if (!value) continue;
    out.criteria.push({ criterionId: c.id, value, previous, comment: String(body[`kc_${item.criterion_id}`] || '').trim().slice(0, 500) || null });
  }
  const features = (confirmations && confirmations.features) || [];
  const checked = body.features_checked === 'on';
  for (const ft of features) {
    const ticked = body[`f_${ft.feature_id}`] === 'on';
    // erfasste Leistungen zählen nur nach „Liste geprüft“; zusätzliche nur, wenn angehakt
    if (ft.known && checked) out.features.push({ featureId: ft.feature_id, offered: ticked, known: true });
    if (!ft.known && ticked) out.features.push({ featureId: ft.feature_id, offered: true, known: false });
  }
  return out;
}

// Werte für die Platzhalter im Mustertext (services/aimail.js)
function templateVars({ entity, ranking, brand, persona, language, confirm }) {
  return {
    anzahl: confirmCount(confirm),
    marke: brand, objekt: entity.name, objekt_art: ranking.entity_label_sg, name: personaOr(persona, brand).name,
    objekte: language === 'en' ? String(ranking.entity_label_pl || '').toLowerCase() : ranking.entity_label_pl,
  };
}

// Ohne KI: Mustertext des Anlasses (template) wörtlich ausgefüllt, sonst die eingebaute Vorlage
function fallbackDraft({ entity, ranking, criteria, language, brand, askPhotos, persona, template, confirm, facts }) {
  const t = T[language] || T.de;
  const vars = template ? templateVars({ entity, ranking, brand, persona, language, confirm }) : null;
  return {
    subject: template ? aimail.fill(template.subject, vars).slice(0, 150) : t.subject(entity),
    body: template ? aimail.fill(template.body, vars, { fotos: askPhotos, bestaetigen: confirmCount(confirm) > 0 }) : t.body(entity, ranking, brand, askPhotos, personaOr(persona, brand).name),
    confirmations: fallbackConfirmations(confirm, facts, language),
    questions: criteria.map((c) => ({
      criterion_id: c.id,
      question: c.label,
      options: answerOptions(c).map((o) => ({
        value: o.value,
        text: c.scoring.type === 'bool' ? (o.value === 'true' ? t.yes : t.no) : o.text,
      })),
    })),
  };
}

// Prüft und repariert den Entwurf des Modells. Fehlt etwas, kommt es aus der Vorlage.
function withDisclosure(body, language, persona, brand) {
  return `${body.trim()}\n\n--\n${consents.aiDisclosure(language, personaOr(persona, brand), brand)}`;
}

function sanitizeDraft(draft, ctx) {
  const out = sanitizeBody(draft, ctx);
  return { ...out, body: withDisclosure(out.body, ctx.language, ctx.persona, ctx.brand) };
}

function sanitizeBody(draft, { entity, ranking, criteria, language, brand, askPhotos, persona, template, confirm, facts }) {
  const fb = fallbackDraft({ entity, ranking, criteria, language, brand, askPhotos, persona, template, confirm, facts });
  if (!draft || typeof draft !== 'object') return { ...fb, usedFallback: true };

  let body = String(draft.body || '').trim();
  const urls = body.replace(LINK, '').match(/https?:\/\/|www\./gi);
  const tooShort = body.length < 80 || body.length > 3000;
  if (urls || tooShort) body = fb.body;
  if (!body.includes(LINK)) body = `${body}\n\n${LINK}`;

  const subject = String(draft.subject || '').trim().slice(0, 150) || fb.subject;

  const byCode = new Map(criteria.map((c) => [c.code, c]));
  const questions = criteria.map((c) => {
    const fromModel = (draft.questions || []).find((q) => byCode.get(q.criterion_code) === c);
    const valid = answerOptions(c).map((o) => o.value);
    const fallbackQ = fb.questions.find((q) => q.criterion_id === c.id);
    if (!fromModel || !String(fromModel.question || '').trim()) return fallbackQ;
    // Optionen: nur gültige Werte, jeder Wert genau einmal; fehlende Texte aus der Vorlage
    const options = valid.map((value) => {
      const m = (fromModel.options || []).find((o) => String(o.value) === value);
      const text = m && String(m.text || '').trim();
      return { value, text: text ? text.slice(0, 200) : fallbackQ.options.find((o) => o.value === value).text };
    });
    return { criterion_id: c.id, question: String(fromModel.question).trim().slice(0, 300), options };
  });

  return { subject, body, questions, confirmations: translateConfirmations(fb.confirmations, draft, criteria, confirm), usedFallback: false };
}

// Übersetzte Bezeichnungen des Modells in die Bestätigungsliste übernehmen; Werte und Auswahl bleiben aus dem System
function translateConfirmations(base, draft, criteria, confirm) {
  if (!base || (!(base.criteria || []).length && !(base.features || []).length)) return base || {};
  const clean = (v, max) => { const s = String(v || '').trim(); return s ? s.slice(0, max) : null; };
  const crits = new Map(((confirm && confirm.criteria) || []).map((c) => [c.code, c.id]));
  const feats = new Map([...((confirm && confirm.features) || []), ...((confirm && confirm.offer) || [])].map((f) => [f.code, f.id]));
  const items = new Map((draft.confirm_items || []).map((i) => [crits.get(i.criterion_code), i]));
  const ftexts = new Map((draft.feature_items || []).map((i) => [feats.get(i.code), clean(i.text, 120)]));
  return {
    criteria: base.criteria.map((it) => {
      const m = items.get(it.criterion_id);
      if (!m) return it;
      const options = it.options.map((o) => {
        const mo = (m.options || []).find((x) => String(x.value) === o.value);
        return { value: o.value, text: (mo && clean(mo.text, 200)) || o.text };
      });
      return { ...it, label: clean(m.label, 200) || it.label, options, current_text: options.find((o) => o.value === it.current).text };
    }),
    features: base.features.map((ft) => ({ ...ft, text: ftexts.get(ft.feature_id) || ft.text })),
  };
}

// Prompt = feste Regeln + Rolle & Stil der Persona + Mustertext/Pflichtpunkte des Anlasses + Angaben + Stilbeispiel.
// ctx.template: { subject, body, must } aus aimail.get(); ctx.example: { subject, body } oder null
function buildPrompt(ctx) {
  const { entity, ranking, criteria, facts = {}, language, brand, adminNote, askPhotos, persona, template, example, confirm } = ctx;
  const p = personaOr(persona, brand);
  const vars = templateVars({ entity, ranking, brand, persona, language, confirm });
  const nConfirm = confirmCount(confirm);
  const fbConfirm = fallbackConfirmations(confirm, facts, language);
  const confirmLines = [
    ...(fbConfirm.criteria || []).map((it) => `- ${(confirm.criteria.find((c) => c.id === it.criterion_id) || {}).code}: ${it.label}. Antwortwerte: ${it.options.map((o) => `"${o.value}" = ${o.text}`).join('; ')}`),
  ];
  const featureLines = [...((confirm && confirm.features) || []), ...((confirm && confirm.offer) || [])].map((ft) => `- ${ft.code}: ${ft.label}`);
  const lines = criteria.map((c) => {
    const f = facts[c.id];
    const known = f ? `bisher: ${JSON.stringify(f.value)} (Vertrauensstufe ${f.trust_level}${f.disputed ? ', strittig' : ''})` : 'bisher: unbekannt';
    const opts = answerOptions(c).map((o) => `"${o.value}" = ${o.text}`).join('; ');
    return `- ${c.code}: ${c.label}. Antwortwerte: ${opts}. ${known}`;
  });
  const must = template ? aimail.mustList(template.must) : [];
  const parts = [
    `Du bist ${p.name}${p.title ? `, ${p.title}` : ''} bei ${brand}, einer unabhängigen Übersicht „${ranking.name}“.`,
    persona && persona.style ? `Rolle und Stil:\n${persona.style.trim()}` : null,
    `Aufgabe: eine Mail an den Betreiber von „${entity.name}“ (${entity.city || ''}, ${entity.country || ''}), damit unklare Angaben im Profil vom Betreiber bestätigt werden.
Sprache von Mail und Fragen: ${language === 'de' ? 'Deutsch (Sie-Form)' : 'Englisch'}.`,
    `Unklare Punkte:\n${lines.length ? lines.join('\n') : nConfirm ? '(keine – es geht um die Bestätigung bekannter Angaben)' : '(keine – es geht nur um Fotos)'}`,
    nConfirm ? `Außerdem bitten wir, ${nConfirm} bereits erfasste Angaben kurz zu prüfen. In der Mail nur die Anzahl in einem Satz nennen, nichts aufzählen – die Liste steht im Antwortformular.` : null,
    adminNote ? `Hinweis der Redaktion: ${adminNote}` : null,
    template ? `Mustertext – Aufbau und Inhalte übernehmen, Formulierung im Stil der Rolle (${LINK} unverändert lassen):
"""
Betreff: ${aimail.fill(template.subject, vars)}

${aimail.fill(template.body, vars, { fotos: askPhotos, bestaetigen: nConfirm > 0 })}
"""` : null,
    must.length ? `Pflichtpunkte (müssen inhaltlich vorkommen):\n${must.map((m) => `- ${m}`).join('\n')}` : null,
    example ? `Stilbeispiel – eine frühere Mail, die die Redaktion überarbeitet hat. Übernimm Ton, Länge und Aufbau, keine Inhalte:
"""
Betreff: ${example.subject}

${example.body}
"""` : null,
    `Feste Regeln:\n${aimail.rules({ askPhotos }).map((r) => `- ${r}`).join('\n')}
- Unterschrift: „${p.name}“.
- questions: je Punkt eine verständliche Frage in Alltagssprache des Betreibers; options mit genau den angegebenen Antwortwerten (value unverändert), text als kurze Übersetzung/Umschreibung.${confirmLines.length || featureLines.length ? `\n- confirm_items und feature_items: nur kurze Bezeichnungen in der Sprache der Mail (für die Liste im Formular), Werte unverändert.` : ''}`,
    confirmLines.length ? `Bekannte Angaben zum Bestätigen (confirm_items: label = kurze Bezeichnung, options mit genau diesen Antwortwerten):\n${confirmLines.join('\n')}` : null,
    featureLines.length ? `Leistungen für die Liste im Formular (feature_items: code unverändert, text = kurze Bezeichnung):\n${featureLines.join('\n')}` : null,
  ];
  return parts.filter(Boolean).join('\n\n');
}

async function draftAnthropic(ctx) {
  const { z } = require('zod');
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const { criteria, confirm } = ctx;
  const confirmCodes = ((confirm && confirm.criteria) || []).map((c) => c.code);
  const featureCodes = [...((confirm && confirm.features) || []), ...((confirm && confirm.offer) || [])].map((f) => f.code);

  const Schema = z.object({
    subject: z.string(),
    body: z.string(),
    questions: z.array(
      z.object({
        criterion_code: criteria.length ? z.enum(criteria.map((c) => c.code)) : z.string(),
        question: z.string(),
        options: z.array(z.object({ value: z.string(), text: z.string() })),
      })
    ),
    confirm_items: z.array(z.object({
      criterion_code: confirmCodes.length ? z.enum(confirmCodes) : z.string(),
      label: z.string(),
      options: z.array(z.object({ value: z.string(), text: z.string() })),
    })),
    feature_items: z.array(z.object({ code: featureCodes.length ? z.enum(featureCodes) : z.string(), text: z.string() })),
  });

  const prompt = buildPrompt(ctx);

  const llm = require('../lib/llm');
  await llm.assertBudget();
  const response = await llm.anthropic().messages.parse(
    {
      model: llm.modelFor('inquiry'),
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(Schema) },
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    },
    { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } }
  );
  const usage = { model: response.model, raw: response.usage };
  if (response.stop_reason === 'refusal') return { draft: null, usage };
  return { draft: response.parsed_output || null, usage };
}

// Erstellt den Entwurf. Fehler beim Modell führen zur Vorlage, nie zum Abbruch.
async function draftInquiry(ctx) {
  const full = { ...ctx, language: ctx.language || languageFor(ctx.entity.country), brand: ctx.brand || config.baseHost };
  let draft = null;
  let usage = null;
  if (config.llm.provider === 'anthropic') {
    try {
      ({ draft, usage } = await draftAnthropic(full));
    } catch (err) {
      console.error('[inquiry-agent] Modell nicht erreichbar, nutze Vorlage:', err.message);
    }
  }
  return { language: full.language, ...sanitizeDraft(draft, full), usage };
}

module.exports = { draftInquiry, buildPrompt, templateVars, confirmCount, fallbackConfirmations, parseConfirmAnswers, formValue, sanitizeDraft, fallbackDraft, answerOptions, isAskable, unclearCriteria, toFactValue, languageFor, LINK };
