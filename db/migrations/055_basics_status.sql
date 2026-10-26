-- Grunddaten vor der Auto-Prüfung: Website, Google-Eintrag (Place ID) und Koordinaten müssen vorliegen.
-- Fehlt etwas, wartet die Meldung im Status 'basics', bis der Admin es ergänzt; danach läuft die Prüfung automatisch weiter.
-- Herkunft der Grunddaten steht in entities.attributes (geo_source, geo_manual, geo_suggestion, google_place_source,
-- no_website, no_google_place) – keine neuen Spalten nötig.
ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'basics' AFTER 'auto_check';
