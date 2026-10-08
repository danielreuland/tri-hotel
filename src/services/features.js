// Leistungskatalog und Leistungen je Objekt (DB-Zugriff). Logik in lib/features.js.
const db = require('../db');
const lib = require('../lib/features');

async function catalog(entityType, { includeInactive = false } = {}) {
  return db.many(
    `SELECT * FROM features WHERE entity_type = $1 ${includeInactive ? '' : 'AND active'} ORDER BY sort_order, label`,
    [entityType]
  );
}

// Leistungen für mehrere Objekte auf einmal: Map(entityId -> [Leistung])
async function forEntities(entityType, entityIds) {
  const result = new Map(entityIds.map((id) => [id, []]));
  if (!entityIds.length) return result;
  const [cat, facts, manual] = await Promise.all([
    catalog(entityType),
    db.many(
      `SELECT f.entity_id, r.code AS ranking_code, c.code AS criterion_code, f.value, f.trust_level, f.checked_at
         FROM entity_facts f JOIN criteria c ON c.id = f.criterion_id JOIN rankings r ON r.id = c.ranking_id
        WHERE f.entity_id = ANY($1::uuid[])`,
      [entityIds]
    ),
    db.many(`SELECT * FROM entity_features WHERE entity_id = ANY($1::uuid[])`, [entityIds]),
  ]);
  for (const id of entityIds) {
    result.set(id, lib.entityFeatures(cat, facts.filter((f) => f.entity_id === id), manual.filter((m) => m.entity_id === id)));
  }
  return result;
}

async function forEntity(entityType, entityId) {
  return (await forEntities(entityType, [entityId])).get(entityId);
}

module.exports = { catalog, forEntities, forEntity };
