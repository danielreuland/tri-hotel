-- Sechs Partnerklicks mit Herkunft fitnessracing-hotel.de vom 14. und 16.11.2026 waren Abrufe von Crawlern (je beide Links
-- der Startseite in derselben Sekunde bzw. im Abstand von 8 Sekunden, nachts, ohne Referer, veraltete Browserkennung).
-- Seit die Startseite indexierbar ist (14.11.), folgen Crawler den Links. Ab jetzt zählt ein ?von=-Link nur mit passendem
-- Referer (partners.cameFrom).
DELETE FROM outbound_clicks
 WHERE source = 'fitnessracing-hotel.de' AND kind = 'entity_link' AND day IN ('2026-11-14', '2026-11-16');
