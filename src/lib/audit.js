const db = require('../db');

// Jede Admin-Änderung an Fakten, Status, Rankings oder Bildern landet hier.
// Aktionen virtueller Mitarbeiter (Agenten) tragen persona_id statt admin_id.
async function logAction(adminId, entityType, entityId, action, diff = null, client = db, personaId = null) {
  await client.query(
    `INSERT INTO admin_actions (admin_id, persona_id, entity_type, entity_id, action, diff) VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminId || null, personaId || null, entityType, entityId, action, diff ? JSON.stringify(diff) : null]
  );
}

module.exports = { logAction };
