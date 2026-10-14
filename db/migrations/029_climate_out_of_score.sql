-- Klima zählt nicht mehr im Score (Logistik & Klima 13 -> 8, Summe 105 -> 100). Wetter erscheint nur noch als Info
-- „Beste Reisezeit“: Monate mit Ø Tageshöchstwert im Bereich formula.best_time (Start: 16–28 °C).
UPDATE criteria c SET active = false, version = c.version + 1
FROM rankings r WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.scoring->>'type' = 'climate';

UPDATE ranking_categories rc SET label = 'Logistik'
FROM rankings r WHERE rc.ranking_id = r.id AND r.code = 'triathlon-hotel' AND rc.label = 'Logistik & Klima';

UPDATE rankings SET formula = formula || '{"best_time": {"metric": "avg_high_c", "min": 16, "max": 28}}'::jsonb
WHERE code = 'triathlon-hotel';
-- Scores danach neu berechnen (npm run recompute)
