-- Kontakt des Camp-Anbieters (allgemein, nicht der Empfänger von Anfragen): von der Prüfung vorbefüllt oder vom Admin eingetragen
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS contact_source text;    -- website | hunter | admin
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS contact_evidence text;  -- URL der Fundstelle

-- Bereits gefundene Kontakte aus den Prüfberichten übernehmen (nur mit Fundstelle von der Website)
UPDATE camp_providers SET
  contact_email = NULLIF(check_report->'extracted'->'contact'->>'email', ''),
  contact_phone = NULLIF(check_report->'extracted'->'contact'->>'phone', ''),
  contact_source = 'website',
  contact_evidence = check_report->'extracted'->'contact'->>'evidence_url'
WHERE contact_email IS NULL AND contact_phone IS NULL
  AND jsonb_typeof(check_report->'extracted'->'contact') = 'object'
  AND (NULLIF(check_report->'extracted'->'contact'->>'email', '') IS NOT NULL OR NULLIF(check_report->'extracted'->'contact'->>'phone', '') IS NOT NULL);
