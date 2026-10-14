-- Geführte Touren nach Leistungsgruppen: 5 -> 2 Punkte (Rad 33 -> 30, Summe 108 -> 105, wird normiert).
-- Kriterienversion wird erhöht; Scores danach neu berechnen (npm run recompute).
UPDATE criteria c SET
  scoring = c.scoring || '{"points_true":2}'::jsonb,
  max_points = 2, version = c.version + 1
FROM rankings r WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.code = 'bike_guided';
