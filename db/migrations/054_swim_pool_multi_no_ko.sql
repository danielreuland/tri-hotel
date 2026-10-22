-- Triathlon-Ranking, Kriterium „Becken“ (swim_pool):
-- 1. Kein K.O. mehr: Hotels ohne Becken ≥ 25 m im Umkreis von 5 km bleiben im Ranking, Schwimmen bekommt dann 0 Punkte.
-- 2. Mehrfachauswahl (scoring.multi): z. B. 25-m- und 50-m-Becken im Hotel oder 25 m im Hotel + 50 m im Umkreis.
--    Es zählt die beste Angabe (keine Addition), max. 12 Punkte wie bisher.
-- 3. Neue Ausprägung „Gegenstromanlage im Hotel“ (3 Punkte) – Ersatz, wenn kein Bahnenbecken da ist.
-- Der K.O.-Mechanismus selbst bleibt für andere Rankings erhalten (criteria.is_ko). Kriterienversion wird erhöht.
UPDATE criteria c SET
  is_ko = false,
  scoring = (c.scoring - 'ko')
    || jsonb_build_object('multi', true)
    || jsonb_build_object('points', (c.scoring->'points') || '{"counter_current_hotel":3}'::jsonb)
    || jsonb_build_object('labels', COALESCE(c.scoring->'labels', '{}'::jsonb) || '{"counter_current_hotel":"Gegenstromanlage im Hotel","none":"kein Becken ≥ 25 m im Umkreis von 5 km"}'::jsonb)
    || jsonb_build_object('search_terms', COALESCE(c.scoring->'search_terms', '[]'::jsonb)
         || '["Gegenstromanlage","Gegenstrom","Endless Pool","counter current","counter-current swimming","swim jet","contracorriente","nado contracorriente","controcorrente","nage à contre-courant"]'::jsonb),
  version = c.version + 1
FROM rankings r
WHERE r.id = c.ranking_id AND r.code = 'triathlon-hotel' AND c.code = 'swim_pool';

-- Leistung „Gegenstromanlage“ (aus dem Kriterium abgeleitet, filterbar)
INSERT INTO features (entity_type, code, label, group_label, sort_order, filterable, derive)
SELECT 'hotel', 'counter_current', 'Gegenstromanlage', 'Schwimmen', 12, true,
       '{"ranking":"triathlon-hotel","criterion":"swim_pool","values":["counter_current_hotel"]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM features WHERE entity_type = 'hotel' AND code = 'counter_current');

-- K.O.-Gründe aus der alten Regel verschwinden mit der Neuberechnung (scripts bzw. Admin „Scores neu berechnen“)
