# Prompt: Bestandsaufnahme triprep-Admin (für die triprep-Sitzung)

Zum Einfügen in die Claude-Code-Sitzung im triprep-Repo. Nur lesen und auflisten – keine Änderungen am Code.

---

Bitte mach eine **Bestandsaufnahme des triprep-Admins** (admin.triprep.de und alles, was dazugehört). Nur lesen und
auflisten, **nichts am Code oder auf dem Server ändern**. Antworte auf Deutsch.

Hintergrund: Ich baue danielreuland.com als „Dach“ über meine Projekte (triprep, tri-hotel, fitnessracing-hotel.de) mit einem
eigenen Admin (Hub) für **Firmen und Kontakte (CRM)**, später Vertriebspipeline, Verträge und Rechnungen, eine
Gesamtübersicht über alle Projekte und den Serverbetrieb. Die Projekte behalten ihre eigenen Datenbanken und tauschen Daten
nur über eine versionierte interne API aus (nur lesend in v1, eigener Schlüssel je App, nur über 127.0.0.1).

**Grundregel für die Aufteilung:** In der App bleibt, was die Daten oder Regeln dieser App betrifft (Inhalte, Nutzer der
Seite, Fachlogik, Technik). Ins Dach kommt, was über alle Projekte geht: Firmen/Kontakte, Geschäftsbeziehungen, Verträge,
Rechnungen/Provisionen, Gesamtübersicht, Serverbetrieb. Trainings- und Gesundheitsdaten der Nutzer gehen nie ins CRM;
ein CRM-Kontakt darf höchstens mit einem triprep-Nutzer verknüpft werden (minimale Daten, Suche nur per exakter E-Mail).

Bitte liefere:

1. **Tabelle aller Admin-Bereiche** mit Spalten: Bereich (Menüpunkt/Route) · was man dort tut · welche Tabellen/Daten ·
   enthält personenbezogene Daten? (ja/nein, welche) · Empfehlung **triprep** / **Hub** / **geteilt** mit kurzer Begründung.
   Auch Bereiche außerhalb von admin.triprep.de, die administrativ sind (z. B. deals, lists, Blog-Redaktion, Newsletter,
   Partner, Statistiken, Nutzerverwaltung, Rollen).
2. **Partner/Firmen/Kontakte:** Wo verwaltet triprep heute Firmen, Partner, Sponsoren oder Ansprechpartner (auch in
   Freitextfeldern)? Diese wären Kandidaten für das CRM im Hub.
3. **Nutzerkonten:** Welche Felder hat ein Nutzer? Was wäre das Minimum für eine Verknüpfung CRM-Kontakt ↔ triprep-Nutzer
   (Vorschlag: interne ID, Anzeigename, E-Mail, Registrierungsdatum, Status)? Gibt es eine Rechtsgrundlage/Einwilligung
   dafür in der Datenschutzerklärung, oder müsste sie ergänzt werden?
4. **Kennzahlen** für ein Gesamt-Dashboard im Hub (z. B. Nutzer gesamt/neu 7 Tage, aktive Nutzer, Blogaufrufe) – was ist
   vorhanden und wie teuer abzufragen?
5. **Gesundheits-Endpunkt:** Gibt es einen (`/health` o. ä.), was prüft er (App, Datenbank)? Der Server-Wächter ruft
   derzeit `https://api.triprep.de/health` und `https://triprep.de/` ab.
6. Offene Punkte oder Risiken, die du bei der Aufteilung siehst.

Bitte die Antwort als Markdown, damit ich sie in die tri-hotel-Sitzung kopieren kann (dort liegt die Aufteilung in
`docs/admin-aufteilung.md`).
