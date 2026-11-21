-- Rückgängig zu 126_funnel_plausible_config.sql (von Hand einspielen: psql "$DATABASE_URL" -f db/migrations/down/126_funnel_plausible_config.sql)
-- Danach liest der Funnel wieder die festen Pfade im Code (Stand vor B-16) – Code dafür mit zurücksetzen.
BEGIN;
ALTER TABLE funnel_domains DROP COLUMN plausible;
DELETE FROM funnel_goals WHERE stage IN ('inquiry_starts', 'compare_views');
DELETE FROM schema_migrations WHERE name = '126_funnel_plausible_config.sql';
COMMIT;
