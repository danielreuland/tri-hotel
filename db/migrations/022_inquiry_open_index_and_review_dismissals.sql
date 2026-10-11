-- Höchstens eine offene Anfrage je Objekt und Ranking – Entwürfe zählen mit
DROP INDEX IF EXISTS inquiries_one_open_idx;
CREATE UNIQUE INDEX inquiries_one_open_idx ON inquiries (entity_id, ranking_id) WHERE status IN ('draft', 'queued', 'sent');

-- Prüfbericht: vom Admin als erledigt markierte Punkte. Ändert sich der Punkt (fingerprint), erscheint er wieder.
CREATE TABLE review_dismissals (
  entity_id    uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  ranking_id   uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  item_key     text NOT NULL,
  fingerprint  text NOT NULL,
  dismissed_by uuid REFERENCES admin_users(id),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, ranking_id, item_key)
);
