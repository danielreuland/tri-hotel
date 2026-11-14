-- Tripadvisor-Fotos als Platzhalter für Objekte ohne eigene Fotos (B-87, 14.11.2026). Vorgaben: docs/tripadvisor-fotos-umsetzung.md.
-- Von Tripadvisor gespeichert wird ausschließlich die Location ID – keine Bilder, Adressen, Namen oder Texte.

ALTER TABLE entities
  ADD COLUMN ta_location_id integer CHECK (ta_location_id > 0),
  ADD COLUMN ta_photos_enabled boolean NOT NULL DEFAULT false,
  -- gesetzt, sobald die ID auf der Allowlist bei Tripadvisor steht (APPEND bestätigt); leer nach DELETE
  ADD COLUMN ta_allowlisted_at timestamptz,
  -- Ergebnis der letzten Suche als Vormerkung: nur Status, Location IDs und Zeitpunkt, z. B.
  -- {"status":"found","id":123,"ids":[123,456],"at":"…"} – Status: found | unclear | none | dismissed
  ADD COLUMN ta_suggestion jsonb;

-- Eine Tripadvisor-Location gehört zu höchstens einem Objekt
CREATE UNIQUE INDEX entities_ta_location_idx ON entities (ta_location_id) WHERE ta_location_id IS NOT NULL;

-- Budget-Wächter: Zähler in abrechenbaren Einheiten („billable entities“) je Zeitraum.
-- period: 'm:2026-11' (Kalendermonat), 'd:2026-11-14' (Tag), 'total' (Lebensdauer des Kontos, für das Freikontingent).
-- Wird vor jedem Abruf atomar erhöht; Fehlerantworten (4xx/5xx) werden zurückgebucht.
CREATE TABLE ta_budget (
  period     text PRIMARY KEY,
  units      integer NOT NULL DEFAULT 0 CHECK (units >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Protokoll jedes Abrufs, ohne Inhalte: Zeit, Objekt, Endpunkt, Einheiten, Status, Dauer.
CREATE TABLE ta_calls (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  entity_id   uuid REFERENCES entities(id) ON DELETE SET NULL,
  endpoint    text NOT NULL,          -- photos | search | nearby | allowlist_get | allowlist_append | allowlist_delete
  units       integer NOT NULL DEFAULT 0,
  http_status integer,                -- leer = keine Antwort (Zeitüberschreitung, Netz) oder gar nicht abgerufen
  duration_ms integer,
  outcome     text NOT NULL           -- ok | error | timeout | month_limit | day_limit
);
CREATE INDEX ta_calls_created_idx ON ta_calls (created_at);
CREATE INDEX ta_calls_entity_idx ON ta_calls (entity_id, created_at);

-- Höchstens ein Fotoabruf je Besucher und Objekt in 30 Minuten: nur gehashte IP und Zeitpunkt, wird täglich geleert.
CREATE TABLE ta_view_locks (
  ip_hash    text NOT NULL,
  entity_id  uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, entity_id)
);
