-- KI-Mails: Persona-Definition (Rolle & Stil) + Mustertext je Anlass. Beim Formulieren werden feste Regeln (Code),
-- Persona, Mustertext mit Pflichtpunkten, die konkreten Angaben und ein Stilbeispiel zusammengesetzt (services/aimail.js).

ALTER TABLE personas ADD COLUMN IF NOT EXISTS style text;   -- Rolle & Stil, frei formuliert

CREATE TABLE ai_mail_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  key          text NOT NULL,                     -- Anlass, z. B. 'inquiry' | 'inquiry_reminder'
  language     text NOT NULL DEFAULT 'de',        -- 'de' | 'en'
  subject      text NOT NULL,
  body         text NOT NULL,                     -- Mustertext mit Platzhaltern {{…}} und Abschnitten {{#fotos}}…{{/fotos}}
  must         text,                              -- Pflichtpunkte, einer je Zeile (nur KI-Anlässe)
  version      int NOT NULL DEFAULT 1,
  updated_by   uuid REFERENCES admin_users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, key, language)
);

-- Urfassung der KI, damit Überarbeitungen als Stilbeispiel dienen können
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS generated_subject text;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS generated_body text;

-- Startfassungen der Personas (im Admin unter Einstellungen → Sites anpassbar)
UPDATE personas SET style = 'Mia kümmert sich um die Datenpflege der Profile. Sie schreibt sachlich, freundlich und knapp – wie eine aufmerksame Kollegin aus der Redaktion, nicht wie ein Vertrieb. Sie kommt schnell zum Punkt, erklärt kurz, warum sie fragt, und macht es dem Betrieb so einfach wie möglich. Kein Marketington, keine Superlative, keine Ausrufezeichen. Anrede förmlich (Sie); auf Englisch höflich und neutral.'
 WHERE role = 'data_inquiry' AND style IS NULL;
UPDATE personas SET style = 'Lara betreut die Social-Media-Kanäle. Sie schreibt herzlich und etwas lockerer, mit spürbarer Freude an Sport und Reisen, bleibt aber respektvoll. Sie fragt um Erlaubnis, bevor Inhalte geteilt werden, und sagt klar, wo und wie etwas erscheint. Anrede gegenüber Betrieben: Sie; kurze Sätze, gern ein persönlicher Einstieg.'
 WHERE role = 'social' AND style IS NULL;
UPDATE personas SET style = 'Ben kümmert sich um Kooperationen mit Hotels und Camp-Anbietern. Er schreibt geschäftlich, klar und verbindlich, nennt Nutzen und nächste Schritte konkret und drängt nicht. Er stellt klar, dass Kooperationen keinen Einfluss auf Score und Reihenfolge haben. Anrede: Sie.'
 WHERE role = 'partnerships' AND style IS NULL;
