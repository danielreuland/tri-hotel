-- Regions- und Länderseiten: Titel und H1 nach Suchbegriffen („Trainingslager Fuerteventura“) statt „Ranking nach TriScore“.
-- Vorlagen in den Landingpage-Texten des Rankings, Platzhalter {in} („auf Fuerteventura“), {name}, {anzahl}, {objekte}, {score}.
-- Kriterium Radrevier: Beschriftung passend zur automatischen Einstufung aus OpenStreetMap (war „Admin-Einstufung 0–10“).
UPDATE rankings SET content = jsonb_build_object(
  'area_title', 'Triathlon-Trainingslager {in}: Hotels, Klima & Radrevier',
  'area_h1', 'Triathlon-Trainingslager {in}',
  'area_subline', 'Triathlon-Hotels im Vergleich – geprüft und nach {score} sortiert'
) || COALESCE(content, '{}'::jsonb)
WHERE code = 'triathlon-hotel';

UPDATE criteria SET label = 'Radrevier (ruhige Straßen, Verkehr, Gelände, Radrouten)'
 WHERE code = 'bike_terrain' AND label = 'Radrevier (Verkehr, Asphalt, Höhenmeter-Mix) – Admin-Einstufung 0–10';
