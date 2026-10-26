-- „Gibt es nicht“ je Objekt und Partnerprogramm (z. B. Hotel nicht bei Expedia gelistet):
-- Die Board-Aufgabe „Partnerlink prüfen / generieren“ fragt dieses Programm für dieses Objekt nicht mehr nach.
-- Wird später doch ein Link eingetragen, entfällt der Vermerk.
CREATE TABLE entity_link_absences (
  entity_id   uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  program_id  uuid NOT NULL REFERENCES partner_programs(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES admin_users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, program_id)
);
