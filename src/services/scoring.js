// Scoring-Logik für alle Rankings. Reine Funktionen ohne DB-Zugriff.
//
// Nichts hier ist Triathlon-spezifisch: Kriterien, Punkteschemata, Formel und
// Labels kommen aus der Datenbank (rankings, criteria). Neue Scoring-Typen nur
// als Erweiterung von pointsFor() + maxFromScoring() + validateCriterion(), mit Tests.
//
// Scoring-Typen (criteria.scoring.type):
//   option  {"points":{"<opt>":n,...},"ko":["<opt>"],"labels":{"<opt>":"Text"}}  Wert {"option":"<opt>"}
//   bool    {"points_true":n,"points_false":0}                                   Wert {"bool":true}
//   rating  {"min":0,"max":n}                                                     Wert {"number":x}
//   bands   {"bands":[{"min":a,"max":b,"points":n}]}                              Wert {"number":x}
//   climate {"metric":"avg_high_c"|"avg_low_c"|"rain_days","bands":[...]}         Wert aus climate_monthly
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
    default:
      return 0;
  }
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
      const opt = value && value.option;
      if (opt === undefined || opt === null || opt === '') return unknown;
      if (!s.points || !(opt in s.points)) return { ...unknown, invalid: true };
      points = Number(s.points[opt]) || 0;
      koHit = Array.isArray(s.ko) ? s.ko.includes(opt) : points === 0;
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
      const opt = value && value.option;
      if (!opt) return null;
      return (s.labels && s.labels[opt]) || opt;
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

  for (const c of active) {
    const max = Number(c.max_points) || 0;
    const value = facts ? facts[c.id] : undefined;
    const r = pointsFor(c, value, climateRow);
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
    default:
      errors.push(`Unbekannter Schema-Typ „${scoring.type}“.`);
  }
  if (!errors.length && toNumber(max_points) !== maxFromScoring(scoring)) {
    warnings.push(`max_points (${max_points}) weicht von der höchsten Punktzahl im Schema (${maxFromScoring(scoring)}) ab.`);
  }
  return { errors, warnings };
}

// Athleten-Score A (0–100) aus Bewertungen: Sterne 1–5 -> 0–100 (Mittel der Dimensionen je Bewertung),
// Gewicht nach Alter des Aufenthalts, Bayes-Mittel mit C (bayes_c) und Startwert m (bayes_m).
// reviews: [{ ratings: {dim: 1..5}, stay_month: Date|string }]; Ergebnis { score, count, weightSum, avgStars }
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
  DEFAULT_FORMULA,
  withDefaults,
  pointsFor,
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
