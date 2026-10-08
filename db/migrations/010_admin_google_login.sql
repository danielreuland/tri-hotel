-- Admin-Login über Google: Passwort optional, Google-Konto wird beim ersten Login verknüpft.
-- Zugang nur für E-Mail-Adressen, die in admin_users stehen (Allowlist).
ALTER TABLE admin_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS google_sub text UNIQUE;   -- feste Google-Kontokennung
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
