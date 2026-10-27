-- Wassertemperatur je Hotel: nächste Meeres-Rasterzelle (Open-Meteo Marine, ca. 5 km Raster) in bis zu 10 km.
-- Modellwert vor der Küste; in Buchten oft wärmer (Hinweis auf der Seite). Punkt in entities.attributes.sea_point.
ALTER TABLE climate_monthly ADD COLUMN IF NOT EXISTS sea_c numeric(4,1);
