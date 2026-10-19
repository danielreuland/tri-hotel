-- Startseite: „nicht käuflich“ aus der Zeile über dem Titel entfernen (nur, wenn noch der ursprüngliche Text steht)
UPDATE rankings SET content = jsonb_set(content, '{hero_eyebrow}', '"Neutral · geprüft"')
 WHERE content->>'hero_eyebrow' = 'Neutral · geprüft · nicht käuflich';
