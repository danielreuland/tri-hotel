-- Redaktioneller Beschreibungstext je Objekt und Ranking.
-- Entwurf wird aus geprüften Fakten erzeugt (KI) oder von Hand geschrieben; öffentlich erst nach Freigabe.
-- input_hash = Fingerabdruck der Fakten beim Erzeugen; weicht er ab, gilt der Text als veraltet.
CREATE TABLE entity_texts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  ranking_id    uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  summary       text NOT NULL DEFAULT '',     -- ein Satz, zugleich Meta-Beschreibung (max. 160 Zeichen)
  body          text NOT NULL DEFAULT '',     -- Absätze durch Leerzeile getrennt, Zwischenüberschriften mit "## "
  input_hash    text,
  model         text,                         -- erzeugendes Modell (NULL = von Hand)
  generated_at  timestamptz,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at  timestamptz,
  published_by  uuid REFERENCES admin_users(id),
  updated_by    uuid REFERENCES admin_users(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, ranking_id)
);
