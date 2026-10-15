-- Kriterium mit verknüpfter Quelle: z. B. „Camps buchbar“ zeigt die Camp-Anbieter, die in diesem Objekt Camps anbieten.
ALTER TABLE criteria ADD COLUMN link_source text CHECK (link_source IN ('camp_providers'));
UPDATE criteria SET link_source = 'camp_providers' WHERE code = 'log_camps';
