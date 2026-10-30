-- Camp-Anbieter für Hybrid-/Fitness-Racing (HYROX-Format) gehören jetzt auch zum Thema der Site (Fitness-Racing-Ranking).
UPDATE sites SET camp_topic = 'Trainingscamps für Triathlon und Ausdauersport (Schwimmen, Radfahren, Laufen), auch einzelne Disziplinen, sowie Hybrid- bzw. Fitness-Racing-Camps (Laufen plus funktionelle Kraftstationen im HYROX-Format)'
 WHERE code = 'tri-hotel';

-- Je Anbieter abschaltbar: die automatische Prüfung legt gefundene, unbekannte Hotels als Meldungen an (Standard wie bisher)
ALTER TABLE camp_providers ADD COLUMN hotel_submissions boolean NOT NULL DEFAULT true;
