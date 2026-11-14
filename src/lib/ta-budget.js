// Budget-Wächter für Tripadvisor (Terra): Regeln als reine Funktionen und der Wächter selbst mit austauschbarem
// Speicher und Abruf (für Tests ohne Datenbank und ohne Netz). Vorgaben: docs/tripadvisor-fotos-umsetzung.md.
//
// Gezählt wird in abrechenbaren Einheiten („billable entities“), nicht in HTTP-Aufrufen:
//   Fotos = 1 je Abruf · Suche (Name oder Umkreis) = 1 je zurückgegebener Location ID · Allowlist = 0.
// Nur erfolgreiche Antworten (2xx) kosten etwas. Die Einheiten werden VOR dem Abruf reserviert und danach auf den
// tatsächlichen Verbrauch korrigiert; bleibt die Antwort aus (Zeitüberschreitung), bleibt die Reservierung stehen –
// im Zweifel wird also zu viel gezählt, nie zu wenig.

const TZ = 'Europe/Berlin';
const BILLED = { photos: 'call', search: 'ids', nearby: 'ids' };

// Schlüssel der Zähler für einen Zeitpunkt (Kalendermonat und Tag nach Berliner Zeit, dazu die Lebensdauer des Kontos)
function periodKeys(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return { month: `m:${day.slice(0, 7)}`, day: `d:${day}`, total: 'total' };
}

// Einheiten, die vor dem Abruf reserviert werden (bei der Suche die Höchstzahl der Treffer)
function reservedUnits(endpoint, cfg) {
  if (BILLED[endpoint] === 'call') return 1;
  if (BILLED[endpoint] === 'ids') return cfg.searchSize;
  return 0;
}

// Tatsächlich abgerechnete Einheiten einer Antwort; null = unbekannt (dann bleibt die Reservierung stehen)
function billedUnits(endpoint, status, body) {
  if (!BILLED[endpoint]) return 0;
  if (!(status >= 200 && status < 300)) return 0;
  if (BILLED[endpoint] === 'call') return 1;
  return body && Array.isArray(body.data) ? body.data.length : null;
}

// Geschätzte Kosten des laufenden Monats: nur Einheiten jenseits des einmaligen Freikontingents kosten etwas
function estimateCostUsd({ total = 0, month = 0, freeUnits = 0, unitPriceUsd = 0 }) {
  const beforeMonth = Math.max(0, total - month);
  const freeLeftAtStart = Math.max(0, freeUnits - beforeMonth);
  const billable = Math.max(0, month - freeLeftAtStart);
  return Math.round(billable * unitPriceUsd * 100) / 100;
}

// Ampel: ab 80 % gelb, ab 100 % rot
function level(used, limit) {
  if (!(limit > 0)) return 'full';
  if (used >= limit) return 'full';
  return used >= limit * 0.8 ? 'warn' : 'ok';
}

// Zahlen für die Admin-Übersicht aus den Zählerständen
function summary(usage, cfg) {
  const total = (usage.total || 0) + (cfg.unitsOffset || 0);
  const month = usage.month || 0;
  const day = usage.day || 0;
  return {
    month, monthLimit: cfg.monthlyLimit, monthLevel: level(month, cfg.monthlyLimit),
    day, dayLimit: cfg.dailyLimit, dayLevel: level(day, cfg.dailyLimit),
    total, freeUnits: cfg.freeUnits, freeUsed: Math.min(total, cfg.freeUnits), freeLevel: level(total, cfg.freeUnits),
    costUsd: estimateCostUsd({ total, month, freeUnits: cfg.freeUnits, unitPriceUsd: cfg.unitPriceUsd }),
    maxCostUsd: Math.round(cfg.monthlyLimit * cfg.unitPriceUsd * 100) / 100,
  };
}

// Wächter: call(endpoint, { url, method, body, entityId }) → { ok, reason, status, data, units }
// store: reserve(keys, units, limits) → { ok, blocked: 'month' | 'day' } · adjust(keys, diff) · log(entry)
// reason: off (Not-Aus) | no_key | month_limit | day_limit | timeout | error | null
function createGuard({ cfg, store, fetchImpl = fetch, now = () => new Date() }) {
  const safe = async (label, fn) => {
    try { await fn(); } catch (err) { console.error(`[tripadvisor] ${label}: ${err.message}`); }
  };

  async function call(endpoint, { url, method = 'GET', body = null, entityId = null } = {}) {
    if (!cfg.enabled) return { ok: false, reason: 'off' };
    if (!cfg.apiKey) return { ok: false, reason: 'no_key' };
    const need = reservedUnits(endpoint, cfg);
    const keys = periodKeys(now());
    if (need > 0) {
      // Schlägt schon das Reservieren fehl (z. B. Datenbank), gibt es keinen Abruf: Fehler geht an den Aufrufer
      const r = await store.reserve(keys, need, { month: cfg.monthlyLimit, day: cfg.dailyLimit });
      if (!r.ok) {
        const reason = `${r.blocked}_limit`;
        await safe('log', () => store.log({ entityId, endpoint, units: 0, status: null, durationMs: null, outcome: reason }));
        return { ok: false, reason };
      }
    }
    const started = Date.now();
    let status = null;
    let data = null;
    let outcome = 'ok';
    try {
      // genau ein Versuch, keine Wiederholung
      const res = await fetchImpl(url, {
        method,
        headers: { 'X-API-Key': cfg.apiKey, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      status = res.status;
      data = await res.json().catch(() => null);
      if (!res.ok) outcome = 'error';
    } catch (err) {
      outcome = err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'timeout' : 'error';
    }
    const durationMs = Date.now() - started;
    // ohne Antwort ist unklar, ob Tripadvisor gezählt hat: Reservierung bleibt stehen
    const billed = status === null ? null : billedUnits(endpoint, status, data);
    const units = billed === null ? need : billed;
    if (units !== need) await safe('adjust', () => store.adjust(keys, units - need));
    await safe('log', () => store.log({ entityId, endpoint, units, status, durationMs, outcome }));
    const ok = outcome === 'ok';
    return { ok, reason: ok ? null : outcome, status, data: ok ? data : null, units };
  }

  return { call };
}

module.exports = { periodKeys, reservedUnits, billedUnits, estimateCostUsd, level, summary, createGuard, TZ };
