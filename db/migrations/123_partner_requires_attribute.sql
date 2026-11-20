-- Partnerprogramme, die nur zu bestimmten Unterkünften passen (Daniel, 20.11.2026): FeWo-direkt nur für Objekte mit Merkmal
-- „Ferienwohnung“ (entities.attributes.vacation_rental.value = true). Ohne Eintrag gilt ein Programm für alle Objekte.
-- Wirkt auf die Aufgabe „Partnerlink prüfen / generieren“ (services/tasks.js) und das Partnerlink-Formular am Objekt.
ALTER TABLE partner_programs ADD COLUMN requires_attribute text CHECK (requires_attribute ~ '^[a-z_]+$');
UPDATE partner_programs SET requires_attribute = 'vacation_rental', updated_at = now() WHERE code = 'fewo-direkt';
