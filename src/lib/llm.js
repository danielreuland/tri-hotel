// Gemeinsamer Claude-Client für Extraktor und Anfrage-Agent,
// dazu Modellwahl je Aufgabe, Verbrauchsprotokoll (llm_usage) und Monatsbudget.
const config = require('../config');

let client = null;

function anthropic() {
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({
      apiKey: config.llm.apiKey,
      ...(config.llm.workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': config.llm.workspaceId } } : {}),
    });
  }
  return client;
}

// Modell je Aufgabe (extract | inquiry), per .env umstellbar
function modelFor(purpose) {
  return config.llm.models[purpose] || config.llm.models.extract;
}

// Listenpreise in US-Dollar je 1 Mio. Tokens (Ein-/Ausgabe) je Modellfamilie.
// Startwerte – bitte mit der Preisliste der Claude Console abgleichen; überschreibbar per LLM_PRICES.
const DEFAULT_PRICES = {
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
};
const CACHE_READ_FACTOR = 0.1;
const CACHE_WRITE_FACTOR = 1.25;

function priceFor(model, prices = { ...DEFAULT_PRICES, ...config.llm.prices }) {
  const m = String(model || '').toLowerCase();
  if (prices[m]) return prices[m];
  const family = Object.keys(prices).find((k) => m.includes(k));
  return family ? prices[family] : null;
}

// usage aus der API-Antwort -> Tokens und geschätzte Kosten
function costOf(model, usage, prices) {
  const u = {
    input: (usage && usage.input_tokens) || 0,
    output: (usage && usage.output_tokens) || 0,
    cacheRead: (usage && usage.cache_read_input_tokens) || 0,
    cacheWrite: (usage && usage.cache_creation_input_tokens) || 0,
  };
  const p = priceFor(model, prices);
  const usd = p
    ? (u.input * p.input + u.cacheRead * p.input * CACHE_READ_FACTOR + u.cacheWrite * p.input * CACHE_WRITE_FACTOR + u.output * p.output) / 1e6
    : 0;
  return { ...u, usd: Math.round(usd * 10000) / 10000, priced: Boolean(p) };
}

// Ein Aufruf -> eine Zeile in llm_usage. Fehler beim Protokollieren brechen nie die eigentliche Arbeit ab.
async function record({ purpose, model, usage, entityId = null, submissionId = null, inquiryId = null }) {
  const c = costOf(model, usage);
  try {
    const db = require('../db');
    await db.query(
      `INSERT INTO llm_usage (purpose, model, entity_id, submission_id, inquiry_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [purpose, model, entityId, submissionId, inquiryId, c.input, c.output, c.cacheRead, c.cacheWrite, c.usd]
    );
  } catch (err) {
    console.error('[llm] Verbrauch nicht gespeichert:', err.message);
  }
  return c;
}

async function monthSpend() {
  const db = require('../db');
  const row = await db.one(`SELECT COALESCE(SUM(cost_usd), 0)::float AS usd, COUNT(*)::int AS calls FROM llm_usage WHERE created_at >= date_trunc('month', now())`);
  return { usd: row.usd, calls: row.calls, budget: config.llm.monthlyBudgetUsd };
}

class BudgetError extends Error {}

// Vor jedem Aufruf: Monatsbudget (LLM_MONTHLY_BUDGET_USD) erreicht -> kein Aufruf
async function assertBudget() {
  if (!config.llm.monthlyBudgetUsd) return;
  const s = await monthSpend();
  if (s.usd >= s.budget) {
    throw new BudgetError(`KI-Monatsbudget erreicht (${s.usd.toFixed(2)} von ${s.budget.toFixed(2)} $) – Aufruf übersprungen.`);
  }
}

function formatTokens(c) {
  const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} Tsd.` : String(n));
  return `${k(c.input + c.cacheRead + c.cacheWrite)} Tokens ein, ${k(c.output)} aus, ca. ${c.usd.toFixed(2).replace('.', ',')} $`;
}

module.exports = { anthropic, modelFor, priceFor, costOf, record, monthSpend, assertBudget, BudgetError, formatTokens, DEFAULT_PRICES };
