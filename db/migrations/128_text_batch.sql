-- B-31 Punkt 4: Sammellauf für Beschreibungstexte. Je Objekt und Ranking ein Auftrag mit Stand; erzeugt werden nur Entwürfe,
-- freigegeben wird im Admin (einzeln oder gesammelt für Entwürfe ohne Prüfhinweis).
CREATE TABLE text_batch_items (
  id            bigserial PRIMARY KEY,
  ranking_id    uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  entity_id     uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'skipped', 'failed')),
  message       text,
  requested_by  uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
-- Ein Objekt höchstens einmal gleichzeitig in Arbeit
CREATE UNIQUE INDEX text_batch_items_open ON text_batch_items (entity_id, ranking_id) WHERE status IN ('queued', 'running');
CREATE INDEX text_batch_items_ranking ON text_batch_items (ranking_id, requested_at DESC);
