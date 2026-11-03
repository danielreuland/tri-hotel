// Vertragstests: vergleicht die Form einer echten Antwort mit einer Fixture aus docs/internal-api/fixtures.
// Gleiche Schlüssel (rekursiv), gleiche Typen; null passt zu jedem Typ (Felder sind im Vertrag nullable).
// Arrays: jedes Element hat die Form des ersten Fixture-Elements.
const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function shapeErrors(actual, fixture, path = '$') {
  const a = kind(actual);
  const f = kind(fixture);
  if (a === 'null' || f === 'null') return [];
  if (a !== f) return [`${path}: ${a} statt ${f}`];
  if (a === 'array') {
    if (!fixture.length) return [];
    return actual.flatMap((x, i) => shapeErrors(x, fixture[0], `${path}[${i}]`));
  }
  if (a !== 'object') return [];
  const errors = [];
  for (const k of Object.keys(fixture)) if (!(k in actual)) errors.push(`${path}.${k} fehlt`);
  for (const k of Object.keys(actual)) if (!(k in fixture)) errors.push(`${path}.${k} nicht im Vertrag`);
  for (const k of Object.keys(fixture)) if (k in actual) errors.push(...shapeErrors(actual[k], fixture[k], `${path}.${k}`));
  return errors;
}

module.exports = { shapeErrors };
