-- Beschreibungstexte: Styleguide je Ranking, ausgewählte Mustertexte statt „zuletzt überarbeiteter Text“,
-- verwendete Fakten je Text (Fingerabdruck je Angabe → gezielter Veraltet-Hinweis) und Prüfbefunde vor der Freigabe.
ALTER TABLE rankings
  ADD COLUMN text_style jsonb NOT NULL DEFAULT '{}';   -- {"guide": "…", "banned": ["…"]}

ALTER TABLE entity_texts
  ADD COLUMN style_example boolean NOT NULL DEFAULT false,  -- vom Admin als Mustertext ausgewählt (höchstens 3 je Ranking)
  ADD COLUMN fact_refs jsonb,                                -- {"<Fakten-ID>": "<Fingerabdruck>"} der im Text verwendeten Angaben
  ADD COLUMN checks jsonb;                                  -- NULL = noch nicht geprüft; [{"type": "number|word|summary|basis|review|info", "text": "…"}]
