-- Trainingsregionen, Schritt 1: Klima je Monat für den Regionsmittelpunkt (unabhängig von Hotels), mit Wind, Sonne und
-- Wassertemperatur (nächster Meerespunkt innerhalb der Region; Binnenregionen ohne). Quelle Open-Meteo, Mittel der letzten
-- drei vollen Jahre. Das Radrevier je Region steht weiter in bike_areas (jetzt auch für Regionen ohne Hotels).
CREATE TABLE region_climate_monthly (
  region_id    uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  month        smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  avg_high_c   numeric(4,1),
  avg_low_c    numeric(4,1),
  rain_days    numeric(4,1),     -- Tage mit ≥ 1 mm Niederschlag
  wind_kmh     numeric(4,1),     -- mittlere Windgeschwindigkeit (10 m), km/h
  windy_days   numeric(4,1),     -- Tage mit Spitzenwind ≥ 40 km/h (Mittel je Monat)
  sunshine_h   numeric(4,1),     -- Sonnenstunden je Tag
  sea_c        numeric(4,1),     -- Wassertemperatur (Meer), NULL im Binnenland
  PRIMARY KEY (region_id, month)
);

ALTER TABLE regions ADD COLUMN IF NOT EXISTS data_computed_at timestamptz;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS data_error text;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS sea_point jsonb;  -- {lat, lng, distance_km} des Meerespunkts für die Wassertemperatur
