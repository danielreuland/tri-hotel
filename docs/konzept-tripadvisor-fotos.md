# Backlog: Tripadvisor-Fotos als Platzhalter für Top-Hotels (tri-hotel.de)

Von Daniel am 08.11.2026 in den Backlog gegeben. Wortlaut unverändert; der Text endet mitten in US6 (so eingefügt).
Abgleich mit bisherigen Regeln und offene Punkte: `BACKLOG.md`, Abschnitt „Tripadvisor-Fotos“.

**Stand 14.11.2026:** Gebaut und ausgeschaltet. Die Umsetzung weicht vom Wortlaut unten ab, wo Daniel am 09.11. und 14.11.
anders entschieden hat – maßgeblich ist `docs/tripadvisor-fotos-umsetzung.md`: gezählt wird in abrechenbaren Einheiten statt
Calls (Freikontingent 1.000 einmalig, danach 0,015 USD), Tageslimit 20, höchstens 10 Objekte, Location IDs über Catalog
Search mit Bestätigung und Allowlist (US2), Fotos nur auf der Unterseite `…/fotos` statt auf der Objektseite (US4/US5),
Admin-Übersicht nach dem Vorschlag zu US6.

## Ziel
Für ausgewählte Top-Hotels ohne eigene Fotos werden Bilder live über die
Tripadvisor Content API (bzw. Nachfolger "Terra") angezeigt. Harte Grenze:
max. 400 API-Calls pro Kalendermonat. Die ersten 1.000 Calls/Monat sind
kostenlos, es dürfen also keine Kosten entstehen.

## Rahmenbedingungen (nicht verhandelbar)
- Kein Caching/Speichern von API-Inhalten (Bilder, URLs, Texte). Erlaubt ist
  nur das dauerhafte Speichern der `location_id`.
- Bilder nur über die von der API gelieferten URLs einbinden, nicht
  herunterladen oder rehosten.
- Tripadvisor-Attribution gemäß Display Requirements sichtbar anzeigen
  (Logo/Hinweis + Link). Vor Umsetzung die aktuellen Display Requirements
  und Caching Policy in der API-Doku prüfen (Legacy vs. Terra).
- API-Key nur serverseitig verwenden, nie im Frontend ausliefern.
- TA-Fotos haben keinen Einfluss auf TriScore oder Ranking.

## User Stories

### US1 – Hotel-Auswahl ("Top-Hotels")
- Neues Feld am Hotel: `ta_location_id` (nullable) und `ta_photos_enabled` (bool).
- TA-Fotos werden nur geladen, wenn `ta_photos_enabled = true`,
  `ta_location_id` gesetzt ist UND das Hotel keine eigenen Fotos hat.
- Admin kann das Flag manuell setzen. Startauswahl: max. 20 Hotels
  (Top-Hotels nach TriScore der wichtigsten Regionen).
- Sobald eigene Fotos vorhanden sind, werden automatisch diese angezeigt.

### US2 – location_id einmalig ermitteln
- Admin-Funktion/Script: Location Search für ein Hotel ausführen, Treffer
  anzeigen, Admin bestätigt die richtige `location_id`.
- Diese Calls zählen ins Monatsbudget (US3).

### US3 – Budget-Wächter (Kernfunktion)
- Serverseitiger Proxy-Endpunkt, z. B. `GET /api/ta-photos/:hotelId`.
- Zähler pro Kalendermonat in der DB (Monat, Anzahl Calls), atomar erhöht
  VOR dem API-Call.
- Hartes Limit: 400 Calls/Monat. Zusätzlich Tageslimit ca. 15 Calls, damit
  das Budget nicht in den ersten Tagen verbraucht wird.
- Bei erreichtem Limit: kein API-Call, Antwort `{ available: false }`,
  Frontend zeigt Platzhalter.
- Jeder Call wird geloggt (Zeit, Hotel, Endpunkt, Status).
- Fehler/429 von TA → Platzhalter, kein Retry.

### US4 – Calls sparsam auslösen
- Nur auf Hotel-Detailseiten, niemals auf Listen-, Regions- oder
  Vergleichsseiten (dort Platzhalter bzw. Regionsbild).
- Fotos werden nicht im initialen HTML gerendert, sondern erst clientseitig
  nachgeladen, wenn die Galerie sichtbar wird oder der Nutzer auf
  "Fotos ansehen" klickt (bevorzugt: Klick).
- Bots/Crawler (User-Agent-Check) lösen keine Calls aus.
- Pro Session/IP max. 1 Call je Hotel innerhalb von 30 Minuten
  (nur Zähler/Flag speichern, keine API-Inhalte).
- Nur 1 Call pro Anzeige: Photos-Endpunkt (bis zu 5 Bilder).
  Details/Reviews werden nicht abgerufen.

### US5 – Darstellung
- Galerie mit max. 5 Bildern, Lazy Loading, Hinweis "Fotos: Tripadvisor"
  inkl. Logo und Link zur TA-Seite des Hotels gemäß Display Requirements.
- Fallback-Platzhalter im CI, wenn keine Bilder verfügbar sind.

### US6 – Admin-Übersicht
- Anzeige im Admin-Board: Calls diesen Monat / 400, Calls heute,
  Top-Hotels nach
