-- Rückgängig zu 127_mail_hub_contact.sql (von Hand einspielen: psql "$DATABASE_URL" -f db/migrations/down/127_mail_hub_contact.sql)
BEGIN;
ALTER TABLE mail_messages DROP COLUMN hub_contact_at, DROP COLUMN hub_contact;
DELETE FROM schema_migrations WHERE name = '127_mail_hub_contact.sql';
COMMIT;
