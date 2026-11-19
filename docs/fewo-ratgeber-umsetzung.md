# Ratgeber „Trainingslager in der Ferienwohnung“ + Merkmal Ferienwohnung + FeWo-direkt-Links

Übergabe aus dem Chat vom 19.11.2026 (Recherche, Programmbedingungen, Links von Daniel). Inhaltliche Vorlage der Seite:
`docs/ratgeber-trainingslager-ferienwohnung-vorlage.md`. Dieses Dokument beschreibt die Umsetzung in tri-hotel.

Daniel gibt mit diesem Auftrag die **erste Ratgeberseite** frei (Backlog „Ratgeber `/ratgeber` (nach Freigabe)“). Weitere
Ratgeber bleiben zurückgestellt.

---

## Rahmen (gilt für alle Stories)

- **Neutralität:** Merkmal, Liste und Links ändern weder Score noch Reihenfolge. Sortierung der Ferienwohnungs-Liste nur nach Score.
- **Herkunft:** Das Merkmal „Ferienwohnung“ ist eine Faktenaussage und braucht einen Beleg wie jeder Wert der Stufe 2
  (`src/lib/evidence.js`: Fundstelle, Vermerk oder „Einschätzung der Redaktion“). Änderung schreibt `admin_actions`.
- **Keine Triathlon-Annahmen im Code:** Texte der Liste und Labels aus Ranking/Site bzw. Admin, nicht hart codiert.
- **Expedia/CJ-Programmbedingungen** (FeWo-direkt läuft über CJ, Vertragspartner Expedia, Inc.; Policies Fassung 14.06.2022):
  - Ziel-Link **unverändert** im `href` (Ziff. 8.1/8.2). **Kein `/go/`-Redirect** für FeWo-direkt-Links, kein Shortener.
    Zählung per Beacon (`data-count`, wie beim Website-Link in `entity.ejs`).
  - Deeplinks nur über den CJ-Generator „Deep Link AID“ (= `link_template` mit `{url_enc}`, siehe US4). Ziff. 14.3 der Special T&Cs
    liegt noch nicht vor (offen bei Daniel).
  - **Keine Marken in Meta-Tags** (Ziff. 5.1.7, 6.5): „FeWo-direkt“, „Vrbo“, „Expedia“ nie in `<title>`, Meta-Description,
    OG/Twitter-Tags, JSON-LD-`name`/`description` der Seite. Im Fließtext und Ankertext erlaubt. Test dafür (US6).
  - Keine iFrames, keine Inseratsfotos/-texte übernehmen (5.1.20, 5.1.24), keine Logos von Vermietern neben FeWo-Links (5.1.9).
  - Kein „Gutschein“, „Deal“, „Rabatt“ in Title/Meta (5.7).
- **Keine Fremdskripte, kein Hotlinking** (bestehende Backlog-Regel FeWo-direkt): CJ-Impression-Pixel (`<img>` von
  ftjcfx.com, lduhtrp.net, awltovhc.com) **nicht** einbauen; die Provision hängt am Klick. CJ-Banner **nicht** einbauen
  (Bild würde von CJ geladen) – Entscheidung Daniel offen, siehe unten.
- Kennzeichnung: „(Werbung)“ direkt an jedem FeWo-Link in normaler Schriftgröße, Hinweisbox unter der H1, Fußzeilen-Hinweis
  inkl. „VRBO ist eine Marke oder eingetragene Marke von Expedia, Inc.“. `rel="sponsored nofollow noopener"`, `target="_blank"`.

---

## US1 – Merkmal „Ferienwohnung“ am Objekt (Admin)

- Ablage in `entities.attributes.vacation_rental` (keine Migration nötig):
  `{ "value": true, "evidence_url": "…", "evidence_text": "…", "editorial_assessment": false, "set_at": "…", "set_by": "admin" }`.
  Fehlt der Schlüssel oder `value` ≠ true → kein Merkmal.
- Admin-Detail, Block **Stammdaten**: Kästchen „Als Ferienwohnung / Ferienhaus buchbar (Selbstversorger mit Küche)“ plus
  Belegfelder (gleiche Komponente/Logik wie bei Faktenwerten, `evidence.kind`). Speichern ohne Beleg → Fehler, Eingabe bleibt stehen
  (wie `fact-draft.js`). Entfernen ohne Beleg erlaubt.
- `admin_actions`-Eintrag bei Setzen/Entfernen (Aktion z. B. `vacation_rental.set` / `.unset`, mit Beleg im Payload).
- Objektliste im Admin: Filter „Ferienwohnung“ und kleines Badge in der Zeile.
- Erstes Objekt: **Villa Vista Mar** (Gran Canaria) – Daniel setzt das Merkmal selbst mit Beleg.
- Tests: Setzen mit/ohne Beleg, Entfernen, Audit-Eintrag, Filter.

## US2 – Ratgeberseite

- Route `GET /ratgeber/trainingslager-ferienwohnung` (Site tri-hotel.de; auf anderen Sites 404, solange dort kein Ratgeber
  freigegeben ist). In Sitemap aufnehmen, indexierbar, `lastmod` nur bei Inhaltsänderung.
- Inhalt aus `docs/ratgeber-trainingslager-ferienwohnung-vorlage.md`, Teil „Seitenvorlage“:
  - Nur Abschnitte und Werte übernehmen, die **nicht** `[PRÜFEN]` sind. Reiseziel-Karten ohne verifiziertes Bad weglassen
    (Regel aus der Vorlage: „Karte ohne verifiziertes Bad bekommt keinen FeWo-Link“). Die Seite darf nicht „im Aufbau“ wirken
    (Ziff. 3.2.4) – keine Platzhalter, keine leeren Karten.
  - Jeder Wert mit Herkunft und Stand-Datum (Quellenlinks aus der Vorlage), sichtbar „Aktualisiert: …“.
  - Title/Meta/H1 aus der Vorlage (enthalten keine Marken).
  - FAQ als `FAQPage`, Seite als `Article` mit `datePublished`/`dateModified`, `BreadcrumbList`.
- Speicherort des Inhalts: so wie die Regionsthemen-Seiten (`/region/:slug/:topic`, `area-topic.ejs`) – wenn dort Inhalte in der DB
  bzw. im Admin pflegbar sind, denselben Weg nehmen; sonst EJS-Partial `views/public/guides/trainingslager-ferienwohnung.ejs`.
  Bevorzugt pflegbar im Admin (Inhalte), damit Daniel Stand-Daten und Bad-Karten ohne Deploy ändern kann.
- Interne Links: alle `[INTERN: …]`-Slots der Vorlage auf vorhandene Seiten (Regionsseiten, `/hotels`, Camp-Anbieter, `/triscore`)
  auflösen; Slots ohne Zielseite weglassen.
- Mobil: 16-px-Rand, Tabellen horizontal scrollbar im eigenen Container, keine Seiten-Querscrolls.

## US3 – Liste „Top-Unterkünfte mit Ferienwohnung“

- Abschnitt auf der Ratgeberseite (Slot in der Vorlage unter dem Kurzfazit): alle **live** Objekte des Standard-Rankings mit
  `attributes.vacation_rental.value = true`, sortiert nach Score absteigend, max. 6, sonst Abschnitt ausblenden (bei 0 Treffern).
  Bei 1–2 Treffern trotzdem zeigen, Überschrift neutral („Unterkünfte im Ranking, die als Ferienwohnung buchbar sind“).
- Karte: Name, Ort/Region, Score + Label (aus `rankings.labels`), bis zu 3 Kernfakten mit Herkunft (Becken, Radraum, Küche –
  Kriterien per Konfiguration wählen, nicht per Code-Name), Link zur Objektseite. **Kein** Buchungslink auf der Karte.
- Wiederverwendbar als Partial, damit es später auch auf Regionsseiten erscheinen kann (dann gefiltert nach Region).
- Optional (gleiche Story, wenn wenig Aufwand): Filter „Ferienwohnung“ in `/hotels` und im Hotel-Finder.
- Tests: Auswahl nur live + Merkmal, Sortierung nach Score, unabhängig von Partnerstatus/Buchungslink.

## US4 – FeWo-direkt als Partnerprogramm (CJ-Deeplinks)

- Partnerprogramm `fewo-direkt` in `partner_programs` (Admin → Partner) anlegen bzw. per Migration vorbereiten (Status `inactive`,
  Daniel aktiviert):
  - `name`: FeWo-direkt
  - `domains`: `{fewo-direkt.de, www.fewo-direkt.de}`
  - `link_template`: `https://www.jdoqocy.com/jt82gv30v2IKJKSJQSMJIKJSOJSLJ?sid={sid}&url={url_enc}` – falls `{sid}` im
    Template-Mechanismus noch nicht existiert: ergänzen (Sub-ID je Seite/Slot, z. B. `ratgeber-fewo-palma`), sonst ohne `sid`.
  - Ziel-URLs: fewo-direkt.de-Adressen, die Daniel im Browser mit Ort und Filtern (ohne Reisedaten, ohne `utm_…`) kopiert.
- Feste CJ-Links, die Daniel schon erzeugt hat (bis Ziel-URLs je Ort vorliegen):
  | Zweck | href |
  |---|---|
  | allgemein (Startseite) | `https://www.dpbolvw.net/eh102hz74z6MONOWNUWQNMONTWUTRU` |
  | Kanaren | `https://www.anrdoezrs.net/mb116nmvsmu9BABJAHJDA9BDFHDJDB` |
  | Alcúdia | `https://www.tkqlhce.com/al102ox52x4KMLMULSUOLKMOPOTMRT` |
  Die zugehörigen `<img>`-Pixel **nicht** übernehmen.
- Link-Slots der Ratgeberseite im Admin pflegbar (Slot-Schlüssel → Ziel-URL oder fester CJ-Link, Ankertext, aktiv ja/nein).
  Fehlt ein Link für einen Slot, entfällt der Satz mit dem Link (keine toten Platzhalter).
- Ausgabe immer über eine gemeinsame Link-Komponente:
  `<a href="{cj-link}" target="_blank" rel="sponsored nofollow noopener" data-count="/go/ratgeber/fewo-direkt/{slot}/klick" data-goal="Partnerlink" data-goal-prop-anbieter="FeWo-direkt">{Ankertext}</a> <span class="ad-label">(Werbung)</span>`
  – `href` zeigt direkt auf CJ; gezählt wird nur per Beacon-Endpunkt (POST, wie `camps.js` `/go/camp/:slug/klick`), in
  `outbound_clicks` mit eigener `kind` (z. B. `fewo`), damit das Dashboard die Klicks dem Programm zuordnet. Kein GET-Redirect.
- Tests: Template-Ersetzung (Codierung der Ziel-URL, `sid`), Domain-Prüfung, Komponente rendert `rel`/Label, Beacon zählt.

## US5 – Hinweiskasten „Oder doch lieber in eine Ferienwohnung?“ (bestehender Backlog-Eintrag)

- Mit US4 umsetzen: Kasten in der Hotelliste und auf den Regionsseiten, als „Anzeige“ gekennzeichnet, fester Platz, verdrängt
  kein Hotel. Text, Position (Daniel: z. B. nach Platz 5 oder Listenende) und Link je Region im Admin.
- Startbelegung: Regionen der Kanaren → Kanaren-Link; Mallorca → Alcúdia-Link nur auf der Mallorca-Seite (später Palma/Pollença);
  übrige Regionen → allgemeiner Link. Kasten verlinkt zusätzlich intern auf den Ratgeber.

## US6 – Prüfungen, Datenschutz, Doku

- Test (oder Lint-Skript in `scripts/`), der für Ratgeber-, Regions- und Listen-Seiten sicherstellt: keine der Marken
  `FeWo-direkt|fewo-direkt|Vrbo|VRBO|Expedia` in `<title>`, `meta[name=description]`, `og:*`, `twitter:*`.
- Datenschutzerklärung: kurzer Absatz zu Affiliate-Links CJ/Expedia (Weiterleitung beim Klick, Tracking auf deren Seite).
  Keine Consent-Kategorie nötig, solange keine Pixel/Banner/Widgets eingebunden sind.
- `CLAUDE.md`/`BACKLOG.md` nachziehen (Merkmal, Ratgeber-Route, Regel „FeWo-Links ohne `/go/`“).

## Abnahme

1. Villa Vista Mar mit Merkmal + Beleg erscheint auf `/ratgeber/trainingslager-ferienwohnung` in der Top-Liste; ohne Merkmal nicht.
2. Seite ohne `[PRÜFEN]`, ohne leere Karten, jeder Wert mit Herkunft; Lighthouse/mobil ohne Querscroll.
3. Alle FeWo-Links: `href` = CJ-Link, `rel="sponsored nofollow noopener"`, „(Werbung)“, Klick zählt im Dashboard.
4. Markentest grün; kein Request an CJ-Domains beim reinen Seitenaufruf (Netzwerk-Tab).
5. `npm test` grün; Deploy erst nach „veröffentlichen“ von Daniel.

## Offen bei Daniel (nicht blockierend außer Nr. 1)

1. Ziel-URLs je Ort aus fewo-direkt.de (Palma, Port de Pollença, Girona, Maspalomas …) bzw. CJ-Links dazu.
2. Banner: weglassen (Empfehlung) oder Regel „keine Banner/kein Hotlinking“ bewusst ändern.
3. CJ fragen: Ziff. 14.3 (Deeplink-Regeln), E-Mail/PDF erlaubt? (Widerspruch „eMail zulässig“ vs. Ziff. 5.1.22), Markenhinweis
   für „FeWo-direkt“, Provisionssatz.
4. Prüfliste „Vor Veröffentlichung prüfen“ in der Vorlage (Bäder, Preise, Filter) – bestimmt, welche Karten live gehen.
