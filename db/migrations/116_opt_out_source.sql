-- Abmeldung von E-Mails je Objekt: Herkunft und Vermerk (13.11.2026). Bisher gab es nur den Zeitpunkt (inquiry_opt_out_at,
-- gesetzt über den Abmeldelink). Neu: Der Admin kann eine Abmeldung selbst eintragen (z. B. Bitte per Antwort-Mail oder
-- Telefon) und mit Begründung wieder aufheben.
ALTER TABLE entities
  ADD COLUMN inquiry_opt_out_source text CHECK (inquiry_opt_out_source IN ('link', 'admin')),
  ADD COLUMN inquiry_opt_out_note text;

UPDATE entities SET inquiry_opt_out_source = 'link' WHERE inquiry_opt_out_at IS NOT NULL;
