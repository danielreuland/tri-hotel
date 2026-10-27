-- Klimapunkt je Region: Der Regionsmittelpunkt liegt auf Inseln oft im Gebirge (Teneriffa 2345 m am Teide, Gran Canaria
-- 1615 m, Kreta 1424 m) und drückt die Temperaturen um 8–10 °C. Klima kommt deshalb von einem typischen Ort:
-- climate_lat/lng vom Admin, sonst Lage der Hotels (Medoid), sonst tiefer gelegener Ort (≤ 400 m) nahe der Mitte.
-- climate_point speichert den verwendeten Punkt {lat, lng, elevation_m, source, place}.
ALTER TABLE regions ADD COLUMN IF NOT EXISTS climate_lat numeric(9,6);
ALTER TABLE regions ADD COLUMN IF NOT EXISTS climate_lng numeric(9,6);
ALTER TABLE regions ADD COLUMN IF NOT EXISTS climate_point jsonb;

-- Zypern hat noch keine Hotels; die Automatik landet in der Ebene bei Nikosia (Juli ~39 °C). Trainingslager liegen an der
-- Küste: Klimapunkt Limassol (Entscheidung Daniel, 27.10.2026). Im Admin änderbar.
UPDATE regions SET climate_lat = 34.690000, climate_lng = 33.040000 WHERE slug = 'zypern' AND climate_lat IS NULL;
