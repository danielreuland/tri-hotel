-- Interne API (Hub danielreuland.com), Vertrag docs/internal-api.md.
-- Protokoll jedes Aufrufs: ohne Signatur und ohne Query-Werte (nur die Namen der Parameter), 90 Tage aufbewahrt.
CREATE TABLE internal_api_calls (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  app         text,                    -- X-Internal-App (NULL, wenn nicht angegeben)
  method      text NOT NULL,
  path        text NOT NULL,           -- z. B. /internal/v1/entities?q=&limit=
  status      smallint NOT NULL,
  duration_ms integer NOT NULL,
  reason      text                     -- Ablehnungsgrund (unauthorized: expired, bad_signature …)
);
CREATE INDEX internal_api_calls_at ON internal_api_calls (at);

-- Ereignisse an den Hub (Warteschlange mit Wiederholung). Inhalt nur bis zur Zustellung, danach NULL; nach 90 Tagen gelöscht.
CREATE TABLE hub_events (
  id           uuid PRIMARY KEY,                 -- Ereignis-ID (Hub verarbeitet idempotent)
  type         text NOT NULL,                    -- inquiry.sent | inquiry.answered | contact.profile | contact.consent | photos.permission
  entity_id    uuid REFERENCES entities(id) ON DELETE SET NULL,
  payload      jsonb,                            -- vollständiges Ereignis, NULL nach Zustellung/Verwerfen
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  attempts     smallint NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_events_pending ON hub_events (created_at) WHERE status = 'pending';
