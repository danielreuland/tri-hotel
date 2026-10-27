-- Startseite aus Bereichen (Über die Seite, Objekte, Camp-Anbieter, Regionen): Reihenfolge, Sichtbarkeit und
-- Hervorhebung je Bereich, gepflegt im Admin unter „Startseite“. Leer = Standardreihenfolge, alles automatisch.
-- {"blocks":[{"key":"about","hidden":false,"pick":{"mode":"auto"}},{"key":"entities","pick":{"mode":"editorial","slug":"…","until":"2026-11-30"}}, …]}
ALTER TABLE sites ADD COLUMN IF NOT EXISTS home jsonb NOT NULL DEFAULT '{}';
