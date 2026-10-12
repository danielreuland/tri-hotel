-- Kanban-Board „Aufgaben“: Karten aus automatischen Quellen (Prüfbericht, Betreiber-Antwort, Anfrage-Entwurf …)
-- und eigene Aufgaben. Spalten: open | in_progress | done. Zuweisung an ein Team-Mitglied.
CREATE TABLE admin_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL,                 -- review | answers | draft | inquiry_failed | recheck | image_rights | stuck | unconfirmed | manual
  source_key    text UNIQUE,                   -- eindeutiger Anlass, z. B. 'review:<entity>:<ranking>'; NULL bei eigenen Aufgaben
  title         text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '[]',   -- Zeilen der Karte: [{ "level": "block|todo|hint", "text": "…" }]
  link          text,                          -- Ziel im Admin
  entity_id     uuid REFERENCES entities(id) ON DELETE CASCADE,
  fingerprint   text,                          -- ändert sich der Anlass, wird eine erledigte Karte wieder geöffnet
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  position      integer NOT NULL DEFAULT 0,
  assignee_id   uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  done_auto     boolean NOT NULL DEFAULT false, -- vom System erledigt (Anlass entfallen)
  done_at       timestamptz,
  done_by       uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_tasks_board_idx ON admin_tasks (status, position);
-- Anzeigename im Team (für Zuweisung und Kürzel auf den Karten)
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS display_name text;
