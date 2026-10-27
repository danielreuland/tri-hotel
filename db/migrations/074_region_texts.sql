-- Redaktionstext je Region (Landschaft, Klima und Reisezeit, Radfahren, Schwimmen, Laufen, Anreise, Ruhetag, Fazit) für
-- eigenen, einzigartigen Inhalt der Regionsseiten (gegen „Thin Content“). Texte werden redaktionell geschrieben und per
-- Migration eingespielt (keine Admin-Bearbeitung). Zahlen zu Klima, Wasser und Radrevier zeigt die Seite aus den Daten.
CREATE TABLE region_texts (
  region_id   uuid PRIMARY KEY REFERENCES regions(id) ON DELETE CASCADE,
  summary     text NOT NULL DEFAULT '',     -- ein Satz, zugleich Meta-Beschreibung (max. 160 Zeichen)
  body        text NOT NULL,                -- Absätze durch Leerzeile, Zwischenüberschriften mit "## "
  compare_slug text,                        -- häufig verglichene Nachbarregion (Slug), z. B. Fuerteventura ↔ Lanzarote
  compare_text text,                        -- 2–3 Sätze zum Vergleich; die Seite verlinkt den Direktvergleich
  updated_at  timestamptz NOT NULL DEFAULT now()
);
