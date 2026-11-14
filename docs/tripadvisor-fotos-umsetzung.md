# Tripadvisor-Fotos (B-87): Stand und Vorgaben für die Umsetzung

Ergänzt `docs/konzept-tripadvisor-fotos.md` (Wortlaut des Konzepts, User Stories US1–US6). Wo sich beide widersprechen, gilt
dieses Dokument. Stand 14.11.2026.

## Stand

- **Phase 1 (Klären) erledigt am 09.11.2026.** Ergebnis aus der offiziellen Terra-Doku siehe unten.
- **E-07 von Daniel grundsätzlich freigegeben**, mit Bedingung: Gebaut und eingeschaltet wird erst, wenn Tripadvisor
  schriftlich bestätigt hat, dass die geplante Darstellung zulässig ist. Die Anfrage an Tripadvisor ging am 09.11.2026 raus
  (inkl. Frage nach dem Tripadvisor-Affiliate-Programm). **Vor Phase 2 bei Daniel nachfragen, ob und was Tripadvisor
  geantwortet hat.** Ohne Antwort: höchstens mit Not-Aus (`TA_PHOTOS_ENABLED=false`) bauen, nichts einschalten.
- Den API-Schlüssel legt Daniel selbst an und trägt ihn selbst in die Server-`.env` ein (`TRIPADVISOR_API_KEY`, Befehl mit
  `read -s`). Nie im Chat oder im Repo.

## Der offene Punkt: Buchungslinks (API Master Terms §3.4.2 (i))

Tripadvisor-Inhalte dürfen nicht „near, or in conjunction with, any booking or inventory function“ stehen, ausdrücklich
auch nicht neben Inhalten, die auf Buchungsfunktionen anderer Plattformen verlinken. Unsere Hotelseiten haben
Partner-Buchungslinks. Vereinbarte Lösung:

- Fotos nur auf einer eigenen Unterseite `/hotel/<slug>/fotos`: keine Buchungs- oder Partnerlinks, `noindex`, nicht in der
  Sitemap.
- Auf der Hotelseite nur ein Knopf „Fotos ansehen (Tripadvisor)“ mit Hinweis, dass dabei Daten an Tripadvisor gehen.
- Ob das genügt, soll Tripadvisor bestätigen (siehe Stand).

## Entscheidungen von Daniel (09.11.2026)

- Budget: **6 USD pro Monat** = 400 Einheiten pro Monat, Tageslimit 20 (unser Wächter), zusätzlich Tageslimit 25 im
  Terra-Dashboard als zweite Sicherung. Alle Grenzen in der `.env`, ohne Code änderbar.
- Fotos für die **10 besten Hotels** nach Score, Auswahl per Häkchen von Daniel (Vorschlagsliste im Admin). Hat ein Hotel
  eigene freigegebene Fotos, werden automatisch diese gezeigt; Board-Aufgabe „eigene Fotos vorhanden, TA abschalten“.
- `location_id` **einmalig für alle Hotels mit Score ≥ 70** ermitteln (am 09.11. waren das 26 von 70 Live-Hotels, alle mit
  Koordinaten). Kein wiederkehrender Sammellauf; neue Hotels ab Score 70 über die Einzelsuche im Admin.
- Ausnahme zur Regel „Kein Hotlinking“ (erst beim Bau in `CLAUDE.md` eintragen):
  „Ausnahme Tripadvisor-API: Fotos aus der Tripadvisor-API werden ausschließlich über die von der API gelieferten URLs
  eingebunden und erst nach Klick des Nutzers geladen. Sie werden nie gespeichert, nie auf unserem Server abgelegt und nie
  in Datenbank, Logs oder Caches geschrieben (gespeichert wird nur die Location ID). Sie stehen immer mit Tripadvisor-Logo,
  Link zur Tripadvisor-Seite des Hotels und ‚See all photos‘, klar getrennt von unseren eigenen Inhalten, und haben keinen
  Einfluss auf Score, Reihenfolge oder Faktenprüfung.“

## Korrektur der Rahmenbedingungen (Daniel, 14.11.2026, Terra Discover)

- Freikontingent: 1.000 Einheiten EINMALIG pro Account-Lebensdauer, nicht monatlich. Danach 0,015 USD pro Einheit (bis
  1.000/Monat). Budget 400/Monat ≈ 6 USD/Monat.
- Abrechnung: Photos/Reviews = 1 Einheit pro Call; Search/Catalog-Search/Locations = 1 Einheit PRO zurückgegebener
  Location-ID. 4xx/5xx werden nicht berechnet.
- API-Basis: Terra (`https://terra.tripadvisor.com/api/...`), Auth per Header `X-API-Key`. Vor Umsetzung aktuelle
  Terra-Doku prüfen: Endpoints, Brand Guidelines, Caching Policy.

### US2 (ersetzt): location_id ermitteln und Allowlist pflegen

- Location-IDs über Catalog Search ermitteln, Ergebnis auf wenige Treffer begrenzen (z. B. limit=3), weil jede
  zurückgegebene ID abgerechnet wird. Admin bestätigt.
- Bestätigte IDs per Allowlist-Endpoint (APPEND) freigeben; wird ein Hotel deaktiviert, die ID per DELETE entfernen. Kein
  OVERWRITE ohne Bestätigung.
- Such-Einheiten zählen ins Monatsbudget (US3); Allowlist-Calls nicht.

### US3 (Ergänzung): Budget-Wächter

- Zähler in „billable entities“ statt HTTP-Calls führen (Search: Anzahl zurückgegebener IDs addieren). Nur erfolgreiche
  Antworten (2xx) zählen.
- Admin-Anzeige zusätzlich: verbrauchtes Freikontingent (x/1.000 lifetime) und geschätzte Kosten des laufenden Monats in
  USD.

## Hinweise aus Phase 1 (offizielle Terra-Doku, Stand 09.11.2026, vor dem Bau erneut prüfen)

- Doku: https://docs.terra.tripadvisor.com (Übersicht: `/docs/overview`, Preise: `/docs/usage-based-pricing.md`, Grenzen:
  `/docs/api-access-and-limits.md`, Caching: `/docs/caching-policy.md`, Links: `/docs/linking-policy.md`, Marke:
  `/docs/display-requirements.md`, Bedingungen: `/docs/api-master-terms.md`).
- Fotos: `GET /api/locations/{id}/photos`, Parameter `size` (Standard 100, also auf 5 setzen), `page`, `locale`. Antwort je
  Bild u. a. `photo.original_size_url`, `caption`, `user.username`, `source.name`, `publish_ts`.
- Suche nach Name: `GET /api/locations/search` (`query`, `category=HOTEL`, `search_type`, `country_code`, `size` ≤ 20).
  Suche nach Koordinaten: `GET /api/locations/nearby` (`lat`, `lon`, `radius` ≤ 8 km, `sort=distance,asc`, liefert die
  Entfernung je Treffer). Catalog Search: `/reference/cataloglocationssearch.md`. Welche Suche am sichersten zuordnet
  (Daniel nennt Catalog Search; am 09.11. war Nearby mit Koordinaten vorgeschlagen), anhand der aktuellen Doku
  entscheiden und Daniel kurz begründen.
- Die Preis-Seite nennt die Allowlist-API als nicht abgerechnet, aber nur „for customers with access“: prüfen, ob sie im
  Paket Discover verfügbar ist.
- Speichern erlaubt ist nur die Location ID. Pflicht bei Fotos: Tripadvisor-Logo nach Brand Guidelines, Link zur
  Tripadvisor-Seite des Hotels, Link „See all photos“. Inhalte unverändert und klar getrennt von eigenen Inhalten zeigen,
  nicht mit eigenen Bewertungen verrechnen. Den Namen des Fotografen (`user.username`) am Bild zeigen.
- Kein Euro-Limit im Konto, nur ein Tageslimit für Calls im Dashboard (Antwort 429 bei Erreichen).
- Tatsächlicher Bedarf: Die 10 Top-Hotelseiten hatten zuletzt zusammen rund 60 Aufrufe in 30 Tagen. Das Freikontingent
  reicht damit voraussichtlich lange; die 6 USD sind die Obergrenze.

## Vorschlag US6 (Admin-Übersicht, im Konzept abgeschnitten)

- Zähler: Einheiten diesen Monat/Limit, heute/Tageslimit, verbrauchtes Freikontingent (x/1.000), geschätzte Kosten des
  Monats in USD, Ampel ab 80 %.
- Liste der Hotels mit TA-Fotos: Status (aktiv / Location ID fehlt / eigene Fotos vorhanden / Not-Aus), Einheiten je Hotel
  im Monat, letzter Abruf.
- Die letzten 20 Fehler (Status, Dauer), ohne Inhalte.
- Board-Aufgaben: „Eigene Fotos vorhanden, TA abschalten“ und „Freikontingent zu 80 % verbraucht“.

## Unverändert aus dem Konzept

US1 (Felder `ta_location_id`, `ta_photos_enabled`, Vorrang eigener Fotos), US3 (Proxy, Zähler atomar vor dem Abruf,
Timeout 3 s, kein Retry, Not-Aus, Log ohne Inhalte), US4 (nur nach Klick, keine Bots, höchstens ein Abruf je Besucher und
Hotel in 30 Minuten, IP nur gehasht), US5 (Galerie mit höchstens 5 Bildern, Attribution, Platzhalter, Hinweis und Abschnitt
für die Datenschutzerklärung), Tests und Abnahme wie in der Aufgabe B-87 beschrieben. Neutralität: kein Einfluss auf Score,
Reihenfolge oder Faktenprüfung. Deploy nur nach Daniels „veröffentlichen“.
