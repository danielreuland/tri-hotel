-- Dashboard-Funnel: Ziele je Stufe und Monat, im Admin editierbar. Start: 2.000 Seitenaufrufe pro Monat (Daniel, 01.11.2026).
CREATE TABLE funnel_goals (
  site_id      uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  stage        text NOT NULL,                -- pageviews | entity_views | partner_clicks | camp_views | camp_requests
  monthly_goal integer NOT NULL CHECK (monthly_goal > 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, stage)
);
INSERT INTO funnel_goals (site_id, stage, monthly_goal) SELECT id, 'pageviews', 2000 FROM sites;
