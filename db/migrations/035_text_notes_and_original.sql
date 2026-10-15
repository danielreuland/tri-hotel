-- Beschreibungstexte: redaktionelle Notizen als zusätzliche Grundlage für den KI-Entwurf
-- und der ursprünglich erzeugte Entwurf (zum Vergleich mit der freigegebenen Fassung).
ALTER TABLE entity_texts
  ADD COLUMN notes text NOT NULL DEFAULT '',
  ADD COLUMN generated_summary text,
  ADD COLUMN generated_body text;
