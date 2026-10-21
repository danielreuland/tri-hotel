-- Radrevier je Gebiet statt je Hotel: Profil aus OpenStreetMap (Straßennetz, Verkehr, Radrouten) und Höhendaten,
-- einmal je Region (sonst je Rasterkachel) berechnet und zwischengespeichert. Hotels im selben Gebiet bekommen dieselbe
-- Grundwertung, dazu eine kleine Anpassung am Hotel (z. B. kaum ruhige Straßen in direkter Umgebung).
-- Der Admin kann Teilwertungen je Gebiet übersteuern; das gilt dann für alle Hotels dort (nur für unbestätigte Vorschläge).

CREATE TABLE bike_areas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text UNIQUE NOT NULL,            -- 'region:<uuid>' | 'tile:<lat>:<lng>'
  region_id    uuid REFERENCES regions(id) ON DELETE CASCADE,
  name         text NOT NULL,                   -- Anzeige, z. B. „Mallorca“ oder „Gebiet um 47,75 / 13,25“
  lat          numeric(9,6) NOT NULL,
  lng          numeric(9,6) NOT NULL,
  radius_km    numeric(6,1) NOT NULL,
  metrics      jsonb NOT NULL DEFAULT '{}',     -- Rohwerte: km je Straßenklasse, ruhige km, Radrouten, Höhen …
  subscores    jsonb NOT NULL DEFAULT '{}',     -- berechnet: {"network":2,"traffic":1,"terrain":2,"routes":1}
  override     jsonb NOT NULL DEFAULT '{}',     -- Admin: {"network":1,…,"note":"…"} – überschreibt einzelne Teilwertungen
  score        numeric(3,1),                    -- Summe (mit Übersteuerung), 0–6
  computed_at  timestamptz,
  error        text,
  updated_by   uuid REFERENCES admin_users(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bike_areas_region_idx ON bike_areas (region_id);

-- Regel für das Kriterium „Radrevier“: Schwellen und Beschriftungen stehen hier, nicht im Code
UPDATE criteria c SET scoring = jsonb_set(c.scoring, '{auto}', '{
  "source":"bike_area",
  "tile_deg":0.25, "tile_radius_km":20, "region_radius_km":[15,40], "max_age_days":365,
  "network_km":[150,400],
  "quiet_share":[0.6,0.8],
  "routes":[1,5],
  "climb_m":300, "flat_share":0.2, "flat_band_m":50,
  "hotel_radius_km":2, "hotel_min_quiet_km":3,
  "labels":{"network":"Netz","traffic":"Verkehr","terrain":"Flach & Berg","routes":"Routen"},
  "max":{"network":2,"traffic":1,"terrain":2,"routes":1}
}'::jsonb)
FROM rankings r
WHERE r.id = c.ranking_id AND r.code = 'triathlon-hotel' AND c.code = 'bike_terrain';
