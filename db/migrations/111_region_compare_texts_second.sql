-- Zweite Vergleiche je Region (08.11.2026, Wunsch Daniel). Zahlen aus den Regionsdaten (Open-Meteo-Mittel der letzten
-- drei Jahre, NOAA-Stationen, OpenStreetMap). Jeder Text macht die Vergleichsseite des Paars indexierbar.
INSERT INTO region_compare_texts (region_id, compare_slug, text, sort_order)
SELECT r.id, v.compare_slug, v.text, 1
FROM (VALUES
  ('lanzarote', 'mallorca', 'Lanzarote ist das Ganzjahresziel: Auch im Januar werden es um 20 °C, Regentage sind selten, dafür weht oft kräftiger Wind, im Juli und August an rund 19 Tagen im Monat. Mallorca ist im Winter kühler und hat dann rund sechs Regentage im Monat, bietet aber das deutlich größere Radrevier mit vielen Anstiegen und ruhigen Nebenstraßen sowie die meisten Trainingshotels.'),
  ('girona', 'costa-blanca', 'Beide Festlandziele haben ruhige Straßen im Hinterland und kaum Wind. Girona liegt nah an den Pyrenäen und ist im Frühjahr und Herbst ideal, im Winter mit Tiefstwerten um 4 °C aber kühl. Die Costa Blanca ist von Dezember bis Februar milder und eignet sich deshalb schon früher im Jahr.'),
  ('algarve', 'fuerteventura', 'Beide liegen am Atlantik und sind Winterziele. Fuerteventura ist von Dezember bis März mit 21–23 °C deutlich wärmer, fast regenfrei und hat das wärmere Meer, ist aber windiger. Die Algarve hat bei 17–19 °C kaum Wind und das größere Netz ruhiger Straßen, im Winter allerdings acht bis vierzehn Regentage im Monat.'),
  ('gardasee', 'girona', 'Beide sind Radziele für Frühjahr und Herbst. Girona ist schon ab März und bis in den November hinein angenehm warm. Der Gardasee hat das größere Netz ruhiger Straßen, die höheren Pässe und Freiwasser im See, wird aber erst ab April warm genug.'),
  ('zypern', 'teneriffa', 'Teneriffa ist im Winter wärmer und fast regenfrei und hat mit dem Teide die längsten Anstiege, ist aber an vielen Tagen windig. Zypern hat mehr ruhige Straßen und weniger Wind und wird ab April ähnlich angenehm, im Dezember und Januar gibt es dort jedoch spürbar mehr Regentage.'),
  ('gran-canaria', 'lanzarote', 'Gran Canaria ist die Insel für Bergtraining: längere Anstiege und mehr ruhige Straßen. Lanzarote ist flacher und kompakter und hat mit dem Club La Santa das bekannteste Sporthotel. Windig sind beide, Gran Canaria vor allem im Hochsommer.')
) AS v(slug, compare_slug, text)
JOIN regions r ON r.slug = v.slug
JOIN regions o ON o.site_id = r.site_id AND o.slug = v.compare_slug
ON CONFLICT (region_id, compare_slug) DO NOTHING;
