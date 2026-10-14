-- Radgarage: „nur Rad aufs Zimmer“ -> „Rad aufs Zimmer“, gleiche Punkte wie „abschließbar + videoüberwacht“ (4 -> 6).
UPDATE criteria c SET
  scoring = jsonb_set(jsonb_set(c.scoring, '{labels,room_only}', '"Rad aufs Zimmer"'), '{points,room_only}', '6'),
  version = c.version + 1
FROM rankings r WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.code = 'bike_storage';
-- Scores danach neu berechnen (npm run recompute)
