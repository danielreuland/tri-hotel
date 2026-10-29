# Interne API v1 (tri-hotel ↔ Hub danielreuland.com)

Stand 29.10.2026 · Entwurf, wird in tri-hotel gebaut (BACKLOG „Dach danielreuland.com“, Schritt 3). Änderungen nur
abwärtskompatibel innerhalb von v1; Brüche → `/internal/v2`.

## Grundsätze

- **Nur lesend** in v1. Der Hub (CRM) verknüpft Firmen mit Hotels und Camp-Anbietern über deren tri-hotel-IDs.
- **Neutralität:** tri-hotel liest aus dem Hub höchstens den Link „Firma im CRM“, nie einen Partner- oder Vertragsstatus.
  Nichts aus dem Hub fließt in Score oder Reihenfolge.
- **Datensparsam:** keine personenbezogenen Daten (Melder, Kontakt-Mails, Anfragen) in v1.
- **Nur intern erreichbar:** Beide Apps laufen auf demselben Server. Der Hub ruft `http://127.0.0.1:3010` direkt auf
  (Header `Host: tri-hotel.de`). Nginx liefert `/internal/` öffentlich nicht aus (`location /internal/ { return 404; }`),
  zusätzlich lehnt die App Anfragen ab, die über Nginx kommen (`X-Forwarded-For` gesetzt) oder nicht von Loopback stammen.

## Authentifizierung (HMAC je App)

Jede aufrufende App hat ein eigenes Geheimnis (mind. 32 Byte, zufällig), nur in den `.env`-Dateien auf dem Server.

- tri-hotel: `INTERNAL_API_KEYS=hub:<geheimnis>` (mehrere kommagetrennt, z. B. später `triprep:<…>`)
- Hub: `TRIHOTEL_API_URL=http://127.0.0.1:3010`, `TRIHOTEL_API_SECRET=<geheimnis>`

Header jeder Anfrage:

| Header | Inhalt |
|---|---|
| `X-Internal-App` | Name der aufrufenden App, z. B. `hub` |
| `X-Internal-Timestamp` | Unix-Zeit in Sekunden |
| `X-Internal-Signature` | hex(HMAC-SHA256(geheimnis, `${timestamp}\n${METHOD}\n${pfad_mit_query}\n${hex(sha256(body))}`)) |

- Body bei GET leer → sha256 des leeren Strings.
- Abweichung der Zeit > 300 s → 401. Vergleich der Signatur zeitkonstant (`crypto.timingSafeEqual`).
- Jeder Aufruf wird protokolliert (App, Methode, Pfad, Status, Dauer) – ohne Signatur.
- Fehler: JSON `{ "error": "…" }` mit 400 / 401 / 404 / 500.

## Endpunkte

### `GET /internal/v1/entities?q=<text>&limit=<1–50, Standard 20>`
Suche nach Name oder Ort (mind. 2 Zeichen). Antwort:
```json
{ "items": [ {
  "id": "uuid", "name": "Club La Santa", "city": "Tinajo", "country": "ES",
  "type": "hotel", "website": "https://…",
  "rankings": [ { "code": "triathlon-hotel", "name": "…", "status": "live", "score": 90,
                  "url": "https://tri-hotel.de/hotel/club-la-santa-tinajo" } ]
} ] }
```

### `GET /internal/v1/entities/:id`
Ein Objekt wie oben, 404 wenn unbekannt.

### `GET /internal/v1/camp-providers?q=<text>&limit=…` und `GET /internal/v1/camp-providers/:id`
```json
{ "items": [ { "id": "uuid", "name": "Club La Santa", "status": "active", "website": "https://…",
               "url": "https://tri-hotel.de/trainingscamp/anbieter/club-la-santa" } ] }
```

### `GET /internal/v1/stats`
Kennzahlen fürs Hub-Dashboard, je Site:
```json
{ "sites": [ { "code": "tri-hotel", "domain": "tri-hotel.de",
  "objects": { "live": 42, "review": 3 }, "camps": { "active": 22 },
  "tasks": { "open": 155 }, "partnerClicks": { "d7": 0, "d30": 0 },
  "visits": { "d7": 208, "d30": 328 } } ],
  "generatedAt": "2026-10-29T12:00:00Z" }
```

## Später (nicht v1)
- Hub → tri-hotel: Link „Firma im CRM“ im tri-hotel-Admin (`GET` am Hub: `/internal/v1/links?app=tri-hotel&kind=hotel&id=…`).
- Ereignisse (z. B. „Hotel live“, „Camp-Anfrage“) per Webhook an den Hub.
- triprep: Nutzersuche nur per exakter E-Mail, minimale Felder (eigener Vertrag in triprep).
