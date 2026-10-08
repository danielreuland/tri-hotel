-- Anfragen an Betreiber (z. B. Hotels) zu unklaren Werten und – optional – Fotos mit Nutzungserlaubnis.
-- Ablauf: Admin startet Anfrage -> Agent formuliert Mail + Fragen -> Versand mit persönlichem Antwortlink
--         -> Betreiber antwortet über das Formular -> Admin übernimmt Antworten (Vertrauensstufe 1).

-- Kontakt des Betreibers im Profil
ALTER TABLE entities ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS contact_email_source text;   -- 'website' (automatisch, mit Fundstelle) | 'admin'
ALTER TABLE entities ADD COLUMN IF NOT EXISTS contact_email_evidence text; -- URL der Fundstelle

CREATE TYPE inquiry_status AS ENUM ('queued', 'sent', 'answered', 'expired', 'failed', 'closed');

CREATE TABLE inquiries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  ranking_id       uuid NOT NULL REFERENCES rankings(id),
  submission_id    uuid REFERENCES submissions(id),
  recipient        text NOT NULL,
  language         text NOT NULL DEFAULT 'de',         -- Sprache von Mail und Antwortformular
  criteria_ids     uuid[] NOT NULL,                    -- gefragte Kriterien
  questions        jsonb NOT NULL DEFAULT '[]',        -- [{criterion_id, question, options:[{value, text}]}] vom Agenten
  subject          text,
  body             text,                               -- Mailtext wie versendet (Nachweis)
  admin_note       text,                               -- Hinweis des Admins an den Agenten
  ask_photos       boolean NOT NULL DEFAULT false,     -- Fotos mit Nutzungserlaubnis anfragen
  reply_name       text,                               -- wer geantwortet hat (Angabe im Formular)
  reply_note       text,                               -- freie Nachricht des Betreibers
  token_hash       text,                               -- nur Hash des Antwortlinks
  status           inquiry_status NOT NULL DEFAULT 'queued',
  error            text,
  sent_at          timestamptz,
  reminder_sent_at timestamptz,
  answered_at      timestamptz,
  expires_at       timestamptz,
  created_by       uuid REFERENCES admin_users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inquiries_entity_idx ON inquiries (entity_id, created_at DESC);
CREATE INDEX inquiries_token_idx ON inquiries (token_hash);
-- höchstens eine offene Anfrage je Objekt und Ranking
CREATE UNIQUE INDEX inquiries_one_open_idx ON inquiries (entity_id, ranking_id) WHERE status IN ('queued', 'sent');

CREATE TABLE inquiry_answers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id   uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES criteria(id),
  value        jsonb,                                  -- NULL = "weiß nicht"
  comment      text,
  status       text NOT NULL DEFAULT 'pending',        -- 'pending' | 'accepted' | 'rejected'
  reviewed_by  uuid REFERENCES admin_users(id),
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inquiry_id, criterion_id)
);
CREATE INDEX inquiry_answers_pending_idx ON inquiry_answers (status) WHERE status = 'pending';

-- Fotos aus einer Anfrage: Herkunft nachvollziehbar (Nachweis steht zusätzlich in release_proof)
ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS inquiry_id uuid REFERENCES inquiries(id);

-- E-Mail-Protokoll auch für Anfragen nutzbar
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS inquiry_id uuid REFERENCES inquiries(id);
