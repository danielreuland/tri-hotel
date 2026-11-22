-- Ansprechpartner aus Mail-Antworten an den Hub (21.11.2026): zugeordnete Mails melden ihren Absender als contact.profile.
-- hub_contact_at = geprüft; hub_contact = Ergebnis ('sent' = Ereignis eingestellt, sonst Grund fürs Auslassen).
-- Bestehende Mails haben beide Felder leer und werden beim nächsten Postfach-Abruf nachgeholt.
ALTER TABLE mail_messages ADD COLUMN hub_contact_at timestamptz, ADD COLUMN hub_contact text;
CREATE INDEX mail_messages_hub_contact_open_idx ON mail_messages (received_at) WHERE hub_contact_at IS NULL;
