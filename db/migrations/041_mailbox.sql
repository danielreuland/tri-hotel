-- Postfach: Antworten auf Agenten-Mails (Mia, Lara, Ben) und alles andere, was an das Sammelpostfach geht.
-- Versand schreibt die Message-ID ins Versandprotokoll; eingehende Mails werden darüber (In-Reply-To/References),
-- über die Absenderadresse oder die Website-Domain einem Objekt, einer Anfrage oder einem Camp-Anbieter zugeordnet.
-- Die Quelle (heute IMAP, später z. B. Gmail-Schnittstelle) steht in mail_messages.source.

ALTER TABLE email_log ADD COLUMN IF NOT EXISTS message_id text;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES entities(id) ON DELETE SET NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS camp_provider_id uuid REFERENCES camp_providers(id) ON DELETE SET NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS persona_id uuid REFERENCES personas(id) ON DELETE SET NULL;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS body_text text;      -- nur für Antworten/Nachrichten aus dem Admin (nie für Mails mit Bestätigungslinks)
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES admin_users(id);
CREATE INDEX IF NOT EXISTS email_log_message_id_idx ON email_log (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_log_entity_idx ON email_log (entity_id) WHERE entity_id IS NOT NULL;

CREATE TABLE mail_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           text NOT NULL,                      -- 'imap' | später 'gmail'
  message_id       text,                               -- Message-ID-Kopfzeile
  in_reply_to      text,
  refs             text[] NOT NULL DEFAULT '{}',
  from_email       text NOT NULL,
  from_name        text,
  to_emails        text[] NOT NULL DEFAULT '{}',
  subject          text,
  body_text        text,                               -- nur Text; HTML wird nie angezeigt
  sent_at          timestamptz,                        -- Datum laut Absender
  received_at      timestamptz NOT NULL DEFAULT now(),
  kind             text NOT NULL DEFAULT 'mail',       -- 'mail' | 'auto_reply' (Abwesenheit) | 'bounce' (unzustellbar)
  entity_id        uuid REFERENCES entities(id) ON DELETE SET NULL,
  inquiry_id       uuid REFERENCES inquiries(id) ON DELETE SET NULL,
  camp_provider_id uuid REFERENCES camp_providers(id) ON DELETE SET NULL,
  persona_id       uuid REFERENCES personas(id) ON DELETE SET NULL,
  email_log_id     bigint REFERENCES email_log(id) ON DELETE SET NULL,  -- beantwortete Mail
  matched_by       text,                               -- 'thread' | 'sender' | 'domain' | 'admin' | NULL (nicht zugeordnet)
  status           text NOT NULL DEFAULT 'new',        -- 'new' | 'done' | 'ignored'
  attachments      jsonb NOT NULL DEFAULT '[]',        -- [{file, name, type, size}] bzw. {name, skipped}
  handled_at       timestamptz,
  handled_by       uuid REFERENCES admin_users(id)
);
CREATE UNIQUE INDEX mail_messages_message_id_idx ON mail_messages (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX mail_messages_status_idx ON mail_messages (status, received_at DESC);
CREATE INDEX mail_messages_entity_idx ON mail_messages (entity_id) WHERE entity_id IS NOT NULL;

-- Antwort aus dem Admin auf eine eingegangene Mail
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS reply_to_message uuid REFERENCES mail_messages(id) ON DELETE SET NULL;
