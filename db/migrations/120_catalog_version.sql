-- Stand der Methode je Ranking (B-30, 18.11.2026): Version des Kriterienkatalogs, Datum der letzten Katalogänderung,
-- Datum der letzten Neuberechnung aller Scores und ein Änderungsverlauf für die Methodik-Seite.
--
-- Katalogänderung = Kriterium neu/geändert/entfernt (Punkteschema, Höchstpunkte, K.O., aktiv, Bezeichnung, Werttyp,
-- Kategorie), Kategorie neu/umbenannt/entfernt, Formel oder Score-Stufen des Rankings geändert. Reihenfolge,
-- Hervorhebung, Fundstellen-Link und geteilte Schlüssel zählen nicht.
-- Erfasst per Trigger – gilt für Admin und Migrationen gleichermaßen. Je Transaktion und Ranking genau eine Version:
-- Eine Migration, die zehn Kriterien ändert, zählt einmal. Den öffentlichen Satz bildet services/method-status.js aus
-- `detail`; `public_text` (optional) ersetzt ihn, z. B. für die nachgetragenen Einträge unten.

ALTER TABLE rankings
  ADD COLUMN catalog_version    integer NOT NULL DEFAULT 1,
  ADD COLUMN catalog_changed_at timestamptz,
  ADD COLUMN scores_computed_at timestamptz;

CREATE TABLE catalog_changes (
  id          bigserial PRIMARY KEY,
  ranking_id  uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  tx          bigint,                               -- txid_current(): fasst Änderungen einer Transaktion zusammen
  detail      jsonb NOT NULL DEFAULT '[]',          -- Liste aus {kind: criterion|category|formula|labels|ranking, op: added|changed|removed|created, label}
  public_text text,                                 -- fester Satz für die Methodik-Seite (sonst aus detail gebildet)
  UNIQUE (ranking_id, version)
);
CREATE INDEX catalog_changes_recent_idx ON catalog_changes (ranking_id, changed_at DESC);

-- ---------- Nachtrag: bisherige Katalogänderungen ----------
-- Version 1 = erste Fassung (Anlage des Rankings), danach die Katalog-Migrationen (Datum des Commits) und
-- Katalogänderungen aus dem Admin (admin_actions, je Ranking und Tag eine Version).
CREATE TEMP TABLE _hist (ranking_code text, changed_at timestamptz, public_text text, detail jsonb) ON COMMIT DROP;

INSERT INTO _hist (ranking_code, changed_at, public_text) VALUES
  ('triathlon-hotel', '2026-10-08 12:00 Europe/Berlin',
   'Rad stärker gewichtet als Schwimmen, Kraftraum in vier Ausstattungsstufen, Bereich „Regeneration & Indoor“ in „Regeneration“ und „Indoor-Training“ aufgeteilt.'),
  ('triathlon-hotel', '2026-10-14 12:00 Europe/Berlin',
   'Klima zählt nicht mehr im Score (stattdessen „beste Reisezeit“), unbekannte Werte zählen mit dem Durchschnitt aller geprüften Hotels, geführte Touren geringer gewichtet, Radgarage und Wäscheservice angepasst.'),
  ('triathlon-hotel', '2026-10-22 12:00 Europe/Berlin',
   'Radrevier wird je Gebiet aus Straßennetz, Verkehrsdichte und Höhendaten bewertet.'),
  ('triathlon-hotel', '2026-10-22 18:00 Europe/Berlin',
   'Becken ist kein K.O.-Kriterium mehr; es zählt die beste Angabe aus Becken im Hotel und in bis zu 5 km Entfernung.'),
  ('fitness-racing-hotel', '2026-10-30 18:00 Europe/Berlin',
   'Neues Kriterium „Lage des Trainings-Gyms“: Geräte zählen im Hotel- oder Partner-Gym, die Entfernung bringt Punkte.');

-- Admin-Änderungen: Kriterien (nur bei geänderten Punkten, K.O. oder Aktiv-Status), neue Kategorien, Formel/Stufen
INSERT INTO _hist (ranking_code, changed_at, detail)
SELECT r.code, max(x.created_at), jsonb_agg(x.item ORDER BY x.created_at)
FROM (
  SELECT c.ranking_id, a.created_at,
         jsonb_build_object('kind', 'criterion', 'label', c.label, 'op',
           CASE WHEN a.action = 'create_criterion' THEN 'added'
                WHEN (a.diff->'old'->>'active')::boolean IS TRUE AND (a.diff->'new'->>'active')::boolean IS FALSE THEN 'removed'
                WHEN (a.diff->'old'->>'active')::boolean IS FALSE AND (a.diff->'new'->>'active')::boolean IS TRUE THEN 'added'
                ELSE 'changed' END) AS item
    FROM admin_actions a JOIN criteria c ON c.id = a.entity_id
   WHERE a.entity_type = 'criterion' AND (a.action = 'create_criterion' OR (a.action = 'edit_criterion' AND (
           a.diff->'old'->'scoring' IS DISTINCT FROM a.diff->'new'->'scoring'
        OR a.diff->'old'->'max_points' IS DISTINCT FROM a.diff->'new'->'max_points'
        OR a.diff->'old'->'is_ko' IS DISTINCT FROM a.diff->'new'->'is_ko'
        OR a.diff->'old'->'active' IS DISTINCT FROM a.diff->'new'->'active')))
  UNION ALL
  SELECT a.entity_id, a.created_at, jsonb_build_object('kind', 'category', 'op', 'added', 'label', a.diff->>'label')
    FROM admin_actions a WHERE a.entity_type = 'ranking' AND a.action = 'add_category'
  UNION ALL
  SELECT a.entity_id, a.created_at, jsonb_build_object('kind', 'formula', 'op', 'changed')
    FROM admin_actions a WHERE a.entity_type = 'ranking' AND a.action = 'edit_ranking'
     AND a.diff->'old'->'formula' IS DISTINCT FROM a.diff->'new'->'formula'
  UNION ALL
  SELECT a.entity_id, a.created_at, jsonb_build_object('kind', 'labels', 'op', 'changed')
    FROM admin_actions a WHERE a.entity_type = 'ranking' AND a.action = 'edit_ranking'
     AND a.diff->'old'->'labels' IS DISTINCT FROM a.diff->'new'->'labels'
) x JOIN rankings r ON r.id = x.ranking_id
GROUP BY r.code, (x.created_at AT TIME ZONE 'Europe/Berlin')::date;

-- Version 1 je Ranking (erste Fassung), dann der Verlauf nach Datum
INSERT INTO catalog_changes (ranking_id, version, changed_at, detail, public_text)
SELECT r.id, 1, LEAST(r.created_at, COALESCE(f.first_at, r.created_at)), '[{"kind":"ranking","op":"created"}]', NULL
FROM rankings r LEFT JOIN (VALUES
  ('triathlon-hotel', '2026-10-07 12:00 Europe/Berlin'::timestamptz),    -- Schema und Kriterienkatalog (Commit 07.10.2026)
  ('fitness-racing-hotel', '2026-10-30 12:00 Europe/Berlin'::timestamptz) -- Migration 089
) AS f(code, first_at) ON f.code = r.code;

INSERT INTO catalog_changes (ranking_id, version, changed_at, detail, public_text)
SELECT r.id, 1 + row_number() OVER (PARTITION BY r.id ORDER BY h.changed_at), h.changed_at, COALESCE(h.detail, '[]'), h.public_text
FROM _hist h JOIN rankings r ON r.code = h.ranking_code;

UPDATE rankings r SET catalog_version = v.version, catalog_changed_at = v.changed_at
FROM (SELECT DISTINCT ON (ranking_id) ranking_id, version, changed_at FROM catalog_changes ORDER BY ranking_id, version DESC) v
WHERE v.ranking_id = r.id;

UPDATE rankings r SET scores_computed_at = (SELECT max(updated_at) FROM entity_rankings er WHERE er.ranking_id = r.id);

-- ---------- Erfassung künftiger Änderungen ----------
-- Hängt Einträge an die Änderung dieser Transaktion an oder legt eine neue Version an.
CREATE FUNCTION note_catalog_change(p_ranking uuid, p_items jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_id bigint;
  v_version integer;
BEGIN
  IF p_ranking IS NULL OR p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM rankings WHERE id = p_ranking) THEN RETURN; END IF;  -- Ranking wird gerade gelöscht
  SELECT id INTO v_id FROM catalog_changes WHERE ranking_id = p_ranking AND tx = txid_current();
  IF v_id IS NOT NULL THEN
    UPDATE catalog_changes SET detail = detail || p_items WHERE id = v_id;
    RETURN;
  END IF;
  UPDATE rankings SET catalog_version = catalog_version + 1, catalog_changed_at = now()
   WHERE id = p_ranking RETURNING catalog_version INTO v_version;
  INSERT INTO catalog_changes (ranking_id, version, changed_at, tx, detail) VALUES (p_ranking, v_version, now(), txid_current(), p_items);
END $$;

-- Neues Ranking (auch „duplizieren“): Version 1; Kriterien derselben Transaktion gehören zur ersten Fassung
CREATE FUNCTION catalog_ranking_created() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE rankings SET catalog_version = 1, catalog_changed_at = now() WHERE id = NEW.id;
  INSERT INTO catalog_changes (ranking_id, version, changed_at, tx, detail)
  VALUES (NEW.id, 1, now(), txid_current(), '[{"kind":"ranking","op":"created"}]');
  RETURN NULL;
END $$;
CREATE TRIGGER catalog_ranking_created AFTER INSERT ON rankings FOR EACH ROW EXECUTE FUNCTION catalog_ranking_created();

-- Formel oder Score-Stufen geändert (BEFORE: Version direkt in NEW setzen, keine zweite Aktualisierung derselben Zeile)
CREATE FUNCTION catalog_ranking_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_items jsonb := '[]';
  v_id bigint;
BEGIN
  IF NEW.formula IS DISTINCT FROM OLD.formula THEN v_items := v_items || '[{"kind":"formula","op":"changed"}]'; END IF;
  IF NEW.labels IS DISTINCT FROM OLD.labels THEN v_items := v_items || '[{"kind":"labels","op":"changed"}]'; END IF;
  IF jsonb_array_length(v_items) = 0 THEN RETURN NEW; END IF;
  SELECT id INTO v_id FROM catalog_changes WHERE ranking_id = NEW.id AND tx = txid_current();
  IF v_id IS NOT NULL THEN
    UPDATE catalog_changes SET detail = detail || v_items WHERE id = v_id;
  ELSE
    NEW.catalog_version := OLD.catalog_version + 1;
    NEW.catalog_changed_at := now();
    INSERT INTO catalog_changes (ranking_id, version, changed_at, tx, detail) VALUES (NEW.id, NEW.catalog_version, now(), txid_current(), v_items);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER catalog_ranking_changed BEFORE UPDATE OF formula, labels ON rankings FOR EACH ROW EXECUTE FUNCTION catalog_ranking_changed();

-- Kriterien: je Anweisung gesammelt (Übergangstabellen), je Ranking ein Aufruf
CREATE FUNCTION catalog_criteria_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR r IN SELECT ranking_id, jsonb_agg(jsonb_build_object('kind', 'criterion', 'op', 'added', 'label', label) ORDER BY sort_order) AS items
               FROM new_rows WHERE active GROUP BY ranking_id LOOP
      PERFORM note_catalog_change(r.ranking_id, r.items);
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR r IN SELECT ranking_id, jsonb_agg(jsonb_build_object('kind', 'criterion', 'op', 'removed', 'label', label) ORDER BY sort_order) AS items
               FROM old_rows WHERE active GROUP BY ranking_id LOOP
      PERFORM note_catalog_change(r.ranking_id, r.items);
    END LOOP;
  ELSE
    FOR r IN SELECT n.ranking_id, jsonb_agg(jsonb_build_object('kind', 'criterion', 'label', n.label, 'op',
                 CASE WHEN o.active AND NOT n.active THEN 'removed' WHEN NOT o.active AND n.active THEN 'added' ELSE 'changed' END)
                 ORDER BY n.sort_order) AS items
               FROM new_rows n JOIN old_rows o ON o.id = n.id
              WHERE (o.active OR n.active)
                AND (o.scoring, o.max_points, o.is_ko, o.active, o.label, o.value_type, o.category_id)
                    IS DISTINCT FROM (n.scoring, n.max_points, n.is_ko, n.active, n.label, n.value_type, n.category_id)
              GROUP BY n.ranking_id LOOP
      PERFORM note_catalog_change(r.ranking_id, r.items);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER catalog_criteria_ins AFTER INSERT ON criteria REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION catalog_criteria_changed();
CREATE TRIGGER catalog_criteria_upd AFTER UPDATE ON criteria REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION catalog_criteria_changed();
CREATE TRIGGER catalog_criteria_del AFTER DELETE ON criteria REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION catalog_criteria_changed();

-- Kategorien: neu, umbenannt, entfernt (Reihenfolge zählt nicht)
CREATE FUNCTION catalog_categories_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR r IN SELECT ranking_id, jsonb_agg(jsonb_build_object('kind', 'category', 'op', 'added', 'label', label)) AS items
               FROM new_rows GROUP BY ranking_id LOOP
      PERFORM note_catalog_change(r.ranking_id, r.items);
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR r IN SELECT ranking_id, jsonb_agg(jsonb_build_object('kind', 'category', 'op', 'removed', 'label', label)) AS items
               FROM old_rows GROUP BY ranking_id LOOP
      PERFORM note_catalog_change(r.ranking_id, r.items);
    END LOOP;
  ELSE
    FOR r IN SELECT n.ranking_id, jsonb_agg(jsonb_build_object('kind', 'category', 'op', 'changed', 'label', n.label)) AS items
               FROM new_rows n JOIN old_rows o ON o.id = n.id WHERE o.label IS DISTINCT FROM n.label GROUP BY n.ranking_id LOOP
      PERFORM note_catalog_change(r.ranking_id, r.items);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER catalog_categories_ins AFTER INSERT ON ranking_categories REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION catalog_categories_changed();
CREATE TRIGGER catalog_categories_upd AFTER UPDATE ON ranking_categories REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION catalog_categories_changed();
CREATE TRIGGER catalog_categories_del AFTER DELETE ON ranking_categories REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION catalog_categories_changed();
