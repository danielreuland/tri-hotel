-- Abfragen bei externen Diensten mit Kontingent (z. B. Hunter.io): Zählung für die Monatsgrenze und Nachvollziehbarkeit.
-- Keine gefundenen Adressen hier – nur Dienst, Zweck, Bezug und Anzahl Treffer.
CREATE TABLE api_usage (
  id               bigserial PRIMARY KEY,
  service          text NOT NULL,                    -- 'hunter'
  purpose          text NOT NULL,                    -- 'contact_email'
  entity_id        uuid REFERENCES entities(id) ON DELETE SET NULL,
  camp_provider_id uuid REFERENCES camp_providers(id) ON DELETE SET NULL,
  query            text,                             -- abgefragte Domain
  results          integer NOT NULL DEFAULT 0,
  ok               boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_usage_service_idx ON api_usage (service, created_at);
