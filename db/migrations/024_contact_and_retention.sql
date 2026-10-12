-- Kontaktformular (zweiter schneller Kontaktweg neben E-Mail, § 5 DDG). Nachrichten landen im Admin.
CREATE TABLE contact_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid REFERENCES sites(id) ON DELETE SET NULL,
  name        text,
  email       text NOT NULL,
  message     text NOT NULL,
  ip_hash     text,
  handled_at  timestamptz,
  handled_by  uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_messages_open_idx ON contact_messages (created_at) WHERE handled_at IS NULL;
-- Löschfristen: Zeitpunkt der Anonymisierung festhalten (Nachweis, dass der Job gelaufen ist)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
