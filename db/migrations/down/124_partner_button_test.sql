-- Rückgängig zu 124_partner_button_test.sql (von Hand einspielen: psql "$DATABASE_URL" -f db/migrations/down/124_partner_button_test.sql)
-- Zähler mit gleicher Tages-/Herkunfts-Kombination werden vorher zusammengefasst, damit der alte Primärschlüssel passt.
BEGIN;
DROP TABLE IF EXISTS ranking_list_stats;
CREATE TEMP TABLE oc_merge AS
  SELECT kind, target_id, day, source, sum(clicks)::int AS clicks FROM outbound_clicks GROUP BY kind, target_id, day, source;
DELETE FROM outbound_clicks;
ALTER TABLE outbound_clicks DROP CONSTRAINT outbound_clicks_pkey;
ALTER TABLE outbound_clicks DROP COLUMN placement, DROP COLUMN position, DROP COLUMN variant, DROP COLUMN list;
INSERT INTO outbound_clicks (kind, target_id, day, source, clicks) SELECT kind, target_id, day, source, clicks FROM oc_merge;
ALTER TABLE outbound_clicks ADD PRIMARY KEY (kind, target_id, day, source);
DELETE FROM app_settings WHERE key = 'partner_button';
DELETE FROM schema_migrations WHERE name = '124_partner_button_test.sql';
COMMIT;
