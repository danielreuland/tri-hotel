# Aufteilung der Admin-Bereiche: Hub (danielreuland.com) und Apps

Stand 29.10.2026 · von Daniel bestätigt. Gilt für tri-hotel, triprep und den Hub danielreuland.com.

## Grundregel

- **In der App bleibt**, was die Daten oder Regeln dieser App betrifft (Inhalte, Nutzer der Seite, Score, Technik).
- **Ins Dach (Hub) kommt**, was über alle Projekte geht: Firmen und Kontakte, Geschäftsbeziehungen, Verträge,
  Rechnungen/Provisionen, die Gesamtübersicht über alle Projekte und der Serverbetrieb.
- Datenaustausch nur über die interne API der jeweiligen App (Vertrag: `docs/internal-api.md`), nie direkt in fremde
  Datenbanken. Jede App bietet ihre eigenen Daten an; der Hub ruft ab und bietet seine eigenen CRM-Daten an.
- **Neutralität (tri-hotel):** Nichts aus dem Hub (Partner-, Vertrags-, Kundenstatus) beeinflusst Score oder Reihenfolge.

## tri-hotel/admin

| Bereich | Wohin | Hinweis |
|---|---|---|
| Dashboard | tri-hotel + Kurzfassung im Hub | Hub zeigt alle Projekte nebeneinander (`/internal/v1/stats`) |
| Aufgaben-Board | tri-hotel | Karten entstehen und schließen sich in tri-hotel; Hub zeigt Anzahl + Link. Vertriebsaufgaben sind CRM-Aufgaben im Hub |
| Postfach, Kontakt, Bewertungen | tri-hotel | gehören zur Seite und ihren Nutzern |
| Anfragen an Hotels | tri-hotel | Faktenprüfung; Ansprechpartner ggf. später ins CRM (eigener Schritt, Rechtsgrundlage) |
| Camp-Anfragen (Leads) | tri-hotel; Abrechnung im Hub | Weiterleitung hier, Rechnung über Leads später im Hub |
| Inhalte (Objekte, Startseite, Bilder, Camps, Regionen, Radreviere, Leistungen, KI-Texte) | tri-hotel | |
| Rankings, Sites | tri-hotel | fitnessracing-hotel.de wird eine Site der App |
| Partnerprogramme | geteilt | Technik (Link-Vorlagen, Logos, Kennzeichnung, Klickzählung) in tri-hotel; Firma, Ansprechpartner, Konditionen, Auszahlungen im Hub |
| Camp-Anbieter | geteilt | Profil/Inhalt in tri-hotel; Firma, Vertrag, Rechnung im Hub |
| E-Mail-Vorlagen, Log | tri-hotel | jede App protokolliert sich selbst; Hub hat ein eigenes Audit-Log |
| Team (Admin-Konten) | tri-hotel, später Hub | mit gemeinsamem Login (Phase 4) Personen zentral, Rechte je App |
| Partner-CRM, „Partner werden“, Provisionsabrechnung (früher Phase 2 im tri-hotel-Admin) | Hub | entschieden 29.10. |

## Serverbetrieb (Hub-Repo, Ordner `ops/`)

| Was | Heute | Ziel |
|---|---|---|
| Server-Wächter (`scripts/watchdog.js`, Timer) | tri-hotel-Repo, aktiv seit 29.10. | `ops/` im Hub-Repo, läuft unabhängig von der Hub-App (eigene Abhängigkeiten, eigene Konfigurationsdatei statt tri-hotel-`.env`); Status im Hub-Admin |
| `/healthz` je App | tri-hotel | bleibt in jeder App (Hub und triprep bekommen eigene) |
| Nginx-Konfigurationen, Backup-Skript, Logrotate | nur auf dem Server (teils Kopien in `static-sites/`) | `ops/` im Hub-Repo als Dokumentation/Vorlage |
| danielreuland.com-Platzhalter | `static-sites/danielreuland.com/` | wird durch die Hub-App ersetzt |
| fitnessracing-hotel.de-Seiten | `static-sites/fitnessracing-hotel.de/` | bleiben in tri-hotel (künftige Site der App) |

## triprep/admin

Offen – Bestandsaufnahme durch die triprep-Sitzung (Prompt: `docs/prompts/triprep-admin-inventory.md`), danach hier ergänzen.
Erwartung nach der Grundregel: Nutzerkonten, Blog, Rechner und Inhalte bleiben in triprep; Partnerfirmen (z. B. Deals)
und deren Kontakte in den Hub; Kontakt ↔ triprep-Nutzer nur als Verknüpfung mit minimalen Daten.
