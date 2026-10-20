-- Camp-Anbieter: im Admin mit Name + Website anlegen, automatisch qualifizieren, Admin gibt frei.
-- Ablauf (camp_providers.status): draft (in Prüfung) -> active (freigegeben) | rejected (abgelehnt) ; archived wie bisher.
-- Hotels, die der Anbieter nennt und die noch nicht im Ranking sind, werden als Hotel-Meldung angelegt
-- (normaler Hotel-Ablauf mit Auto-Prüfung und Admin-Freigabe); nach der Freigabe wird das Hotel verknüpft.

ALTER TABLE camp_providers DROP CONSTRAINT IF EXISTS camp_providers_status_check;
ALTER TABLE camp_providers ADD CONSTRAINT camp_providers_status_check CHECK (status IN ('draft', 'active', 'rejected', 'archived'));

ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS check_status text;          -- queued | running | done | failed (NULL = nie geprüft)
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS qualification text;         -- qualified | review | not_qualified (Ampel der Auto-Prüfung)
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS check_report jsonb NOT NULL DEFAULT '{}';
  -- {"rules":[{"key","label","level":"ok|warn|fail","required":bool,"text","evidence_url","evidence_text"}],
  --  "log":[{"step","ok","info","at"}], "extracted":{…Felder mit Fundstelle…}, "pages":n}
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS checked_at timestamptz;
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES admin_users(id);
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES admin_users(id);

-- Herkunft eines Hotels beim Anbieter: Hotel-Meldung, die aus der Prüfung entstanden ist (bis zur Freigabe ohne entity_id)
ALTER TABLE camp_provider_hotels ADD COLUMN IF NOT EXISTS submission_id uuid REFERENCES submissions(id) ON DELETE SET NULL;
ALTER TABLE camp_provider_hotels ADD COLUMN IF NOT EXISTS evidence_url text;
ALTER TABLE camp_provider_hotels ADD COLUMN IF NOT EXISTS evidence_text text;

-- Hotel-Meldungen aus der Camp-Prüfung: Herkunft und ggf. ohne Website (Website wird über OpenStreetMap gesucht)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS source_camp_provider_id uuid REFERENCES camp_providers(id) ON DELETE SET NULL;
ALTER TABLE submissions ALTER COLUMN website DROP NOT NULL;

-- Thema der Camps je Site (für die Prüfung „passt zum Thema“) – kein Thema im Code
ALTER TABLE sites ADD COLUMN IF NOT EXISTS camp_topic text;
UPDATE sites SET camp_topic = 'Trainingscamps für Triathlon und Ausdauersport (Schwimmen, Radfahren, Laufen), auch einzelne Disziplinen'
 WHERE code = 'tri-hotel' AND camp_topic IS NULL;
