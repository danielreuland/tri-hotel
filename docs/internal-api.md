# Interne API v1 (tri-hotel ↔ Hub danielreuland.com)

Stand 03.11.2026 · **v1 final** (Konzept `docs/konzept-crm.md`, freigegeben 02.11.2026, inkl. Ergänzung D5).
Änderungen innerhalb von v1 nur abwärtskompatibel (neue Felder, neue Endpunkte, neue Ereignistypen); Brüche → `/internal/v2`.
Beispiel-Dateien: `docs/internal-api/fixtures/` – tri-hotel prüft seine echten Antworten in Tests gegen diese Form,
der Hub nutzt dieselben Dateien als Mocks. **Clients müssen unbekannte Felder ignorieren.**

Zwei Richtungen:

| Richtung | Wer ruft | Was |
|---|---|---|
| **A** tri-hotel bietet an, Hub liest | Hub → `GET http://127.0.0.1:3010/internal/v1/…` | Hotels, Camp-Anbieter, Partnerprogramme, Kennzahlen |
| **B** tri-hotel meldet Ereignisse | tri-hotel → `POST <HUB_EVENTS_URL>` (am Hub `/internal/v1/events`) | Anfrage gesendet/beantwortet, Ansprechpartner, Einwilligung, Foto-Erlaubnis |

## Grundsätze

- **Neutralität:** Daten fließen nur von tri-hotel zum Hub. tri-hotel liest aus dem Hub nichts, was Score, Reihenfolge,
  Faktenprüfung oder Anfragen beeinflusst (später höchstens den Link „Firma im CRM“, nie einen Partner-/Vertragsstatus).
- **Datensparsam:** Richtung A liefert keine Daten von *Nutzern* der Seite (Melder, Bewerter, Anfragende, Camp-Leads,
  Antwortende bei Hotel-Anfragen). Erlaubt sind geschäftliche Kontaktdaten von Unternehmen, die tri-hotel selbst mit Quelle
  gespeichert hat (Hotel-E-Mail, Telefon/E-Mail der Camp-Anbieter) – immer mit `source`/`evidence`.
  Ansprechpartner erreichen den Hub **nur** über Richtung B (`contact.profile`, `contact.consent`), wenn das Antwortformular
  und die Datenschutzerklärung das ankündigen.
- **Nur intern erreichbar:** Beide Apps laufen auf demselben Server. Der Hub ruft `http://127.0.0.1:3010` direkt auf
  (Header `Host: tri-hotel.de` optional). Nginx liefert `/internal/` öffentlich nicht aus
  (`location /internal/ { return 404; }` in allen Server-Blöcken), zusätzlich antwortet die App mit **404**, wenn die Anfrage
  nicht von Loopback stammt oder einen der Header `X-Forwarded-For`, `X-Real-IP`, `Forwarded` trägt (dann kam sie über Nginx).
- Antworten: JSON (UTF-8), `Cache-Control: no-store`, `X-Robots-Tag: noindex`. Keine Cookies, keine Sitzung.
- Zeitangaben ISO 8601 in UTC (`2026-11-02T08:00:00.000Z`), reine Tage als `YYYY-MM-DD`, Monate als `YYYY-MM`.
  IDs sind UUIDs. Ländercodes ISO 3166-1 alpha-2.

## Authentifizierung (HMAC je App, beide Richtungen gleich)

Jede aufrufende App hat ein eigenes Geheimnis (≥ 32 Byte zufällig, z. B. `openssl rand -hex 32`), nur in den
`.env`-Dateien auf dem Server – nie im Repo oder Chat.

| Richtung | tri-hotel `.env` | Hub `.env` |
|---|---|---|
| A | `INTERNAL_API_KEYS=hub:<geheimnis_a>` | `TRIHOTEL_API_URL=http://127.0.0.1:3010`, `TRIHOTEL_API_SECRET=<geheimnis_a>` |
| B | `HUB_EVENTS_URL=http://127.0.0.1:3020/internal/v1/events`, `HUB_EVENTS_SECRET=<geheimnis_b>` | z. B. `INTERNAL_EVENT_KEYS=tri-hotel:<geheimnis_b>` (Name im Hub frei) |

Header jeder Anfrage:

| Header | Inhalt |
|---|---|
| `X-Internal-App` | Name der aufrufenden App: `hub` (Richtung A), `tri-hotel` (Richtung B); `[a-z0-9-]{1,32}` |
| `X-Internal-Timestamp` | Unix-Zeit in Sekunden (ganzzahlig) |
| `X-Internal-Nonce` | nur Richtung B (Pflicht): zufälliger Wert je Zustellversuch, `[A-Za-z0-9-]{16,64}` (tri-hotel: UUID) |
| `X-Internal-Signature` | `hex(HMAC-SHA256(geheimnis, kanon))`, 64 Zeichen, Kleinbuchstaben |

```
kanon = `${timestamp}\n${METHOD}\n${pfad_mit_query}\n${hex(sha256(body))}`          // ohne Nonce
kanon = `${timestamp}\n${METHOD}\n${pfad_mit_query}\n${hex(sha256(body))}\n${nonce}` // mit Nonce
```

- `METHOD` in Großbuchstaben, `pfad_mit_query` genau wie gesendet (z. B. `/internal/v1/entities?q=club&limit=5`), ohne Host.
- Body bei GET leer → sha256 des leeren Strings (`e3b0c442…b855`). Bei POST die exakt gesendeten Bytes.
- Zeitabweichung > 300 s → 401. Vergleich der Signatur zeitkonstant (`crypto.timingSafeEqual`).
- **Nonce (Richtung B):** Der Empfänger merkt sich Nonces mindestens 10 min und lehnt eine bekannte Nonce mit 401 ab.
  Richtung A ist nur lesend; eine Wiederholung innerhalb des Zeitfensters ist dort hinnehmbar (Nonce wird ignoriert).
- **Schlüsselwechsel ohne Ausfall:** Mehrere Einträge je App sind erlaubt (`hub:<neu>,hub:<alt>`); geprüft wird gegen alle.
  Ablauf: neuen Schlüssel beim Empfänger zusätzlich eintragen → Sender umstellen → alten Eintrag entfernen.
- Referenz-Implementierung: `src/lib/internal-auth.js` (tri-hotel) – Hub darf sie kopieren.

## Fehler und Grenzen (Richtung A)

Fehler immer als JSON `{ "error": "<code>", "message": "<Text auf Deutsch>" }`:

| Status | `error` | Wann |
|---|---|---|
| 400 | `bad_request` | Parameter fehlt/ungültig (z. B. `q` < 2 Zeichen, `ids` > 100, keine UUID) |
| 401 | `unauthorized` | Header fehlen, App unbekannt, Signatur falsch, Zeitfenster überschritten |
| 404 | `not_found` | Objekt unbekannt **oder** Anfrage nicht von Loopback / über Nginx (dann ohne weiteren Hinweis) |
| 405 | `method_not_allowed` | andere Methode als GET |
| 429 | `rate_limited` | mehr als **120 Aufrufe je Minute und App**; Header `Retry-After` (Sekunden) |
| 500 | `internal` | Fehler in tri-hotel |

Jeder Aufruf wird protokolliert (Tabelle `internal_api_calls`: Zeit, App, Methode, Pfad **ohne Query-Werte**, Status, Dauer) –
ohne Signatur, 90 Tage aufbewahrt. Empfohlen für den Hub-Client: Timeout 3 s, Fehler tolerieren, Anzeige-Caches.

## Richtung A – Endpunkte

Gemeinsame Bausteine:

- **`rankings[]`** je Objekt: alle Rankings, in denen das Objekt steht – `{ code, name, site, status, score, provisional,
  completeness, url }`. `status` ∈ `draft | in_review | live | rejected`; `score` 0–100 oder `null`; `completeness` 0–1 oder
  `null`; `url` nur bei `live`, sonst `null`; `site` = Hauptdomain der Site (`tri-hotel.de`).
- **`contact`**: `{ email, phone, source, evidence }` oder `null`. `source` ∈ `website | hunter | osm | admin | …` (wie in
  tri-hotel gespeichert, Liste kann wachsen), `evidence` = URL der Fundstelle oder `null`. Nur Unternehmensadressen; enthält
  ein Feld erkennbar eine Person (vorname.nachname@), übernimmt der Hub sie nur nach Bestätigung.

### `GET /internal/v1/entities?q=<text>&limit=<1–50, Standard 20>`
Suche nach Name oder Ort (mind. 2 Zeichen, Groß-/Kleinschreibung egal), sortiert nach Name. Alle Objekte, auch ohne
Live-Status. Antwort `{ "items": [Kurzform …] }` → Fixture `entities-search.json`.

Kurzform: `{ id, name, city, country, type, website, rankings[], updatedAt }`.

### `GET /internal/v1/entities?ids=<uuid>,<uuid>,…`
Stapelabruf (1–100 IDs) zum Auffrischen der Anzeige-Caches. Antwort wie die Suche; unbekannte IDs fehlen einfach.
`q` und `ids` zusammen → 400.

### `GET /internal/v1/entities/:id`
Kurzform plus `address`, `region`, `contact` → Fixture `entity.json`. 404, wenn unbekannt.

- `address`: `{ street, postalCode, city, country, text }` (aus den Grunddaten, sonst nur Ort/Land); `text` = einzeilig.
- `region`: `{ slug, name, site }` – erste Trainingsregion, in der das Objekt liegt, oder `null`.

### `GET /internal/v1/entities/:id/metrics?days=<1–365, Standard 30>`
Lead-Argumente → Fixture `entity-metrics.json`.

- `pageviews`, `visitors`: Summe über alle Live-Seiten des Objekts (Plausible, je Seite ~6 h gecacht); `null`, wenn
  Plausible nicht eingerichtet oder nicht erreichbar. `pages[]` = Einzelwerte je Seite.
- `partnerClicks[]`: Klicks auf Partnerlinks dieses Objekts je Programm (`program` = Code) im Zeitraum.
- `inquiry`: letzte Faktenanfrage (ohne Entwürfe) `{ status, sentAt, answeredAt }` oder `null`, **ohne Personendaten**.
  `status` ∈ `queued | sent | answered | expired | failed | closed`.
- `completeness`: Vollständigkeit (0–1) im Standard-Ranking bzw. im ersten Ranking des Objekts; je Ranking in `rankings[]`.

### `GET /internal/v1/camp-providers?q=<text>&limit=…` · `?ids=…` · `/:id`
Wie `entities` (Suche nach Name oder Sitz) → Fixtures `camp-providers-search.json`, `camp-provider.json`.

Kurzform: `{ id, name, site, status, seat, website, url, updatedAt }` – `status` ∈ `draft | active | archived`,
`url` nur bei `active`. Detail zusätzlich: `model`, `regions[]`, `contact` (mit `phone`), `leadActive`
(Anfrageformular aktiv, d. h. Lead-Vereinbarung besteht – reine Information für das CRM).

### `GET /internal/v1/camp-providers/:id/metrics?days=<1–365, Standard 30>`
→ Fixture `camp-provider-metrics.json`. `pageviews`/`visitors` des Profils (Plausible, gecacht, sonst `null`),
`clicks` „Zum Anbieter“ im Zeitraum, `campRequests` = Anzahl Camp-Anfragen an diesen Anbieter **nur als Zahlen**:
`total`/`confirmed`/`forwarded` im Zeitraum und `byMonth[]` der letzten 12 Monate (Grundlage für spätere Lead-Abrechnung).

### `GET /internal/v1/partner-programs`
Alle Partnerprogramme → Fixture `partner-programs.json`: `{ code, name, status, monetized, directLink, coverage, clicks }`.
`monetized` = Links tragen eine Partnerkennung (mit Provision). `coverage` bezogen auf alle Live-Objekte (alle Rankings):
`{ live, links, derived, absent, missing, share }` (`share` in %). `clicks` = `{ d7, d30 }` (eigene Links + Suchlinks).

### `GET /internal/v1/stats`
Hub-Dashboard → Fixture `stats.json`. Je Site: Objekte (`live` in Rankings der Site, `review` = Meldungen in Prüfung),
aktive Camp-Anbieter, Camp-Anfragen 7/30 Tage, Besuche (Plausible-Besucher 7/30 Tage, sonst `null`).
Werte ohne Site-Bezug unter `totals`: offene Aufgaben, Partner-Klicks, Camp-Klicks (je `d7`/`d30`).

## Richtung B – Ereignisse tri-hotel → Hub

`POST <HUB_EVENTS_URL>` (am Hub `/internal/v1/events`), `Content-Type: application/json`, ein Ereignis je Aufruf,
signiert wie oben mit `X-Internal-App: tri-hotel` **und** `X-Internal-Nonce`.

Hülle (Fixtures `events/*.json`):
```json
{ "id": "uuid", "type": "inquiry.sent", "version": 1, "occurredAt": "2026-11-02T08:00:00.000Z",
  "source": { "app": "tri-hotel", "site": "tri-hotel.de" },
  "entity": { "id": "uuid", "name": "Club La Santa", "type": "hotel" },
  "data": { … } }
```

- `id` ist je Ereignis fest (auch bei Wiederholungen) → **Hub verarbeitet idempotent**: bekannte `id` = 2xx ohne erneute
  Verarbeitung. `version` erhöht sich nur bei inkompatiblen Änderungen von `data` eines Typs.
- Antwort des Hubs: **2xx** = angenommen (auch Duplikat). **4xx** (außer 408/429) = dauerhaft abgelehnt, tri-hotel versucht es
  nicht erneut und protokolliert. **5xx, 408, 429, Zeitüberschreitung (5 s)** = tri-hotel wiederholt mit wachsendem Abstand
  (bis zu 10 Versuche über ca. 1 Tag) und neuer Nonce. Reihenfolge ist nicht garantiert – `occurredAt` zählt.
- Ohne `HUB_EVENTS_URL`/`HUB_EVENTS_SECRET` protokolliert tri-hotel das Ereignis nur (kein Fehler, kein Versand).
- tri-hotel speichert Ereignisse bis zur Zustellung (Tabelle `hub_events`), danach ohne Inhalt; nach 90 Tagen gelöscht.

| Typ | Auslöser | `data` |
|---|---|---|
| `inquiry.sent` | Faktenanfrage an das Hotel versendet | `inquiryId`, `ranking`, `language`, `sentAt`, `expiresAt`, `askPhotos`, `questions` (Anzahl) |
| `inquiry.answered` | Hotel hat das Antwortformular abgeschickt | `inquiryId`, `ranking`, `answeredAt`, `answers` (Anzahl), `photos` (Anzahl), `consents[]` (Typen) – keine Namen |
| `contact.profile` | Ansprechpartner fürs Profil angegeben (ab Paket P2) | `inquiryId`, `contact` {`salutation`, `firstName`, `lastName`, `position`, `email`, `phone`, `language`}, `legalBasis` (`legitimate_interest`), `noticeVersion`, `collectedAt` |
| `contact.consent` | Einwilligung in Kontakt zu Kooperationen erteilt oder widerrufen (ab P2) | `inquiryId`, `contact` {`email`, `firstName`, `lastName`}, `purpose` (`partner_contact`), `channel` (`email`), `granted` (bool), `textVersion`, `text`, `language`, `grantedAt`, `doubleOptInAt`, `withdrawnAt` |
| `photos.permission` | Nutzungserlaubnis für Fotos erteilt oder widerrufen | `inquiryId`, `scopes[]` (`profile`, `social`), `granted` (bool), `photos` (Anzahl), `credit`, `textVersion`, `grantedAt`, `withdrawnAt` |

Hinweise:
- `contact.consent` mit `granted: true` wird erst nach dem **Double-Opt-in** gesendet (`doubleOptInAt` gesetzt). Der Hub
  übernimmt `text` + `textVersion` + Zeitpunkte als Einwilligungsnachweis (E-Mail-Werbung nur damit).
- `contact.profile` ist **keine** Werbe-Einwilligung (Rechtsgrundlage berechtigtes Interesse, Profilpflege).
- Neue Typen kommen abwärtskompatibel dazu; der Hub beantwortet unbekannte Typen mit 2xx und ignoriert sie.

## Später (nicht v1)
- Hub → tri-hotel: Link „Firma im CRM“ im tri-hotel-Admin (`GET` am Hub: `/internal/v1/links?app=tri-hotel&kind=entity&id=…`,
  liefert nur URL + Firmenname, nie einen Status).
- Weitere Ereignisse (z. B. „Hotel live“, „Camp-Anfrage weitergeleitet“).
- triprep: Nutzersuche nur per exakter E-Mail, minimale Felder (eigener Vertrag in triprep).
