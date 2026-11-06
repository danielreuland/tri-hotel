-- Morgenbericht: Antworten von Betreibern hängen am Ranking der Anfrage. Hier steht, welches Ranking zu einer Domain gehört,
-- solange die Domain keine eigene Site der App ist. Rankings ohne Eintrag zählen zur ersten Domain (wie Klicks ohne Herkunft).
ALTER TABLE funnel_domains ADD COLUMN ranking_id uuid REFERENCES rankings(id) ON DELETE SET NULL;
UPDATE funnel_domains SET ranking_id = (SELECT id FROM rankings WHERE code = 'fitness-racing-hotel') WHERE domain = 'fitnessracing-hotel.de';
