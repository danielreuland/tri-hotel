-- Systemmails je Site im Admin bearbeitbar. Fehlt eine Vorlage, gilt der Standardtext aus src/services/mailtemplates.js.
-- Die Anfrage-Mails der Agenten (Mia) sind keine Vorlage: ihren Text formuliert der Agent je Anfrage.
CREATE TABLE email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  key         text NOT NULL,                    -- verify | live | rejected | duplicate | inquiry-answered
  language    text NOT NULL DEFAULT 'de',
  subject     text NOT NULL,
  body        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,    -- aus = Standardtext verwenden
  version     integer NOT NULL DEFAULT 1,
  updated_by  uuid REFERENCES admin_users(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, key, language)
);
-- Versandprotokoll: Betreff mitschreiben (für die Übersicht im Admin)
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id);
CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log (created_at DESC);
