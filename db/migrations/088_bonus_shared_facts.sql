-- 1. Werttyp „bonus“: Kriterium ohne eigenen Faktenwert, Punkte nur, wenn alle genannten Kriterien vorhanden sind
--    (scoring {"type":"bonus","requires":["code",…],"points":n}). Eigene Migration: ein neuer Enum-Wert ist erst nach
--    dem Commit nutzbar.
-- 2. Geteilte Fakten: Kriterien mit gleichem share_key (z. B. Sauna im Triathlon- und im Fitness-Racing-Ranking) teilen
--    ihre Werte je Objekt. Der Trigger überträgt jede Änderung (egal ob Admin, Auto-Prüfung, Anfrage, Bewertung) auf die
--    Geschwister; die Punkte (points) rechnet jedes Ranking selbst. Werttypen müssen zusammenpassen (Admin prüft).
ALTER TYPE criterion_value_type ADD VALUE IF NOT EXISTS 'bonus';

ALTER TABLE criteria ADD COLUMN IF NOT EXISTS share_key text;
CREATE INDEX IF NOT EXISTS criteria_share_key_idx ON criteria (share_key) WHERE share_key IS NOT NULL;

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
  INSERT INTO entity_facts (entity_id, criterion_id, value, source, trust_level, evidence_url, evidence_text, checked_at, disputed)
  SELECT NEW.entity_id, s.id, NEW.value, NEW.source, NEW.trust_level, NEW.evidence_url, NEW.evidence_text, NEW.checked_at, NEW.disputed
    FROM criteria c JOIN criteria s ON s.share_key = c.share_key AND s.id <> c.id
   WHERE c.id = NEW.criterion_id AND c.share_key IS NOT NULL
  ON CONFLICT (entity_id, criterion_id) DO UPDATE SET
    value = EXCLUDED.value, source = EXCLUDED.source, trust_level = EXCLUDED.trust_level,
    evidence_url = EXCLUDED.evidence_url, evidence_text = EXCLUDED.evidence_text,
    checked_at = EXCLUDED.checked_at, disputed = EXCLUDED.disputed;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entity_facts_share ON entity_facts;
CREATE TRIGGER entity_facts_share
  AFTER INSERT OR DELETE OR UPDATE OF value, source, trust_level, evidence_url, evidence_text, checked_at, disputed
  ON entity_facts FOR EACH ROW EXECUTE FUNCTION share_entity_fact();

-- Abgleich nach dem Setzen eines share_key: fehlende Werte aus der Gruppe ergänzen (je Objekt der verlässlichste,
-- dann neueste Wert). Vorhandene Werte bleiben unverändert – Abweichungen löst der Admin. Ergebnis: Anzahl ergänzter Werte
CREATE OR REPLACE FUNCTION sync_shared_facts(key text) RETURNS integer AS $$
DECLARE n integer;
BEGIN
  PERFORM set_config('tri.share_sync', 'off', true);
  INSERT INTO entity_facts (entity_id, criterion_id, value, source, trust_level, evidence_url, evidence_text, checked_at, disputed)
  SELECT DISTINCT ON (f.entity_id, t.id) f.entity_id, t.id, f.value, f.source, f.trust_level, f.evidence_url, f.evidence_text, f.checked_at, f.disputed
    FROM entity_facts f
    JOIN criteria c ON c.id = f.criterion_id AND c.share_key = key
    JOIN criteria t ON t.share_key = key AND t.id <> c.id
   WHERE NOT EXISTS (SELECT 1 FROM entity_facts x WHERE x.entity_id = f.entity_id AND x.criterion_id = t.id)
   ORDER BY f.entity_id, t.id, f.trust_level, f.checked_at DESC
  ON CONFLICT (entity_id, criterion_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('tri.share_sync', 'on', true);
  RETURN n;
END
$$ LANGUAGE plpgsql;
