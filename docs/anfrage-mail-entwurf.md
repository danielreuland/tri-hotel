# Anfrage-Mail an Hotels – eingebaute Fassung

Stand 04.11.2026 · Text von Daniel (04.11.), eingebaut mit Migration 101 als `ai_mail_templates` der Site tri-hotel (Paket P1 der
Hotel-Ansprache, Konzept: https://claude.ai/artifact/EmRgGEgm2TMm9vSfkvvpqj). Änderungen danach im Admin unter E-Mails → KI-Mails → Datenanfrage;
der Text wird dort wörtlich verwendet (feste Vorlage, keine KI-Formulierung). Absender: Daniel Reuland (`daniel@tri-hotel.de`, Persona `founder`).

## Formular hinter dem Link

Mit der festen Vorlage zeigt das Formular alle Angaben zum Prüfen (`fullCheckSelection`): Stammdaten, jeden bekannten erfragbaren Wert zum Bestätigen oder Korrigieren,
offene und strittige Werte als Fragen, alle erfassten Leistungen und die übrigen Leistungen des Katalogs. Die Auswahl im Admin entfällt dabei. Automatische Werte wie Klima sind nicht erfragbar und fehlen.

## Spielregeln

- **Redaktionell bleiben (D1, freigegeben 02.11.):** keine Frage nach Vertrieb, Kooperation, Partnerschaft, Werbung oder Preisen in der Mail.
- Hinweis „kostenlos, Platzierungen nicht käuflich“ und die Zeile „Warum Sie diese Mail erhalten …“ mit Abmeldelink bleiben drin.
- Mia wird als KI-Assistentin genannt. Erinnerungen schreibt Mia, mit KI-Hinweis.

## Deutsch

Betreff: {{objekt}} auf tri-hotel.de – kurz prüfen?

```
Guten Tag,

ich bin Daniel Reuland, selbst aktiver Triathlet und Rennradfahrer aus Kaiserslautern. tri-hotel.de habe ich gestartet, weil es keine neutrale Übersicht gab, die Hotels nach dem bewertet, was im Trainingslager wirklich zählt. tri-hotel.de ist eine unabhängige Übersicht über Hotels fürs Triathlon-Trainingslager. Jedes Hotel bekommt einen TriScore aus geprüften Fakten, jeder Wert steht mit Quelle auf der Hotelseite. Der Eintrag ist kostenlos, Platzierungen sind nicht käuflich.

{{#platz}}{{objekt}} steht bei tri-hotel.de mit einem Score von {{score}} auf Platz {{platz}} von {{gesamt}} Hotels.{{/platz}}{{#ohne_platz}}{{objekt}} ist bei tri-hotel.de erfasst.{{/ohne_platz}}{{#kernfakten}} Erfasst haben wir unter anderem: {{kernfakten}}.{{/kernfakten}}
{{#hotelseite}}
Ihre Hotelseite: {{hotelseite}}
{{/hotelseite}}

Prüfen und ergänzen Sie jetzt Ihre Angaben und individualisieren Sie das Profil mit eigenen Bildern. Wir zeigen diese natürlich mit Urhebervermerk.

{{LINK}}

Dauert keine 5 Minuten und funktioniert ohne Anmeldung. Alternativ können Sie einfach auf diese E-Mail antworten.

Wer ist bei Ihnen die richtige Person für Ihr Profil bei uns? Im Formular können Sie Namen und Adresse eintragen, damit Rückfragen künftig direkt ankommen.

Viele Grüße
Daniel Reuland
Gründer tri-hotel.de

Bei Rückfragen hilft Ihnen Mia, unsere KI-Assistentin; ich lese jede Antwort selbst.

--
Warum Sie diese Mail erhalten: Ihr Hotel ist auf tri-hotel.de erfasst.
[Hinweise zum Datenschutz]({{datenschutz}})
[Keine weiteren Anfragen gewünscht?]({{abmelden}})
```

## Englisch (für alle Länder außer DE, AT, CH, LI, LU)

Betreff: {{objekt}} on tri-hotel.de – a quick check?

```
Hello,

my name is Daniel Reuland, an active triathlete and road cyclist from Kaiserslautern, Germany. I started tri-hotel.de because there was no neutral overview rating hotels on what really counts at a training camp. tri-hotel.de is an independent overview of hotels for triathlon training camps. Every hotel gets a TriScore based on verified facts, and every value is shown with its source on the hotel page. The listing is free of charge; rankings cannot be bought.

{{#platz}}{{objekt}} is listed on tri-hotel.de with a score of {{score}}, in position {{platz}} of {{gesamt}} hotels.{{/platz}}{{#ohne_platz}}{{objekt}} is listed on tri-hotel.de.{{/ohne_platz}}{{#kernfakten}} Among other things, we have recorded: {{kernfakten}}.{{/kernfakten}}
{{#hotelseite}}
Your hotel page: {{hotelseite}}
{{/hotelseite}}

Please check and complete your details now and personalise your profile with your own photos. We will of course show them with your photo credit.

{{LINK}}

It takes less than 5 minutes and works without logging in. Alternatively, you can simply reply to this email.

Who is the right person at your hotel for your profile with us? You can enter a name and address in the form so that future questions reach them directly.

Best regards
Daniel Reuland
Founder of tri-hotel.de

If you have questions, Mia, our AI assistant, will help you; I read every reply myself.

--
Why you are receiving this email: your hotel is listed on tri-hotel.de.
[Privacy information]({{datenschutz}})
[No further requests?]({{abmelden}})
```

## Platzhalter und Abschnitte

| Platzhalter | Inhalt |
|---|---|
| `{{objekt}}` | Name des Hotels |
| `{{score}}`, `{{platz}}`, `{{gesamt}}` | Score, Platz, Anzahl Hotels im Ranking |
| `{{kernfakten}}` | bis zu 5 erfasste filterbare Leistungen (Englisch: per KI übersetzt) |
| `{{hotelseite}}` | Link zur öffentlichen Hotelseite |
| `{{LINK}}` | persönlicher Link; allein auf der Zeile wird er zum Knopf „Jetzt Angaben ergänzen und Fotos hochladen“ (ohne sichtbare Adresse darunter) |
| `{{datenschutz}}`, `{{abmelden}}` | Datenschutzerklärung, Abmeldelink |
| `{{#platz}}`, `{{#ohne_platz}}`, `{{#kernfakten}}`, `{{#hotelseite}}` | Sätze nur, wenn die Angabe vorhanden ist |
| `[Wörter](Link)` | legt den Link hinter die Wörter, z. B. `[Hinweise zum Datenschutz]({{datenschutz}})` |
