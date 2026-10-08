-- Welcher Admin hat eine Meldung selbst angelegt? (vorher nur created_by_admin = true)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES admin_users(id);

-- Bestehende Admin-Anlagen aus dem Audit-Log übernehmen
UPDATE submissions s SET created_by = a.admin_id
  FROM admin_actions a
 WHERE s.created_by_admin AND s.created_by IS NULL
   AND a.entity_type = 'submission' AND a.entity_id = s.id AND a.action = 'create' AND a.admin_id IS NOT NULL;
