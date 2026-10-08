-- Ergänzt das Punkteschema der Triathlon-Kriterien um
--   "labels": lesbare Texte je Ausprägung (Hotelseite, Admin, Absagebegründung)
--   "auto":   Regel für die automatische Ermittlung aus OpenStreetMap (Overpass)
--
-- Format "auto" (ausgewertet in services/geo.js, für alle Rankings gleich):
--   {"source":"osm","selectors":["[\"tag\"=\"wert\"]..."],"radius_km":n,
--    "options":[{"within_km":n,"option":"<opt>"}],   -- option: erste passende Distanz
--    "bool_within_km":n,                              -- bool: Treffer innerhalb n km = true
--    "if_missing":"<opt>",                            -- nichts im Radius gefunden
--    "if_unmatched":"<opt>",                          -- gefunden, aber keine Distanz passt
--    "note":"..."}                                    -- Hinweis, erscheint als Fundstelle
-- "ask_submitter": true -> Kriterium erscheint als optionales Feld im Meldeformular
-- Automatisch ermittelte Werte sind Vorschläge (Vertrauensstufe 4), der Admin prüft.

UPDATE criteria c SET scoring = c.scoring || v.patch::jsonb
FROM rankings r, (VALUES
('swim_pool', '{
  "ask_submitter":true,
  "labels":{"pool_50_hotel":"50-m-Becken im Hotel","pool_25_hotel":"25-m-Becken im Hotel",
            "pool_50_within_5km":"50-m-Becken ≤ 5 km","pool_25_within_5km":"25-m-Becken ≤ 5 km",
            "none":"kein Becken ≥ 25 m im Umkreis von 5 km"},
  "auto":{"source":"osm","radius_km":5,
          "selectors":["[\"leisure\"=\"swimming_pool\"][\"access\"!~\"private\"]","[\"leisure\"=\"sports_centre\"][\"sport\"=\"swimming\"]"],
          "if_missing":"none",
          "note":"Kein öffentlich zugängliches Schwimmbad in OpenStreetMap im Umkreis von 5 km gefunden."}}'),
('swim_lanes', '{"labels":{"reserved_guaranteed":"garantiert","on_request":"auf Anfrage","none":"nein"}}'),
('swim_open_water', '{
  "labels":{"within_1km":"sicherer Zugang ≤ 1 km","within_5km":"≤ 5 km","none":"nein"},
  "auto":{"source":"osm","radius_km":5,"selectors":["[\"natural\"=\"beach\"]","[\"leisure\"=\"bathing_place\"]"],
          "options":[{"within_km":1,"option":"within_1km"},{"within_km":5,"option":"within_5km"}],
          "if_missing":"none","note":"Strand/Badestelle laut OpenStreetMap, Luftlinie."}}'),
('bike_storage', '{"ask_submitter":true,"labels":{"lockable_cctv":"abschließbar + videoüberwacht","lockable":"abschließbar","room_only":"nur Rad aufs Zimmer","none":"keine"}}'),
('bike_rental', '{"labels":{"premium_in_hotel":"hochwertige Renn-/Zeitfahrräder im Hotel","within_2km":"Verleih ≤ 2 km","none":"keiner"}}'),
('run_track', '{
  "auto":{"source":"osm","radius_km":5,"selectors":["[\"leisure\"=\"track\"][\"sport\"~\"athletics|running\"]"],
          "bool_within_km":5,"note":"Laufbahn laut OpenStreetMap, Luftlinie."}}'),
('run_treadmill', '{"labels":{"incline":"mit Steigung/Gefälle","basic":"einfach","none":"keins"}}'),
('log_airport', '{
  "labels":{"within_60min":"≤ 60 min","within_90min":"≤ 90 min","longer":"länger als 90 min"},
  "auto":{"source":"osm","radius_km":150,"selectors":["[\"aeroway\"=\"aerodrome\"][\"iata\"]"],
          "options":[{"within_km":50,"option":"within_60min"},{"within_km":90,"option":"within_90min"}],
          "if_missing":"longer","if_unmatched":"longer",
          "note":"Grobe Schätzung aus der Luftlinie zum nächsten Verkehrsflughafen; Radkoffer-Transfer nicht geprüft."}}'),
('log_laundry', '{"labels":{"same_day":"Same-Day","next_day":"nächster Tag","drying_room_only":"nur Trockenraum","none":"keiner"}}')
) AS v(code, patch)
WHERE r.code = 'triathlon-hotel' AND c.ranking_id = r.id AND c.code = v.code;
