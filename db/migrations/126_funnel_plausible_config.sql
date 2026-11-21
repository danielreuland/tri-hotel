-- B-16: Funnel liest Plausible nach Konfiguration je Domain statt nach festen Pfaden und Namen im Code.
-- funnel_domains.plausible (im Admin unter Dashboard → Funnel → „Plausible-Einstellungen“ editierbar):
--   site      Plausible-Site-ID, falls sie von der Domain abweicht (leer = Domain)
--   pages     Plausible-Filter je Seiten-Stufe, z. B. {"entity_views": "event:page==/hotel/**", "camp_views": "event:page==/trainingscamp/**"}
--   goals     Plausible-Ziel je Ereignis-Stufe, z. B. {"inquiry_starts": "Hotel-Anfrage-Start", "compare_views": "Hotelvergleich"}
--   pages_on  Domain, auf der Seiten und Ziele gezählt werden (statische Seiten ohne eigene Objektseiten: Besuche mit
--             visit:source = diese Domain auf der Zieldomain). In „alle zusammen“ zählen diese Besuche nicht doppelt.
ALTER TABLE funnel_domains ADD COLUMN plausible jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Domains, die die App ausliefert: Objektseiten nach Objekttyp des Standard-Rankings der Site (bisherige Regel im Code),
-- Camp-Seiten wie bisher, Ziele wie in den Vorlagen (data-goal)
UPDATE funnel_domains d SET plausible = jsonb_build_object(
  'pages', jsonb_build_object(
    'entity_views', 'event:page==/' || r.entity_type || '/**|/rankings/*/*',
    'camp_views', 'event:page==/trainingscamp|/trainingscamp/**'),
  'goals', jsonb_build_object('inquiry_starts', 'Hotel-Anfrage-Start', 'compare_views', 'Hotelvergleich'))
FROM rankings r
WHERE d.site_id IS NOT NULL AND r.site_id = d.site_id AND r.is_default;

-- Domains ohne eigene Site (statische Seiten, z. B. fitnessracing-hotel.de): Objektseiten und Ziele auf der ersten Domain
-- mit Besuchen von dieser Domain (wie bisher im Morgenbericht)
UPDATE funnel_domains d SET plausible = jsonb_build_object(
  'pages_on', h.domain,
  'pages', jsonb_build_object('entity_views', h.plausible->'pages'->'entity_views'),
  'goals', h.plausible->'goals')
FROM (SELECT domain, plausible FROM funnel_domains WHERE site_id IS NOT NULL ORDER BY sort_order, domain LIMIT 1) h
WHERE d.site_id IS NULL AND h.plausible ? 'pages';
