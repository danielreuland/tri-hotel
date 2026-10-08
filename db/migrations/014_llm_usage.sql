-- Verbrauch je KI-Aufruf (Website-Extraktion, Anfrage-Entwurf, Modellvergleich):
-- Modell, Tokens und geschätzte Kosten, damit die Prüfansicht zeigt, was ein Objekt gekostet hat.
CREATE TABLE llm_usage (
  id                  bigserial PRIMARY KEY,
  purpose             text NOT NULL,                 -- extraction | inquiry | compare
  model               text NOT NULL,                 -- tatsächlich antwortendes Modell
  entity_id           uuid REFERENCES entities(id) ON DELETE SET NULL,
  submission_id       uuid REFERENCES submissions(id) ON DELETE SET NULL,
  inquiry_id          uuid REFERENCES inquiries(id) ON DELETE SET NULL,
  input_tokens        integer NOT NULL DEFAULT 0,
  output_tokens       integer NOT NULL DEFAULT 0,
  cache_read_tokens   integer NOT NULL DEFAULT 0,
  cache_write_tokens  integer NOT NULL DEFAULT 0,
  cost_usd            numeric(10,4) NOT NULL DEFAULT 0, -- Schätzung nach Preistabelle zum Zeitpunkt des Aufrufs
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX llm_usage_entity_idx ON llm_usage (entity_id, created_at DESC);
CREATE INDEX llm_usage_created_idx ON llm_usage (created_at);
