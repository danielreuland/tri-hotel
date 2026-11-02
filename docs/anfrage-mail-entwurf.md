# Anfrage-Mail an Hotels – Entwurf zum Bearbeiten

Stand 02.11.2026 · Konzept: https://claude.ai/artifact/EmRgGEgm2TMm9vSfkvvpqj · **Daniel bearbeitet den Text unten frei.**
Wenn er fertig ist, baut Claude daraus die Vorlage (Paket P1); Englisch und weitere Sprachen werden daraus übersetzt.

## Spielregeln (bitte beim Bearbeiten beachten)

- **Redaktionell bleiben (D1, freigegeben 02.11.):** keine Frage nach Vertrieb, Kooperation, Partnerschaft, Werbung oder Preisen
  in der Mail – sonst gilt die ganze Mail als Werbung ohne Einwilligung. Das steht erst freiwillig im Antwortformular.
- Hinweis „kostenlos, Platzierung nicht käuflich“ und die Zeile „Warum Sie diese Mail erhalten …“ mit Abmeldelink bleiben drin.
- Mia wird als KI-Assistentin genannt, wenn sie erwähnt wird.
- Platzhalter in `{{doppelten Klammern}}` werden je Hotel gefüllt. Neue Platzhalter gern ergänzen – unten in der Liste kurz
  beschreiben, was hinein soll.
- Abschnitte zwischen `{{#name}}` und `{{/name}}` erscheinen nur, wenn sie zutreffen (z. B. Fotos nur, wenn das Hotel noch kein
  eigenes Foto hat).

## Betreff

{{hotel}} auf tri-hotel.de – kurz prüfen?

## Text

Guten Tag,

ich bin Daniel Reuland {{vorstellung}}. tri-hotel.de ist eine unabhängige Übersicht über Hotels fürs Triathlon-Trainingslager.
Jedes Hotel bekommt einen TriScore aus geprüften Fakten, jeder Wert steht mit Quelle auf der Hotelseite. Der Eintrag ist
kostenlos, Platzierungen sind nicht käuflich.

{{hotel}} steht bei uns mit einem TriScore von {{score}} auf Platz {{platz}} von {{anzahl}} Hotels. Erfasst haben wir unter
anderem: {{kernfakten}}.

Ihre Hotelseite: {{hotelseite}}
Angaben prüfen und ergänzen (etwa 3 Minuten, ohne Anmeldung): {{LINK}}

{{#fotos}}
Bisher zeigen wir bei Ihrem Hotel nur ein Beispielbild der Region. Über denselben Link können Sie uns Fotos hochladen oder uns
erlauben, ausgewählte Fotos Ihrer Website zu verwenden. Wir zeigen sie mit Ihrem Urhebervermerk.
{{/fotos}}

Wer ist bei Ihnen die richtige Person für Ihr Profil bei uns? Im Formular können Sie Namen und Adresse eintragen, damit
Rückfragen künftig direkt ankommen.

Sie können auch einfach auf diese Mail antworten.

Viele Grüße
Daniel Reuland
Gründer tri-hotel.de
Bei Rückfragen hilft Ihnen Mia, unsere KI-Assistentin; ich lese jede Antwort selbst.

---
Warum Sie diese Mail erhalten: Ihr Hotel ist auf tri-hotel.de erfasst, Ihre Adresse stammt von Ihrer Website.
Hinweise zum Datenschutz: {{datenschutz}} · Keine weiteren Mails gewünscht? {{abmelden}}

## Platzhalter

| Platzhalter | Inhalt |
|---|---|
| `{{vorstellung}}` | **von Daniel zu schreiben:** 1–2 Sätze, z. B. Triathlet seit …, warum tri-hotel – oder direkt in den Text oben einsetzen |
| `{{hotel}}` | Name des Hotels |
| `{{score}}` | aktueller TriScore (bei „vorläufig“ mit Zusatz „vorläufig“) |
| `{{platz}}` / `{{anzahl}}` | Platz im Ranking / Anzahl Hotels im Ranking (ohne Platz, wenn das Profil unvollständig ist → Satz wird angepasst) |
| `{{kernfakten}}` | 3–5 wichtigste erfasste Leistungen, z. B. „50-m-Becken im Hotel, abschließbare Radgarage, 400-m-Bahn in der Nähe“ |
| `{{hotelseite}}` | öffentlicher Link zur Hotelseite |
| `{{LINK}}` | persönlicher Link zum Antwortformular |
| `{{datenschutz}}` / `{{abmelden}}` | Link zur Datenschutzerklärung / Abmeldelink (keine weiteren Anfragen an diese Adresse) |
| `{{#fotos}}…{{/fotos}}` | nur, wenn das Hotel noch kein eigenes freigegebenes Foto hat |

## Notizen von Daniel

- 
