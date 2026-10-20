-- Weitere Quellen für automatische Vorschläge (Vertrauensstufe 4, der Admin prüft). Format siehe services/geo.js:
--   "auto" darf jetzt eine Liste sein – die erste Regel mit Ergebnis zählt.
--   source "osm" + "length_options": Becken mit Länge (OSM-Tag length oder aus der Geometrie gemessen)
--   source "eea_bathing": amtliche EU-Badestellen mit Wasserqualität (kein Treffer = kein Vorschlag, nicht „nein“)
--   source "terrain": Höhenunterschied im Umkreis (OpenTopoData); relief_max_m / relief_min_m → true, info_only → nur Kennzahl

UPDATE criteria c SET scoring = jsonb_set(c.scoring, '{auto}', v.auto::jsonb)
FROM rankings r, (VALUES
('swim_pool', '[
  {"source":"osm","radius_km":5,
   "selectors":["[\"leisure\"=\"swimming_pool\"][\"access\"!~\"private\"]","[\"leisure\"=\"swimming_pool\"][\"sport\"=\"swimming\"]"],
   "length_options":[{"min_m":48,"option":"pool_50_within_5km"},{"min_m":23,"option":"pool_25_within_5km"}],
   "note":"Becken laut OpenStreetMap; liegt es im Hotel selbst, bitte auf „im Hotel“ ändern."},
  {"source":"osm","radius_km":5,
   "selectors":["[\"leisure\"=\"swimming_pool\"][\"access\"!~\"private\"]","[\"leisure\"=\"sports_centre\"][\"sport\"=\"swimming\"]"],
   "if_missing":"none",
   "note":"Kein öffentlich zugängliches Schwimmbad in OpenStreetMap im Umkreis von 5 km gefunden."}]'),
('swim_open_water', '[
  {"source":"eea_bathing","radius_km":5,
   "options":[{"within_km":1,"option":"within_1km"},{"within_km":5,"option":"within_5km"}],
   "exclude_quality":["Poor"]},
  {"source":"osm","radius_km":5,"selectors":["[\"natural\"=\"beach\"]","[\"leisure\"=\"bathing_place\"]"],
   "options":[{"within_km":1,"option":"within_1km"},{"within_km":5,"option":"within_5km"}],
   "if_missing":"none","note":"Strand/Badestelle laut OpenStreetMap, Luftlinie."}]'),
('bike_rental', '{"source":"osm","radius_km":2,
   "selectors":["[\"amenity\"=\"bicycle_rental\"]","[\"shop\"=\"bicycle\"][\"service:bicycle:rental\"=\"yes\"]"],
   "options":[{"within_km":2,"option":"within_2km"}],
   "note":"Radverleih laut OpenStreetMap, Luftlinie – ob Renn-/Zeitfahrräder dabei sind, bitte prüfen."}'),
('run_flat_loop', '{"source":"terrain","radius_km":2,"relief_max_m":30,
   "note":"Sehr flaches Gelände ums Hotel – ob es eine verkehrsarme Runde ≥ 5 km gibt, bitte prüfen."}'),
('run_trails', '{"source":"terrain","radius_km":2,"relief_min_m":120,
   "note":"Deutliche Höhenunterschiede ums Hotel – ob Trails nah erreichbar sind, bitte prüfen."}'),
('bike_terrain', '{"source":"terrain","radius_km":10,"info_only":true}')
) AS v(code, auto)
WHERE r.id = c.ranking_id AND r.code = 'triathlon-hotel' AND c.code = v.code;
