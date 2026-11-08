-- Werte ohne Beleg ehrlich kennzeichnen: Hat ein Wert weder Fundstelle (Link) noch Vermerk, kann der Admin ihn ausdrücklich als
-- „Einschätzung der Redaktion“ markieren (z. B. Healthy Food: kein Nachweis, kein klares Ja oder Nein). Die Hotelseite zeigt das an.
-- Neue oder geänderte Werte brauchen künftig einen Beleg oder diese Markierung (Prüfung im Admin, routes/admin.js).
ALTER TABLE entity_facts ADD COLUMN editorial_assessment boolean NOT NULL DEFAULT false;

-- Geteilte Werte (Migration 088): die Markierung mit übertragen
CREATE OR REPLACE FUNCTION share_entity_fact() RETURNS trigger AS $$
BEGIN
  -- nur die ursprüngliche Änderung weitergeben, nicht die Kopien (sonst Endlosschleife); beim Abgleich ausgesetzt
  IF pg_trigger_depth() > 1 OR current_setting('tri.share_sync', true) = 'off' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM entity_facts f
     USING criteria c, criteria s
     WHERE c.id = OLD.criterion_id AND c.share_key IS NOT NULL
       AND s.share_key = c.share_key AND s.id <> c.id
       AND f.entity_id = OLD.entity_id AND f.criterion_id = s.id;
    RETURN NULL;
  END IF;
  INSERT INTO entity_facts (entity_id, criterion_id, value, source, trust_level, evidence_url, evidence_text, checked_at, disputed, editorial_assessment)
  SELECT NEW.entity_id, s.id, NEW.value, NEW.source, NEW.trust_level, NEW.evidence_url, NEW.evidence_text, NEW.checked_at, NEW.disputed, NEW.editorial_assessment
    FROM criteria c JOIN criteria s ON s.share_key = c.share_key AND s.id <> c.id
   WHERE c.id = NEW.criterion_id AND c.share_key IS NOT NULL
  ON CONFLICT (entity_id, criterion_id) DO UPDATE SET
    value = EXCLUDED.value, source = EXCLUDED.source, trust_level = EXCLUDED.trust_level,
    evidence_url = EXCLUDED.evidence_url, evidence_text = EXCLUDED.evidence_text,
    checked_at = EXCLUDED.checked_at, disputed = EXCLUDED.disputed, editorial_assessment = EXCLUDED.editorial_assessment;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entity_facts_share ON entity_facts;
CREATE TRIGGER entity_facts_share
  AFTER INSERT OR DELETE OR UPDATE OF value, source, trust_level, evidence_url, evidence_text, checked_at, disputed, editorial_assessment
  ON entity_facts FOR EACH ROW EXECUTE FUNCTION share_entity_fact();
