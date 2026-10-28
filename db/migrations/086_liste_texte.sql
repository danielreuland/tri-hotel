-- Eigene Suchmaschinen-Texte für die Hotelliste (/hotels): bisher „Hotels im Ranking nach TriScore“ und dieselbe
-- Beschreibung wie die Startseite. Die Liste zielt auf „Triathlon-Hotel Ranking / Trainingslager-Hotels“, die Startseite
-- bleibt beim Vergleich. Platzhalter {anzahl}, {score} füllt die Seite.
UPDATE rankings SET content = content || jsonb_build_object(
  'list_title', 'Triathlon-Hotel-Ranking: {anzahl} Hotels fürs Trainingslager',
  'list_h1', 'Triathlon-Hotels im Ranking',
  'list_description', '{anzahl} Hotels fürs Triathlon-Trainingslager nach {score} sortiert: Becken, Radrevier, Laufen und Küche geprüft. Filter nach Land, Monat und Leistungen.'
), updated_at = now() WHERE code = 'triathlon-hotel';
