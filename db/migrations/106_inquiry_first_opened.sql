-- Anfragen: erster Aufruf des Antwortlinks im Browser. Sicheres Zeichen, dass die Mail angekommen ist und gelesen wurde.
-- Gezählt wird nur der Aufruf des Formulars, kein Zählpixel. Mail-Scanner werden am Browser-Kennzeichen ausgefiltert, soweit erkennbar.
ALTER TABLE inquiries ADD COLUMN first_opened_at timestamptz;
