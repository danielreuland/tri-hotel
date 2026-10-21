-- Radrevier: Gebiete mit 50 km Radius (Rennradausfahrt 50+ km), Kacheln 0,5°. Schwellen an echten Daten ausgerichtet
-- (20.10.2026, 50 km): Mallorca ab Alcúdia 3394 km ruhige Straßen / 76 % / 39 Routen / Pässe bis 1366 m;
-- Fuerteventura 372 km / 38 % / 1 Route; Allgäu 7634 km / 73 % / 761 Routen.
-- Anstiege zählen auch über Pässe/Gipfel aus OSM (das Höhenraster trifft Gipfel selten).
UPDATE criteria c SET scoring = jsonb_set(c.scoring, '{auto}', (c.scoring->'auto') || '{
  "tile_deg":0.5, "tile_radius_km":50, "region_radius_km":[50,50],
  "network_km":[500,2000],
  "quiet_share":[0.5,0.75],
  "routes":[3,15],
  "climb_m":300, "min_passes":3, "flat_share":0.2, "flat_band_m":50
}'::jsonb)
FROM rankings r
WHERE r.id = c.ranking_id AND r.code = 'triathlon-hotel' AND c.code = 'bike_terrain'
  AND c.scoring->'auto'->>'source' = 'bike_area';

-- Profile mit 20/25 km sind überholt: neu berechnen lassen (Übersteuerungen gab es noch keine)
DELETE FROM bike_areas;
