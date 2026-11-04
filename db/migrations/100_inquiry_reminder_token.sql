-- Anfragen: Die Erinnerung bekommt einen eigenen Antwortlink, der Link der ersten Mail bleibt gültig (bis zum Ablauf der Anfrage).
-- Bisher überschrieb die Erinnerung token_hash und machte den ersten Link ungültig, obwohl sie „Der Link ist weiterhin gültig“ schreibt.
ALTER TABLE inquiries ADD COLUMN reminder_token_hash text;
CREATE INDEX inquiries_reminder_token_idx ON inquiries (reminder_token_hash) WHERE reminder_token_hash IS NOT NULL;
