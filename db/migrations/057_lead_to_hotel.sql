-- Anfrage direkt ans Hotel („Trainingslager anfragen“ auf der Hotelseite): Das Hotel ist ein weiterer Empfänger einer
-- Camp-Anfrage – gleicher Ablauf (Bestätigungslink, Admin-Prüfung, Weiterleitung mit Reply-To, Nachfrage nach 7 Tagen).
-- Ein solcher Lead hat keinen Camp-Anbieter (provider_id NULL), sondern to_entity = true und entity_id = Hotel.
-- Kostenlos für alle Hotels mit Kontaktadresse (keine Abrechnung; partner_at_forward = false).
ALTER TABLE camp_leads ALTER COLUMN provider_id DROP NOT NULL;
ALTER TABLE camp_leads ADD COLUMN IF NOT EXISTS to_entity boolean NOT NULL DEFAULT false;
ALTER TABLE camp_leads ADD CONSTRAINT camp_leads_target_chk CHECK (provider_id IS NOT NULL OR (to_entity AND entity_id IS NOT NULL));
