-- Bekannte Angaben und Leistungen vom Betreiber bestätigen lassen (zusätzlich zu den Fragen nach unklaren Werten).
-- Die Mail nennt nur die Anzahl; die Liste steht im Antwortformular. Antworten übernimmt der Admin (Vertrauensstufe 1).

ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS confirm_criteria_ids uuid[] NOT NULL DEFAULT '{}';  -- bekannte Werte zum Bestätigen
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS confirm_feature_ids  uuid[] NOT NULL DEFAULT '{}';  -- erfasste Leistungen zum Bestätigen
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS offer_feature_ids    uuid[] NOT NULL DEFAULT '{}';  -- „Bieten Sie außerdem …?“ aus dem Katalog
-- Stand beim Formulieren, in der Sprache des Betreibers:
-- {"criteria":[{"criterion_id","label","current":{value},"current_text","options":[{value,text}]}],
--  "features":[{"feature_id","text","known":true|false}]}
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS confirmations jsonb NOT NULL DEFAULT '{}';

-- Antworten zu Kriterien: 'question' (unklarer Wert) oder 'confirm' (bekannter Wert bestätigt bzw. korrigiert)
ALTER TABLE inquiry_answers ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'question';
ALTER TABLE inquiry_answers ADD COLUMN IF NOT EXISTS previous jsonb;  -- bekannter Wert zum Zeitpunkt der Anfrage

-- Antworten zu Leistungen: bietet das Objekt die Leistung an (offered) – known = war bei uns schon erfasst
CREATE TABLE inquiry_feature_answers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id  uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  feature_id  uuid NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  offered     boolean NOT NULL,
  known       boolean NOT NULL,
  status      text NOT NULL DEFAULT 'pending',        -- 'pending' | 'accepted' | 'rejected'
  reviewed_by uuid REFERENCES admin_users(id),
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inquiry_id, feature_id)
);
CREATE INDEX inquiry_feature_answers_pending_idx ON inquiry_feature_answers (status) WHERE status = 'pending';
