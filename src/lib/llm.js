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

// Listenpreise in US-Dollar je 1 Mio. Tokens (Ein-/Ausgabe, optional cacheRead) – genaue Modell-ID vor Modellfamilie.
// Stand 11.11.2026 laut Anthropic-Preisliste; bei neuen Modellen hier nachtragen oder per LLM_PRICES überschreiben.
// Die Familienwerte gelten nur für ältere Modelle ohne eigenen Eintrag (z. B. Sonnet 4.6, Opus 5, Haiku 4.5).
const DEFAULT_PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
};
const CACHE_READ_FACTOR = 0.1;
const WEB_SEARCH_USD = 0.01;
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
  const tokens = p
    ? (u.input * p.input + u.cacheRead * (p.cacheRead ?? p.input * CACHE_READ_FACTOR) + u.cacheWrite * p.input * CACHE_WRITE_FACTOR + u.output * p.output) / 1e6
    : 0;
  // Websuche der API: 10 US-Dollar je 1000 Suchanfragen, zusätzlich zu den Tokens
  const searches = (usage && usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
  const usd = tokens + searches * WEB_SEARCH_USD;
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

// KI-Monatsbudget in US-Dollar: Wert aus dem Admin (app_settings, Einstellungen → KI-Budget), sonst aus der .env
// (LLM_MONTHLY_BUDGET_USD). null = kein Limit. Grenzen für die Eingabe im Admin: BUDGET_MIN bis BUDGET_MAX.
const BUDGET_KEY = 'llm_monthly_budget_usd';
const BUDGET_MIN = 1;
const BUDGET_MAX = 500;

// Eingabe aus dem Admin prüfen ("30", "30,5") -> Zahl mit zwei Nachkommastellen oder null (ungültig)
function parseBudget(input) {
  const n = Number(String(input === undefined || input === null ? '' : input).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < BUDGET_MIN || n > BUDGET_MAX) return null;
  return Math.round(n * 100) / 100;
}

// Gespeicherter Wert vor dem Wert aus der .env; ein unbrauchbarer gespeicherter Wert zählt nicht
function resolveBudget(stored, envValue) {
  const fromAdmin = parseBudget(stored);
  return fromAdmin !== null ? { usd: fromAdmin, source: 'admin' } : { usd: envValue || null, source: 'env' };
}

async function budget() {
  const db = require('../db');
  let stored = null;
  try {
    const row = await db.one('SELECT value FROM app_settings WHERE key = $1', [BUDGET_KEY]);
    stored = row ? row.value : null;
  } catch (err) {
    console.error('[llm] Budget-Einstellung nicht lesbar, nutze .env:', err.message);
  }
  return resolveBudget(stored, config.llm.monthlyBudgetUsd);
}

async function setBudget(input, adminId) {
  const usd = parseBudget(input);
  if (usd === null) throw new Error(`Bitte einen Betrag zwischen ${BUDGET_MIN} und ${BUDGET_MAX} $ angeben.`);
  const db = require('../db');
  const before = await budget();
  await db.query(
    `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`, [BUDGET_KEY, JSON.stringify(usd), adminId || null]);
  return { usd, before: before.usd };
}

async function monthSpend() {
  const db = require('../db');
  const row = await db.one(`SELECT COALESCE(SUM(cost_usd), 0)::float AS usd, COUNT(*)::int AS calls FROM llm_usage WHERE created_at >= date_trunc('month', now())`);
  const b = await budget();
  return { usd: row.usd, calls: row.calls, budget: b.usd, budgetSource: b.source };
}

class BudgetError extends Error {}

// Vor jedem Aufruf: Monatsbudget erreicht -> kein Aufruf
async function assertBudget() {
  const s = await monthSpend();
  if (!s.budget) return;
  if (s.usd >= s.budget) {
    throw new BudgetError(`KI-Monatsbudget erreicht (${s.usd.toFixed(2)} von ${s.budget.toFixed(2)} $) – Aufruf übersprungen.`);
  }
}

function formatTokens(c) {
  const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} Tsd.` : String(n));
  return `${k(c.input + c.cacheRead + c.cacheWrite)} Tokens ein, ${k(c.output)} aus, ca. ${c.usd.toFixed(2).replace('.', ',')} $`;
}

module.exports = { anthropic, modelFor, priceFor, costOf, record, monthSpend, assertBudget, BudgetError, budget, setBudget, parseBudget, resolveBudget, BUDGET_MIN, BUDGET_MAX, formatTokens, DEFAULT_PRICES };
