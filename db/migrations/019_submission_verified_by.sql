-- Admin kann eine Meldung ohne E-Mail-Bestätigung des Melders in die Prüfung geben (z. B. solange kein Mailversand eingerichtet ist).
-- Dann ist die Melder-Adresse unbestätigt: an sie gehen keine Mails (Freigabe/Absage), damit niemand fremde Adressen eintragen kann.
ALTER TABLE submissions ADD COLUMN verified_by uuid REFERENCES admin_users(id);
