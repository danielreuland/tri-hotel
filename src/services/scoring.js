// Scoring-Logik für alle Rankings. Reine Funktionen ohne DB-Zugriff.
//
// Nichts hier ist Triathlon-spezifisch: Kriterien, Punkteschemata, Formel und
// Labels kommen aus der Datenbank (rankings, criteria). Neue Scoring-Typen nur
// als Erweiterung von pointsFor() + maxFromScoring() + validateCriterion(), mit Tests.
//
// Scoring-Typen (criteria.scoring.type):
//   option  {"points":{"<opt>":n,...},"ko":["<opt>"],"labels":{"<opt>":"Text"}}  Wert {"option":"<opt>"}
//           mit "multi":true Mehrfachauswahl: Wert {"option":"<beste>","options":["<opt>",...]}; es zählt die beste
//           Ausprägung (Ausprägungen mit 0 Punkten nur allein, z. B. „keines“). „option“ bleibt für alle Leser erhalten.
//   bool    {"points_true":n,"points_false":0}                                   Wert {"bool":true}
//   rating  {"min":0,"max":n}                                                     Wert {"number":x}
//   bands   {"bands":[{"min":a,"max":b,"points":n}]}                              Wert {"number":x}
//   climate {"metric":"avg_high_c"|"avg_low_c"|"rain_days","bands":[...]}         Wert aus climate_monthly
//   bonus   {"requires":["<code>",...],"points":n}                                kein eigener Wert: n Punkte, wenn alle
//           genannten Kriterien desselben Rankings vorhanden sind (Punkte > 0); eins sicher ohne Punkte → 0;
//           sonst (eins noch unbekannt) unbekannt
//
// Unbekannte Kriterien (formula.unknown_policy):
//   'ignore'  – zählen nicht (Score über die bekannten Punkte; belohnt Lücken – nur als Altverhalten)
//   'average' – zählen mit dem Durchschnittsanteil aller geprüften Objekte (opts.unknownShares[criterionId], 0–1)
//   'half'    – zählen mit der Hälfte der Punkte
// Die Vollständigkeit misst weiterhin nur die bekannten Werte.

const DEFAULT_FORMULA = {
  fact_weight: 0.6,
  athlete_weight: 0.4,
  bayes_c: 5,
  bayes_m: 70,
  min_completeness: 70,
  min_reviews: 3,
  recheck_months: 18,
  unknown_policy: 'ignore',
  athlete_enabled: false,      // Bewertungen fließen erst ein, wenn eingeschaltet
  review_age_weights: [[12, 1], [24, 0.7], [36, 0.4]], // [Monate, Gewicht]; älter = 0
  unknown_default_share: 0.5, // Ersatz, wenn für ein Kriterium noch kein Durchschnitt vorliegt
};

const CLIMATE_METRICS = ['avg_high_c', 'avg_low_c', 'rain_days'];

// Formel aus dem Admin prüfen (rein, testbar). Jeder bekannte Schlüssel hat seinen Typ; unbekannte Schlüssel müssen
// Zahlen sein (fängt Tippfehler ab). Rückgabe: Liste der Fehlermeldungen
const UNKNOWN_POLICIES = ['ignore', 'average', 'half'];
const BEST_TIME_METRICS = ['avg_high_c', 'avg_low_c', 'rain_days', 'sunshine_h', 'wind_kmh', 'windy_days', 'sea_c'];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function validateFormula(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return ['Formel ist kein gültiges JSON-Objekt.'];
  const errors = [];
  for (const [k, v] of Object.entries(f)) {
    if (k === 'athlete_enabled') {
      if (typeof v !== 'boolean') errors.push('Formel: „athlete_enabled“ muss true oder false sein.');
    } else if (k === 'unknown_policy') {
      if (!UNKNOWN_POLICIES.includes(v)) errors.push(`Formel: „unknown_policy“ muss ${UNKNOWN_POLICIES.map((x) => `"${x}"`).join(', ')} sein.`);
    } else if (k === 'review_age_weights') {
      if (!Array.isArray(v) || v.some((p) => !Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1]))) {
        errors.push('Formel: „review_age_weights“ muss eine Liste aus [Monate, Gewicht] sein.');
      }
    } else if (k === 'best_time') {
      const ok = v && typeof v === 'object' && !Array.isArray(v) && BEST_TIME_METRICS.includes(v.metric)
        && (v.min !== undefined || v.max !== undefined)
        && (v.min === undefined || isNum(v.min)) && (v.max === undefined || isNum(v.max))
        && (v.min === undefined || v.max === undefined || v.min <= v.max);
      if (!ok) errors.push(`Formel: „best_time“ braucht {"metric": ${BEST_TIME_METRICS.map((x) => `"${x}"`).join(' | ')}, "min": Zahl, "max": Zahl} (min oder max genügt).`);
    } else if (!isNum(v)) {
      errors.push(`Formel: „${k}“ muss eine Zahl sein.`);
    }
  }
  const fw = f.fact_weight ?? DEFAULT_FORMULA.fact_weight;
  const aw = f.athlete_weight ?? DEFAULT_FORMULA.athlete_weight;
  if (isNum(fw) && isNum(aw) && Math.abs(fw + aw - 1) > 0.001) errors.push('Formel: fact_weight + athlete_weight muss 1 ergeben.');
  return errors;
}

function withDefaults(formula) {
  return { ...DEFAULT_FORMULA, ...(formula || {}) };
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return n === null ? null : Math.round(n * 100) / 100;
}

function bandPoints(bands, x) {
  for (const b of bands || []) {
    const min = b.min ?? -Infinity;
    const max = b.max ?? Infinity;
    if (x >= min && x <= max) return Number(b.points) || 0;
  }
  return 0;
}

// Höchste erreichbare Punktzahl laut Punkteschema.
function maxFromScoring(scoring) {
  if (!scoring) return 0;
  switch (scoring.type) {
    case 'option':
      return Math.max(0, ...Object.values(scoring.points || {}).map(Number));
    case 'bool':
      return Math.max(Number(scoring.points_true) || 0, Number(scoring.points_false) || 0);
    case 'rating':
      return Number(scoring.max) || 0;
    case 'bands':
    case 'climate':
      return Math.max(0, ...(scoring.bands || []).map((b) => Number(b.points) || 0));
    case 'bonus':
      return Number(scoring.points) || 0;
    default:
      return 0;
  }
}

// Kriterium ohne eigenen Faktenwert (Klima aus climate_monthly, Bonus aus anderen Kriterien) – kein Eingabefeld,
// keine Anfrage, keine „fehlt“-Meldung
function isDerived(criterion) {
  const t = ((criterion && criterion.scoring) || {}).type;
  return t === 'climate' || t === 'bonus';
}

// Punkte eines Bonus-Kriteriums aus den Ergebnissen der übrigen Kriterien (Map code -> pointsFor-Ergebnis)
function bonusPoints(criterion, byCode) {
  const s = criterion.scoring || {};
  const unknown = { known: false, points: 0, ko: false, invalid: false };
  const req = [].concat(s.requires || []).map((code) => byCode.get(code));
  if (!req.length || req.some((r) => !r || r.invalid)) return { ...unknown, invalid: true };
  if (req.some((r) => r.known && !(r.points > 0))) return { known: true, points: 0, ko: false, invalid: false };
  if (req.some((r) => !r.known)) return unknown;
  let points = Number(s.points) || 0;
  const cap = toNumber(criterion.max_points);
  if (cap !== null) points = Math.min(points, cap);
  return { known: true, points, ko: false, invalid: false };
}

// Auswahl (eine oder mehrere Ausprägungen) -> Wert-JSON. undefined = nichts gewählt, null = unbekannte Ausprägung.
// Ohne "multi" zählt nur die erste Ausprägung.
function optionValue(scoring, list) {
  const s = scoring || {};
  const pts = s.points || {};
  const keys = Object.keys(pts);
  let opts = [...new Set([].concat(list === undefined || list === null ? [] : list).map((v) => String(v).trim()).filter(Boolean))];
  if (!opts.length) return undefined;
  if (opts.some((k) => !Object.prototype.hasOwnProperty.call(pts, k))) return null;
  if (!s.multi) return { option: opts[0] };
  const positive = opts.filter((k) => Number(pts[k]) > 0);
  opts = positive.length ? positive : opts.slice(0, 1);
  opts.sort((a, b) => Number(pts[b]) - Number(pts[a]) || keys.indexOf(a) - keys.indexOf(b));
  return { option: opts[0], options: opts };
}

// Gewählte Ausprägungen eines Werts (Mehrfachauswahl oder einzeln)
function selectedOptions(value) {
  if (!value) return [];
  if (Array.isArray(value.options) && value.options.length) return value.options.map(String);
  return value.option === undefined || value.option === null || value.option === '' ? [] : [String(value.option)];
}

// Punkte eines Kriteriums. climateRow nur für Typ 'climate'.
// Ergebnis: { known, points, ko, invalid }
function pointsFor(criterion, value, climateRow) {
  const s = criterion.scoring || {};
  const unknown = { known: false, points: 0, ko: false, invalid: false };
  let points;
  let koHit = false;

  switch (s.type) {
    case 'option': {
      const opts = selectedOptions(value);
      if (!opts.length) return unknown;
      if (!s.points || opts.some((o) => !(o in s.points))) return { ...unknown, invalid: true };
      // Mehrfachauswahl: die beste Ausprägung zählt; K.O. nur, wenn alle gewählten K.O. sind
      points = Math.max(...opts.map((o) => Number(s.points[o]) || 0));
      koHit = opts.every((o) => (Array.isArray(s.ko) ? s.ko.includes(o) : (Number(s.points[o]) || 0) === 0));
      break;
    }
    case 'bool': {
      if (!value || typeof value.bool !== 'boolean') return unknown;
      points = value.bool ? Number(s.points_true) || 0 : Number(s.points_false) || 0;
      koHit = value.bool === false;
      break;
    }
    case 'rating': {
      const n = toNumber(value && value.number);
      if (n === null) return unknown;
      const min = Number(s.min) || 0;
      const max = Number(s.max) || 0;
      points = Math.min(max, Math.max(min, n));
      koHit = points === 0;
      break;
    }
    case 'bands': {
      const n = toNumber(value && value.number);
      if (n === null) return unknown;
      points = bandPoints(s.bands, n);
      koHit = points === 0;
      break;
    }
    case 'climate': {
      const n = toNumber(climateRow && climateRow[s.metric]);
      if (n === null) return unknown;
      points = bandPoints(s.bands, n);
      koHit = points === 0;
      break;
    }
    default:
      return { ...unknown, invalid: true };
  }

  const cap = toNumber(criterion.max_points);
  if (cap !== null) points = Math.min(points, cap);
  return { known: true, points, ko: Boolean(criterion.is_ko) && koHit, invalid: false };
}

function climateByMonth(climate) {
  const map = new Map();
  for (const row of climate || []) map.set(Number(row.month), row);
  return map;
}

// Monat mit den meisten Klima-Punkten (Konzept: ohne gewählten Monat zählt der beste Monat).
function bestMonth(criteria, climate) {
  const climateCriteria = criteria.filter((c) => c.scoring && c.scoring.type === 'climate');
  const byMonth = climateByMonth(climate);
  if (!climateCriteria.length || !byMonth.size) return null;
  let best = null;
  let bestPts = -1;
  for (const [month, row] of [...byMonth.entries()].sort((a, b) => a[0] - b[0])) {
    const pts = climateCriteria.reduce((sum, c) => sum + pointsFor(c, null, row).points, 0);
    if (pts > bestPts) {
      best = month;
      bestPts = pts;
    }
  }
  return best;
}

function labelFor(score, labels) {
  if (score === null || score === undefined) return null;
  const sorted = [...(labels || [])].sort((a, b) => b.min - a.min);
  const hit = sorted.find((l) => score >= l.min);
  return hit ? hit.label : null;
}

// Lesbare Darstellung eines Werts (für Hotelseite, Admin, KO-Begründung).
function describeValue(criterion, value, climateRow) {
  const s = criterion.scoring || {};
  switch (s.type) {
    case 'option': {
      const opts = selectedOptions(value);
      if (!opts.length) return null;
      return opts.map((o) => (s.labels && s.labels[o]) || o).join(' · ');
    }
    case 'bool':
      if (!value || typeof value.bool !== 'boolean') return null;
      return value.bool ? 'ja' : 'nein';
    case 'rating': {
      const n = toNumber(value && value.number);
      return n === null ? null : `${n} von ${s.max}`;
    }
    case 'bands': {
      const n = toNumber(value && value.number);
      return n === null ? null : `${n}${s.unit ? ' ' + s.unit : ''}`;
    }
    case 'climate': {
      const n = toNumber(climateRow && climateRow[s.metric]);
      if (n === null) return null;
      return s.metric === 'rain_days' ? `${n} Regentage` : `${n} °C`;
    }
    default:
      return null;
  }
}

// Athleten-Score A (ab Version 2): Bayes-Mittel mit Altersgewichtung.
// reviews: [{ score: 0..100, ageMonths: n, factor?: 1.0 }]
function ageWeight(ageMonths) {
  if (ageMonths < 12) return 1.0;
  if (ageMonths < 24) return 0.7;
  if (ageMonths < 36) return 0.4;
  return 0;
}

function starsToScore(stars) {
  return ((Number(stars) - 1) / 4) * 100;
}

function computeAthleteScore(reviews, formula) {
  const f = withDefaults(formula);
  if (!reviews || !reviews.length) return null;
  let sumW = 0;
  let sumWR = 0;
  for (const r of reviews) {
    const w = ageWeight(r.ageMonths) * (r.factor ?? 1);
    sumW += w;
    sumWR += w * r.score;
  }
  return round2((f.bayes_c * f.bayes_m + sumWR) / (f.bayes_c + sumW));
}

// Hauptfunktion.
// criteria: aktive Kriterien eines Rankings
// facts:    { [criterion_id]: value-jsonb }
// climate:  [{ month, avg_high_c, avg_low_c, rain_days }]
// opts:     { month, formula, labels, athleteScore, reviewCount }
function computeScore(criteria, facts, climate, opts = {}) {
  const formula = withDefaults(opts.formula);
  const active = criteria.filter((c) => c.active !== false);
  const month = opts.month ? Number(opts.month) : bestMonth(active, climate);
  const climateRow = month ? climateByMonth(climate).get(month) || null : null;

  let maxAll = 0;
  let maxKnown = 0;
  let pointsKnown = 0;
  let maxImputed = 0;
  let pointsImputed = 0;
  let koCriterion = null;
  const details = [];
  const policy = ['average', 'half'].includes(formula.unknown_policy) ? formula.unknown_policy : 'ignore';
  const shares = opts.unknownShares || {};

  // Erst alle Kriterien mit eigenem Wert, dann Bonus-Kriterien aus deren Ergebnissen
  const results = new Map();
  const byCode = new Map();
  for (const c of active) {
    if ((c.scoring || {}).type === 'bonus') continue;
    const r = pointsFor(c, facts ? facts[c.id] : undefined, climateRow);
    results.set(c.id, r);
    byCode.set(c.code, r);
  }
  for (const c of active) {
    if ((c.scoring || {}).type === 'bonus') results.set(c.id, bonusPoints(c, byCode));
  }

  for (const c of active) {
    const max = Number(c.max_points) || 0;
    const value = facts ? facts[c.id] : undefined;
    const r = results.get(c.id);
    maxAll += max;
    if (r.known) {
      maxKnown += max;
      pointsKnown += r.points;
    }
    // Unbekannt: je nach Formel mit Ersatzwert ansetzen (nicht für Klima – das hängt am Reisemonat)
    let imputed = null;
    if (!r.known && policy !== 'ignore' && c.scoring && c.scoring.type !== 'climate' && max > 0) {
      const raw = policy === 'half' ? 0.5 : toNumber(shares[c.id]);
      const share = Math.min(1, Math.max(0, raw === null ? Number(formula.unknown_default_share) || 0 : raw));
      imputed = round2(share * max);
      maxImputed += max;
      pointsImputed += imputed;
    }
    if (r.ko && !koCriterion) koCriterion = { criterion: c, value };
    details.push({
      criterionId: c.id,
      code: c.code,
      categoryId: c.category_id,
      known: r.known,
      invalid: r.invalid,
      points: r.points,
      imputed,
      max,
      ko: r.ko,
    });
  }

  // Fakten-Score: bekannte Punkte plus Ersatzwerte für unbekannte (Fehlende Angaben sollen weder schaden noch nützen)
  const factScore = maxKnown > 0 ? ((pointsKnown + pointsImputed) / (maxKnown + maxImputed)) * 100 : null;
  const completeness = maxAll > 0 ? (maxKnown / maxAll) * 100 : 0;
  const reviewCount = Number(opts.reviewCount) || 0;
  // Athleten-Score nur, wenn eingeschaltet und genug Bewertungen vorliegen
  const athleteUsed = Boolean(formula.athlete_enabled) && reviewCount >= formula.min_reviews;
  const athleteScore = athleteUsed ? toNumber(opts.athleteScore) : null;

  let score = null;
  if (!koCriterion && factScore !== null) {
    score =
      athleteScore === null
        ? Math.round(factScore)
        : Math.round(formula.fact_weight * factScore + formula.athlete_weight * athleteScore);
  }

  let koReason = null;
  if (koCriterion) {
    const shown = describeValue(koCriterion.criterion, koCriterion.value, climateRow);
    koReason = `${koCriterion.criterion.label}: ${shown ?? 'nicht erfüllt'}`;
  }

  return {
    factScore: round2(factScore),
    athleteScore,
    completeness: round2(completeness),
    score,
    label: labelFor(score, opts.labels),
    // Vorläufig nur, solange Bewertungen zählen sollen, aber noch zu wenige vorliegen
    provisional: Boolean(formula.athlete_enabled) && athleteScore === null,
    athleteUsed: athleteScore !== null,
    eligible: !koCriterion && score !== null && completeness >= formula.min_completeness,
    ko: Boolean(koCriterion),
    koReason,
    month,
    pointsKnown: round2(pointsKnown),
    pointsImputed: round2(pointsImputed),
    maxImputed,
    unknownPolicy: policy,
    maxKnown,
    maxAll,
    details,
  };
}

const VALUE_TYPE_SCORING = {
  option: ['option'],
  bool: ['bool'],
  rating: ['rating'],
  number: ['bands', 'climate'],
  bonus: ['bonus'],
};

// Prüft eine Kriteriendefinition aus dem Admin. Ergebnis: { errors: [], warnings: [] }
function validateCriterion({ value_type, scoring, max_points }) {
  const errors = [];
  const warnings = [];
  if (!scoring || typeof scoring !== 'object') {
    errors.push('Punkteschema fehlt oder ist kein JSON-Objekt.');
    return { errors, warnings };
  }
  const allowed = VALUE_TYPE_SCORING[value_type];
  if (!allowed) errors.push(`Unbekannter Werttyp „${value_type}“.`);
  else if (!allowed.includes(scoring.type)) {
    errors.push(`Werttyp „${value_type}“ passt nicht zu Schema-Typ „${scoring.type}“ (erlaubt: ${allowed.join(', ')}).`);
  }
  switch (scoring.type) {
    case 'option':
      if (!scoring.points || typeof scoring.points !== 'object' || !Object.keys(scoring.points).length) {
        errors.push('Typ option braucht "points" mit mindestens einer Ausprägung.');
      }
      if (scoring.multi !== undefined && typeof scoring.multi !== 'boolean') errors.push('"multi" muss true oder false sein.');
      for (const k of scoring.ko || []) {
        if (!scoring.points || !(k in scoring.points)) errors.push(`K.O.-Ausprägung „${k}“ fehlt in "points".`);
      }
      break;
    case 'bool':
      if (toNumber(scoring.points_true) === null) errors.push('Typ bool braucht "points_true".');
      break;
    case 'rating':
      if (toNumber(scoring.max) === null) errors.push('Typ rating braucht "max".');
      break;
    case 'bands':
    case 'climate':
      if (!Array.isArray(scoring.bands) || !scoring.bands.length) errors.push(`Typ ${scoring.type} braucht "bands".`);
      if (scoring.type === 'climate' && !CLIMATE_METRICS.includes(scoring.metric)) {
        errors.push(`Typ climate braucht "metric" (${CLIMATE_METRICS.join(', ')}).`);
      }
      break;
    case 'bonus':
      if (!Array.isArray(scoring.requires) || !scoring.requires.length || scoring.requires.some((c) => typeof c !== 'string' || !c)) {
        errors.push('Typ bonus braucht "requires" mit mindestens einem Kriterien-Code.');
      }
      if (toNumber(scoring.points) === null) errors.push('Typ bonus braucht "points".');
      break;
    default:
      errors.push(`Unbekannter Schema-Typ „${scoring.type}“.`);
  }
  if (!errors.length && toNumber(max_points) !== maxFromScoring(scoring)) {
    warnings.push(`max_points (${max_points}) weicht von der höchsten Punktzahl im Schema (${maxFromScoring(scoring)}) ab.`);
  }
  return { errors, warnings };
}

// Geteilte Fakten (criteria.share_key): passen zwei Kriterien zusammen? Gleicher Werttyp; bei Auswahl dieselben
// Ausprägungen und dieselbe Einstellung „multi“ (Punkte dürfen je Ranking verschieden sein). Ergebnis: Fehlerliste
function validateShared(criterion, sibling) {
  const errors = [];
  const a = criterion.scoring || {};
  const b = sibling.scoring || {};
  const who = `„${sibling.code}“${sibling.ranking_name ? ` (${sibling.ranking_name})` : ''}`;
  if (criterion.value_type !== sibling.value_type || a.type !== b.type) {
    errors.push(`Geteilter Wert mit ${who}: Werttyp passt nicht (${a.type} / ${b.type}).`);
  } else if (isDerived(criterion)) {
    errors.push(`Typ ${a.type} hat keinen eigenen Wert und kann nicht geteilt werden.`);
  } else if (a.type === 'option') {
    const ka = Object.keys(a.points || {}).sort().join(',');
    const kb = Object.keys(b.points || {}).sort().join(',');
    if (ka !== kb) errors.push(`Geteilter Wert mit ${who}: Ausprägungen weichen ab (${ka} / ${kb}).`);
    if (Boolean(a.multi) !== Boolean(b.multi)) errors.push(`Geteilter Wert mit ${who}: Mehrfachauswahl nur auf einer Seite.`);
  } else if (a.type === 'rating' && (Number(a.min) !== Number(b.min) || Number(a.max) !== Number(b.max))) {
    errors.push(`Geteilter Wert mit ${who}: Skala weicht ab (${a.min}–${a.max} / ${b.min}–${b.max}).`);
  }
  return errors;
}

// Athleten-Score A (0–100) aus Bewertungen: Sterne 1–5 -> 0–100 (Mittel der Dimensionen je Bewertung),
// Gewicht nach Alter des Aufenthalts, Bayes-Mittel mit C (bayes_c) und Startwert m (bayes_m).
// reviews: [{ ratings: {dim: 1..5}, stay_month: Date|string }]; Ergebnis { score, count, weightSum, avgStars }
// Rechenbeispiel für die Methodik-Seite (rein): n frische Bewertungen mit Ø stars Sternen, Fakten-Score F.
// Alle Bewertungen mit Gewicht 1 (jünger als 12 Monate). Rückgabe { perReview, A, score }
function exampleWithReviews(F, n, stars, formulaIn) {
  const f = withDefaults(formulaIn);
  const perReview = starsToScore(stars);
  const A = (Number(f.bayes_c) * Number(f.bayes_m) + n * perReview) / (Number(f.bayes_c) + n);
  return { perReview: round2(perReview), A: round2(A), score: Math.round(Number(f.fact_weight) * F + Number(f.athlete_weight) * A) };
}

function athleteScore(reviews, formulaIn, now = new Date()) {
  const f = withDefaults(formulaIn);
  let sumW = 0;
  let sumWV = 0;
  let count = 0;
  let starSum = 0;
  let starN = 0;
  for (const r of reviews || []) {
    const vals = Object.values(r.ratings || {}).map(Number).filter((v) => v >= 1 && v <= 5);
    if (!vals.length) continue;
    const stars = vals.reduce((s, v) => s + v, 0) / vals.length;
    starSum += stars;
    starN += 1;
    const stay = new Date(r.stay_month);
    const months = (now.getFullYear() - stay.getFullYear()) * 12 + (now.getMonth() - stay.getMonth());
    const band = (f.review_age_weights || []).find(([m]) => months < m);
    const w = band ? Number(band[1]) : 0;
    if (w <= 0) continue;
    count += 1;
    sumW += w;
    sumWV += w * ((stars - 1) / 4) * 100;
  }
  const C = Number(f.bayes_c);
  const m = Number(f.bayes_m);
  return {
    score: count ? round2((C * m + sumWV) / (C + sumW)) : null,
    count,
    weightSum: round2(sumW),
    avgStars: starN ? round2(starSum / starN) : null,
  };
}

module.exports = {
  athleteScore,
  exampleWithReviews,
  DEFAULT_FORMULA,
  validateFormula,
  withDefaults,
  pointsFor,
  bonusPoints,
  isDerived,
  validateShared,
  optionValue,
  selectedOptions,
  maxFromScoring,
  bestMonth,
  labelFor,
  describeValue,
  ageWeight,
  starsToScore,
  computeAthleteScore,
  computeScore,
  validateCriterion,
};
