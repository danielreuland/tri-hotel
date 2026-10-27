-- Redaktionstext je Region (Landschaft, Klima und Reisezeit, Strecken und Gewässer, Anreise, Ruhetag, Fazit) für eigenen,
-- einzigartigen Inhalt der Regionsseiten. Entwurf per KI aus unseren Regionsdaten plus allgemein bekanntem Wissen
-- (Landschaft, Orte, bekannte Strecken, Flughäfen) – öffentlich erst nach Prüfung und Freigabe durch den Admin.
-- Kein Wikipedia-Text als Vorlage (Lizenz, nicht eigenständig).
CREATE TABLE region_texts (
  region_id          uuid PRIMARY KEY REFERENCES regions(id) ON DELETE CASCADE,
  summary            text NOT NULL DEFAULT '',     -- ein Satz, zugleich Meta-Beschreibung (max. 160 Zeichen)
  body               text NOT NULL DEFAULT '',     -- Absätze durch Leerzeile, Zwischenüberschriften mit "## "
  notes              text,                         -- redaktionelle Notizen als zusätzliche Grundlage für den Entwurf
  generated_summary  text,
  generated_body     text,
  input_hash         text,
  model              text,
  generated_at       timestamptz,
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at       timestamptz,
  published_by       uuid REFERENCES admin_users(id),
  updated_by         uuid REFERENCES admin_users(id),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
