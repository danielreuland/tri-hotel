-- Messstationen (NOAA, gemeinfrei): Wind aus stündlichen Meldungen (ISD), Regentage aus Tageswerten (GHCN-Daily).
-- Die Modellwerte von Open-Meteo bleiben in *_model erhalten; die angezeigten Spalten enthalten den Stationswert, wo es
-- einen gibt (sonst den Modellwert). Vergleich mit 11 Stationen 2023–2024: Modell-Wind an Küsten deutlich zu niedrig,
-- im Mittel 18 Regentage im Jahr zu viel; die Temperatur bleibt beim Modell.
CREATE TABLE weather_stations (
  id          text PRIMARY KEY,                 -- 'isd:60030099999' | 'ghcn:SPE00120215'
  source      text NOT NULL CHECK (source IN ('isd', 'ghcn')),
  code        text NOT NULL,                    -- Stationskennung bei NOAA
  name        text NOT NULL,
  lat         numeric(9,6) NOT NULL,
  lng         numeric(9,6) NOT NULL,
  elevation_m numeric(6,1),
  period      text NOT NULL,                    -- Zeitraum der Monatswerte, z. B. '2023–2025'
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE weather_station_monthly (
  station_id  text NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  month       smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  wind_kmh    numeric(4,1),     -- Ø Wind (Mittel der Tagesmittel, 10 m), nur ISD
  windy_days  numeric(4,1),     -- Tage mit Starkwind (Stundenmittel ≥ 40 km/h) je Monat, nur ISD
  rain_days   numeric(4,1),     -- Tage mit ≥ 1 mm Niederschlag je Monat, nur GHCN
  days        integer NOT NULL, -- Tage mit Messwerten in diesem Kalendermonat (alle Jahre)
  PRIMARY KEY (station_id, month)
);

-- Zuordnung: {"id", "name", "distance_km", "period"}
ALTER TABLE regions ADD COLUMN wind_station jsonb, ADD COLUMN rain_station jsonb;

ALTER TABLE region_climate_monthly
  ADD COLUMN wind_kmh_model numeric(4,1),
  ADD COLUMN windy_days_model numeric(4,1),
  ADD COLUMN rain_days_model numeric(4,1);
UPDATE region_climate_monthly SET wind_kmh_model = wind_kmh, windy_days_model = windy_days, rain_days_model = rain_days;

ALTER TABLE climate_monthly ADD COLUMN rain_days_model numeric(4,1);
UPDATE climate_monthly SET rain_days_model = rain_days;
