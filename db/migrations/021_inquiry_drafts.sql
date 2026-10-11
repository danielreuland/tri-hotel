-- Anfrage-Entwürfe: die Auto-Prüfung legt für offene Punkte einen Entwurf an, der Admin gibt ihn frei (oder verwirft ihn).
ALTER TYPE inquiry_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'queued';
ALTER TABLE inquiries
  ADD COLUMN auto_created boolean NOT NULL DEFAULT false,   -- von der Auto-Prüfung angelegt
  ADD COLUMN approved_by  uuid REFERENCES admin_users(id),  -- wer den Versand freigegeben hat
  ADD COLUMN approved_at  timestamptz;
