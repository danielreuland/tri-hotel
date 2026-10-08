-- Landingpage-Texte je Ranking (im Admin pflegbar, keine Texte im Code).
-- Schlüssel: hero_eyebrow, hero_title, hero_highlight (Teil des Titels, der hervorgehoben wird),
--            hero_text, cta_title, cta_text
ALTER TABLE rankings ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}';

UPDATE rankings SET content = '{
  "hero_eyebrow": "Neutral · geprüft · nicht käuflich",
  "hero_title": "Das richtige Hotel fürs Trainingslager",
  "hero_highlight": "Trainingslager",
  "hero_text": "Freie Bahnen um 7 Uhr, eine abschließbare Radgarage, eine ruhige Laufrunde ab der Tür: Der TriScore bewertet Hotels nach dem, was im Trainingslager zählt. Jeder Wert mit Quelle und Prüfdatum.",
  "cta_title": "Du kennst ein gutes Trainingshotel?",
  "cta_text": "Füge es hinzu. Wir prüfen die Fakten und nehmen es ins Ranking auf, kostenlos und unabhängig."
}'::jsonb
WHERE code = 'triathlon-hotel';
