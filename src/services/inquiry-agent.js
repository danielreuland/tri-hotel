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

function fallbackDraft({ entity, ranking, criteria, language, brand, askPhotos, persona }) {
  const t = T[language] || T.de;
  return {
    subject: t.subject(entity),
    body: t.body(entity, ranking, brand, askPhotos, personaOr(persona, brand).name),
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

function sanitizeBody(draft, { entity, ranking, criteria, language, brand, askPhotos, persona }) {
  const fb = fallbackDraft({ entity, ranking, criteria, language, brand, askPhotos, persona });
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

  return { subject, body, questions, usedFallback: false };
}

async function draftAnthropic(ctx) {
  const { z } = require('zod');
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const { entity, ranking, criteria, facts, language, brand, adminNote, askPhotos, persona } = ctx;
  const signer = personaOr(persona, brand).name;

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
  });

  const lines = criteria.map((c) => {
    const f = facts[c.id];
    const known = f ? `bisher: ${JSON.stringify(f.value)} (Vertrauensstufe ${f.trust_level}${f.disputed ? ', strittig' : ''})` : 'bisher: unbekannt';
    const opts = answerOptions(c).map((o) => `"${o.value}" = ${o.text}`).join('; ');
    return `- ${c.code}: ${c.label}. Antwortwerte: ${opts}. ${known}`;
  });

  const prompt = `Du schreibst im Auftrag von ${brand} eine sachliche Anfrage an den Betreiber von „${entity.name}“ (${entity.city || ''}, ${entity.country || ''}).
${brand} ist eine unabhängige Übersicht „${ranking.name}“. Ziel: unklare Angaben im Profil vom Betreiber bestätigen lassen.

Sprache von Mail und Fragen: ${language === 'de' ? 'Deutsch (Sie-Form)' : 'Englisch'}.

Unklare Punkte:
${lines.length ? lines.join('\n') : '(keine – es geht nur um Fotos)'}
${adminNote ? `\nHinweis der Redaktion: ${adminNote}\n` : ''}
Anforderungen:
- body: höflich, kurz (max. 150 Wörter), keine Werbung, keine Angebote, keine Preise, keine Versprechen zur Platzierung.
- Erkläre in einem Satz, warum wir fragen, und dass die Antworten als „vom Betreiber bestätigt“ gekennzeichnet werden.
- Der persönliche Antwortlink steht im body genau als ${LINK} auf einer eigenen Zeile. Keine anderen Links oder URLs.
${askPhotos ? '- Bitte zusätzlich höflich um Fotos des Hauses mit Nutzungserlaubnis, die über denselben Link hochgeladen werden können; sie erscheinen mit Urhebervermerk auf dem Profil. Keine Pflicht.\n' : ''}- Erwähne, dass man auch einfach auf die Mail antworten kann. Unterschreibe nur mit dem Vornamen „${signer}“. Einen Hinweis auf KI fügen wir selbst an, schreibe keinen.
- Gib dich nicht als Mensch aus und behaupte keine persönlichen Erfahrungen.
- questions: je Punkt eine verständliche Frage in Alltagssprache des Betreibers; options mit genau den angegebenen Antwortwerten (value unverändert), text als kurze Übersetzung/Umschreibung.`;

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

module.exports = { draftInquiry, sanitizeDraft, fallbackDraft, answerOptions, isAskable, unclearCriteria, toFactValue, languageFor, LINK };
