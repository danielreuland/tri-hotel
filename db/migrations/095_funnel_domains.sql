-- Dashboard-Funnel je Seite: tri-hotel.de, fitnessracing-hotel.de (statische Seite, eigene Plausible-Seite) oder beide zusammen.
-- funnel_domains: Domains mit Plausible-Seite; site_id gesetzt, wenn die Domain von der App ausgeliefert wird (Camp-Anfragen).
-- Partner-Klicks werden über outbound_clicks.source der Domain zugeordnet; Klicks ohne bekannte Herkunft zählen zur ersten Domain.
CREATE TABLE funnel_domains (
  domain     text PRIMARY KEY,                 -- wie in Plausible (ohne www)
  label      text NOT NULL,
  site_id    uuid REFERENCES sites(id) ON DELETE SET NULL,
  sort_order smallint NOT NULL DEFAULT 100
);
INSERT INTO funnel_domains (domain, label, site_id, sort_order)
SELECT primary_domain, primary_domain, id, CASE WHEN is_default THEN 1 ELSE 10 END FROM sites WHERE primary_domain IS NOT NULL;
INSERT INTO funnel_domains (domain, label, site_id, sort_order) VALUES ('fitnessracing-hotel.de', 'fitnessracing-hotel.de', NULL, 20)
ON CONFLICT (domain) DO NOTHING;

-- Ziele je Seite (scope = Domain) bzw. für alle zusammen (scope = 'alle'); bisherige Ziele gehören zur Domain der Site
ALTER TABLE funnel_goals ADD COLUMN scope text;
UPDATE funnel_goals g SET scope = s.primary_domain FROM sites s WHERE s.id = g.site_id;
UPDATE funnel_goals SET scope = 'alle' WHERE scope IS NULL;
ALTER TABLE funnel_goals ALTER COLUMN scope SET NOT NULL;
ALTER TABLE funnel_goals DROP CONSTRAINT funnel_goals_pkey;
ALTER TABLE funnel_goals ADD PRIMARY KEY (site_id, scope, stage);
