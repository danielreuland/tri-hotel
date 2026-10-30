-- Fitness-Racing-Ranking (Hyrox & Co., Score „HybridScore“) als Entwurf – Kriterienkatalog mit Daniel abgestimmt (30.10.2026),
-- Summe genau 100. Zieldomain fitnessracing-hotel.de (Site in der App folgt); bis dahin auf der Standard-Site, als Entwurf
-- öffentlich unsichtbar. HYROX ist eine Marke: nur beschreibend nennen, kein Logo.
-- Geteilte Werte (share_key = Code) mit dem Triathlon-Ranking: Sauna, Kältebad, Physio/Massage, 400-m-Bahn, Flughafen.

-- 1. Geteilte Kriterien im Triathlon-Ranking markieren
UPDATE criteria c SET share_key = c.code
FROM rankings r
WHERE r.id = c.ranking_id AND r.code = 'triathlon-hotel'
  AND c.code IN ('rec_sauna', 'rec_ice_bath', 'rec_physio', 'run_track', 'log_airport');

-- 2. Ranking
INSERT INTO rankings (code, slug, name, score_name, description, entity_type, entity_label_sg, entity_label_pl,
                      is_default, formula, labels, status, site_id, content, review_config)
SELECT 'fitness-racing-hotel', 'fitness-racing-hotels', 'Fitness-Racing-Hotels', 'HybridScore',
       'Hotels für Fitness-Racing- und Hybrid-Training (z. B. Hyrox), bewertet nach geprüften Fakten.',
       'hotel', 'Hotel', 'Hotels', false,
       (t.formula - 'best_time') || '{"best_time":{"metric":"avg_high_c","min":10,"max":25}}'::jsonb,
       '[{"min":85,"label":"Top"},{"min":70,"label":"Sehr gut geeignet"},{"min":55,"label":"Geeignet"},{"min":0,"label":"Eingeschränkt geeignet"}]'::jsonb,
       'draft', t.site_id,
       '{"hero_title":"Das richtige Hotel fürs Fitness-Racing-Training",
         "hero_text":"Schlitten, SkiErg und eine Laufrunde direkt vor der Tür: Der HybridScore bewertet Hotels nach dem, was im Hybrid-Training zählt. Jeder Wert mit Quelle und Prüfdatum.",
         "list_h1":"Fitness-Racing-Hotels im Ranking",
         "method_h1":"So bewerten wir Hotels fürs Fitness Racing: der {score}",
         "method_intro":"Ein gutes Hotel für Fitness-Racing-Training (z. B. Hyrox) braucht die Geräte der Wettkampfstationen, Platz für Laufen im Wechsel und Erholung zwischen den Einheiten. Der {score} bewertet jedes Hotel nach denselben {kriterien} Kriterien aus {bereiche} und fasst sie in einer Zahl von 0 bis 100 zusammen. Unabhängiges Portal, nicht mit HYROX verbunden."}'::jsonb,
       '{"enabled":false}'::jsonb
FROM rankings t WHERE t.code = 'triathlon-hotel'
ON CONFLICT DO NOTHING;

-- 3. Kategorien
INSERT INTO ranking_categories (ranking_id, code, label, sort_order)
SELECT r.id, v.code, v.label, v.sort_order
FROM rankings r, (VALUES
  ('stations',  'Stationen & Kraft',   1),
  ('coaching',  'Training & Coaching', 2),
  ('run',       'Laufen',              3),
  ('recovery',  'Regeneration',        4),
  ('food',      'Verpflegung',         5),
  ('logistics', 'Logistik & Klima',    6)
) AS v(code, label, sort_order)
WHERE r.code = 'fitness-racing-hotel';

-- 4. Kriterien (A 40 · B 18 · C 17 · D 12 · E 7 · F 6 = 100)
INSERT INTO criteria (ranking_id, category_id, code, label, value_type, scoring, max_points, sort_order, link_source, share_key)
SELECT r.id, k.id, v.code, v.label, v.value_type::criterion_value_type, COALESCE(v.scoring, '{}')::jsonb, v.max_points, v.sort_order, v.link_source, v.share_key
FROM rankings r
JOIN (VALUES
-- A. Stationen & Kraft (40)
('hy_sled', 'stations', 'Schlitten (Push & Pull)', 'bool',
 '{"type":"bool","points_true":9,"search_terms":["Schlitten","Gewichtsschlitten","Sled","Sled Push","Sled Pull","Prowler","Power Sled","trineo","slitta"]}', 9, 10, NULL, NULL),
('hy_skierg', 'stations', 'SkiErg', 'option',
 '{"type":"option","points":{"two_plus":5,"one":3,"none":0},"labels":{"two_plus":"mindestens 2","one":"1","none":"keiner"},"search_terms":["SkiErg","Ski-Erg","Skiergometer","Concept2 SkiErg","Ski Ergometer"]}', 5, 20, NULL, NULL),
('hy_row', 'stations', 'Rudergerät', 'option',
 '{"type":"option","points":{"two_plus":4,"one":2,"none":0},"labels":{"two_plus":"mindestens 2","one":"1","none":"keins"},"search_terms":["Rudergerät","Ruderergometer","RowErg","Concept2","Indoor Rower","Rowing Machine","remo"]}', 4, 30, NULL, NULL),
('hy_wall_balls', 'stations', 'Wall Balls', 'option',
 '{"type":"option","points":{"balls_target":4,"balls_only":2,"none":0},"labels":{"balls_target":"Bälle (4/6/9 kg) und Zielmarke 2,70/3,00 m","balls_only":"nur Bälle","none":"keine"},"search_terms":["Wall Ball","Wallball","Medizinball","Medicine Ball","Zielmarke"]}', 4, 40, NULL, NULL),
('hy_carry', 'stations', 'Farmers Carry & Lunges (Kettlebells, Sandbags)', 'option',
 '{"type":"option","points":{"complete":4,"partial":2,"none":0},"labels":{"complete":"Kettlebell-Paare bis 32 kg und Sandbags 10–30 kg","partial":"teilweise","none":"keine"},"search_terms":["Kettlebell","Kettlebells","Sandbag","Sandsack","Farmers Carry","Farmer’s Walk","Lunges"]}', 4, 50, NULL, NULL),
('hy_barbell', 'stations', 'Olympische Langhantel mit Rack und Hantelscheiben', 'bool',
 '{"type":"bool","points_true":4,"search_terms":["Langhantel","Olympiahantel","Olympische Langhantel","Hantelscheiben","Bumper Plates","Squat Rack","Power Rack","Kniebeugenständer","Barbell","Rack"]}', 4, 60, NULL, NULL),
('hy_floor', 'stations', 'Freie Fläche ≥ 20 m für Burpee Broad Jumps und Lunges', 'bool',
 '{"type":"bool","points_true":2,"search_terms":["Functional Area","Functional-Training-Fläche","Kunstrasen","Turf","Trainingsfläche"]}', 2, 70, NULL, NULL),
('hy_gym_hours', 'stations', 'Gym-Öffnungszeiten', 'option',
 '{"type":"option","points":{"h24":3,"h14":1,"shorter":0},"labels":{"h24":"rund um die Uhr","h14":"mindestens 14 Stunden täglich","shorter":"kürzer"},"search_terms":["Öffnungszeiten Fitness","Fitnessraum 24/7","24 Stunden geöffnet","rund um die Uhr"]}', 3, 80, NULL, NULL),
('hy_bonus_stations', 'stations', 'Bonus: alle Stationen trainierbar', 'bonus',
 '{"type":"bonus","requires":["hy_sled","hy_skierg","hy_row","hy_wall_balls","hy_carry"],"points":5}', 5, 90, NULL, NULL),
-- B. Training & Coaching (18)
('hy_training_club', 'coaching', 'Offizieller HYROX Training Club', 'option',
 '{"type":"option","points":{"in_hotel":6,"within_5km":4,"within_15km":2,"none":0},"labels":{"in_hotel":"im Hotel","within_5km":"≤ 5 km","within_15km":"≤ 15 km","none":"keiner in der Nähe"},"search_terms":["HYROX Training Club","Hyrox Gym","Hyrox Affiliate","Hyrox-Partnergym"]}', 6, 10, NULL, NULL),
('hy_classes', 'coaching', 'Hyrox- / Hybrid-Kurse oder Coaching', 'option',
 '{"type":"option","points":{"regular":5,"on_request":3,"none":0},"labels":{"regular":"regelmäßig","on_request":"auf Anfrage","none":"nein"},"search_terms":["Hyrox Kurs","Hyrox Training","Hybrid Training","Fitness Racing","Functional Fitness Kurs","Personal Training"]}', 5, 20, NULL, NULL),
('hy_camps', 'coaching', 'Camps buchbar', 'bool',
 '{"type":"bool","points_true":4,"search_terms":["Hyrox Camp","Trainingscamp","Hybrid Camp","Bootcamp"]}', 4, 30, 'camp_providers', NULL),
('hy_simulation', 'coaching', 'Simulationsrennen (auch Doubles / Staffel)', 'bool',
 '{"type":"bool","points_true":3,"search_terms":["Simulation","Hyrox Simulation","Hyrox Sim","Mock Race","Probewettkampf"]}', 3, 40, NULL, NULL),
-- C. Laufen (17)
('hy_run_loop', 'run', 'Flache Laufrunde ab Hotel (Wechsel Laufen – Station)', 'rating',
 '{"type":"rating","min":0,"max":6}', 6, 10, NULL, NULL),
('hy_run_from_gym', 'run', 'Laufen direkt aus dem Gym heraus', 'bool',
 '{"type":"bool","points_true":3}', 3, 20, NULL, NULL),
('run_track', 'run', '400-m-Bahn ≤ 5 km', 'bool',
 NULL, 4, 30, NULL, 'run_track'),
('hy_treadmill', 'run', 'Laufbänder', 'option',
 '{"type":"option","points":{"two_plus_curved":4,"two_plus":2,"fewer":0},"labels":{"two_plus_curved":"mindestens 2, davon ein Curved Treadmill","two_plus":"mindestens 2","fewer":"weniger als 2"},"search_terms":["Laufband","Curved Treadmill","Curve","Woodway","Assault Runner","Treadmill"]}', 4, 40, NULL, NULL),
-- D. Regeneration (12)
('rec_sauna', 'recovery', 'Sauna / Spa', 'bool', NULL, 3, 10, NULL, 'rec_sauna'),
('rec_ice_bath', 'recovery', 'Eisbad / Kältebad', 'bool', NULL, 3, 20, NULL, 'rec_ice_bath'),
('rec_physio', 'recovery', 'Physio / Sportmassage im Haus', 'bool', NULL, 3, 30, NULL, 'rec_physio'),
('hy_recovery_tools', 'recovery', 'Recovery-Bereich (Faszienrollen, Massagepistolen, Kompressionsstiefel, Mobility-Fläche)', 'bool',
 '{"type":"bool","points_true":3,"search_terms":["Recovery","Faszienrolle","Massagepistole","Kompressionsstiefel","Normatec","Mobility","Stretching-Bereich"]}', 3, 40, NULL, NULL),
-- E. Verpflegung (7)
('hy_buffet_protein', 'food', 'Sportlerbuffet mit Proteinangebot', 'bool',
 '{"type":"bool","points_true":3,"search_terms":["Sportlerbuffet","Proteinfrühstück","High Protein","Sportlerernährung"]}', 3, 10, NULL, NULL),
('hy_meal_times', 'food', 'Essenszeiten passend zum Training (früh / spät)', 'bool',
 '{"type":"bool","points_true":2,"search_terms":["Frühstück ab","Early Breakfast","späte Essenszeiten"]}', 2, 20, NULL, NULL),
('hy_shakes', 'food', 'Shakes und Snacks am Gym', 'bool',
 '{"type":"bool","points_true":2,"search_terms":["Proteinshake","Shake-Bar","Smoothie","Snacks"]}', 2, 30, NULL, NULL),
-- F. Logistik & Klima (6)
('log_airport', 'logistics', 'Flughafen-Distanz', 'option', NULL, 2, 10, NULL, 'log_airport'),
('hy_climate', 'logistics', 'Klima fürs Lauftraining (Ø Tageshöchstwert im Reisemonat)', 'number',
 '{"type":"climate","metric":"avg_high_c","bands":[{"min":10,"max":25,"points":2},{"min":5,"max":9.9,"points":1},{"min":25.1,"max":30,"points":1}]}', 2, 20, NULL, NULL),
('hy_day_pass', 'logistics', 'Tagespass fürs Gym (Trainingspartner ohne Übernachtung)', 'bool',
 '{"type":"bool","points_true":2,"search_terms":["Tagespass","Day Pass","Gym für externe Gäste","Fitness für Nicht-Hotelgäste"]}', 2, 30, NULL, NULL)
) AS v(code, category, label, value_type, scoring, max_points, sort_order, link_source, share_key) ON true
JOIN ranking_categories k ON k.ranking_id = r.id AND k.code = v.category
WHERE r.code = 'fitness-racing-hotel';

-- 5. Geteilte Kriterien: Punkteschema vom Triathlon-Kriterium übernehmen (gleiche Ausprägungen, Auto-Regeln,
--    Suchbegriffe), nur die Punkte an den Fitness-Racing-Katalog anpassen
UPDATE criteria h SET scoring = CASE
    WHEN t.scoring->>'type' = 'bool' THEN t.scoring || jsonb_build_object('points_true', h.max_points)
    WHEN h.code = 'log_airport' THEN t.scoring || '{"points":{"within_60min":2,"within_90min":1,"longer":0}}'::jsonb
  END
FROM criteria t, rankings rh, rankings rt
WHERE rh.id = h.ranking_id AND rh.code = 'fitness-racing-hotel'
  AND rt.id = t.ranking_id AND rt.code = 'triathlon-hotel'
  AND h.share_key IS NOT NULL AND t.share_key = h.share_key;

-- 6. Vorhandene Werte der geteilten Kriterien übernehmen
SELECT sync_shared_facts(k) FROM unnest(ARRAY['rec_sauna', 'rec_ice_bath', 'rec_physio', 'run_track', 'log_airport']) AS k;
