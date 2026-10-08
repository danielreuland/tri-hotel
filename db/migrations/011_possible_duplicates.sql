-- Dubletten nicht mehr automatisch abschließen: Auto-Prüfung markiert nur „mögliche Dublette“, der Admin entscheidet.
-- (Ketten und Reiseveranstalter betreiben oft mehrere Häuser unter derselben Website-Domain.)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS possible_duplicate_of uuid REFERENCES entities(id);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS duplicate_check_done boolean NOT NULL DEFAULT false;  -- Admin hat „eigenes Objekt“ bestätigt
