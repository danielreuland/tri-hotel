# Anfrage-Mail an Hotels – eingebaute Fassung

Stand 05.11.2026 · Zweite Fassung von Daniel (05.11.), Englisch dazu übersetzt, eingebaut mit Migration 105 als `ai_mail_templates` der Site tri-hotel (Paket P1 der
Hotel-Ansprache, Konzept: https://claude.ai/artifact/EmRgGEgm2TMm9vSfkvvpqj). Änderungen danach im Admin unter E-Mails → KI-Mails → Datenanfrage;
der Text wird dort wörtlich verwendet (feste Vorlage, keine KI-Formulierung). Absender: Daniel Reuland (`daniel@tri-hotel.de`, Persona `founder`).

## Formular hinter dem Link

Mit der festen Vorlage zeigt das Formular alle Angaben zum Prüfen (`fullCheckSelection`): Stammdaten, jeden bekannten erfragbaren Wert zum Bestätigen oder Korrigieren,
offene und strittige Werte als Fragen, alle erfassten Leistungen und die übrigen Leistungen des Katalogs. Die Auswahl im Admin entfällt dabei. Automatische Werte wie Klima sind nicht erfragbar und fehlen.

## Spielregeln

- **Redaktionell bleiben (D1):** keine Frage nach Vertrieb, Kooperation, Partnerschaft, Werbung oder Preisen in der Mail.
- Hinweis „kostenlos, Platzierungen nicht käuflich“ und die Fußzeile mit Datenschutz- und Abmeldelink bleiben drin.
- Die erste Mail nennt Mia nicht. Erinnerungen und Antworten von Mia sind als KI gekennzeichnet.
- Herkunft der Adresse nur, wenn sie stimmt: `contact_email_source = website`.

## Deutsch

Betreff: {{objekt}} auf tri-hotel.de – stimmen Ihre Angaben?

```
Guten Tag,

ich bin Daniel Reuland, Triathlet und Rennradfahrer aus Kaiserslautern. Weil es keine neutrale Übersicht gab, die Hotels nach dem bewertet, was im Trainingslager wirklich zählt, habe ich tri-hotel.de gegründet.

Jedes Hotel erhält bei uns einen TriScore aus geprüften Fakten, jede Angabe ist mit Quelle belegt. Der Eintrag ist kostenlos, Platzierungen sind nicht käuflich.

{{objekt}} ist bereits bei uns gelistet.{{#kernfakten}} Erfasst haben wir unter anderem: {{kernfakten}}.{{/kernfakten}}

Damit Triathleten Ihr Haus richtig einschätzen können, möchte ich Sie bitten, die Angaben kurz zu prüfen:

{{LINK}}

Das dauert etwa 3 Minuten und geht ohne Anmeldung. Sie können Angaben korrigieren, ergänzen und eigene Fotos hochladen – wir zeigen sie selbstverständlich mit Ihrem Urhebervermerk.

Eine Frage noch: Wer ist bei Ihnen die richtige Ansprechperson für Ihr Profil? Im Formular können Sie Name und E-Mail hinterlegen, oder antworten Sie einfach auf diese Mail. Ich lese jede Antwort persönlich.

Viele Grüße
Daniel Reuland
Gründer, tri-hotel.de

--
Sie erhalten diese Mail, weil Ihr Hotel auf tri-hotel.de gelistet ist.{{#adresse_website}} Ihre Kontaktadresse stammt von Ihrer Website.{{/adresse_website}}
[Datenschutz]({{datenschutz}}) · [Keine weiteren E-Mails erhalten]({{abmelden}})
```

## Englisch (für alle Länder außer DE, AT, CH, LI, LU)

Betreff: {{objekt}} on tri-hotel.de – are your details correct?

```
Hello,

my name is Daniel Reuland, a triathlete and road cyclist from Kaiserslautern, Germany. I founded tri-hotel.de because there was no neutral overview rating hotels on what really counts at a training camp.

Every hotel receives a TriScore based on verified facts, and every detail is backed by a source. The listing is free of charge; rankings cannot be bought.

{{objekt}} is already listed with us.{{#kernfakten}} Among other things, we have recorded: {{kernfakten}}.{{/kernfakten}}

So that triathletes can assess your hotel accurately, I would like to ask you to briefly check the details:

{{LINK}}

It takes about 3 minutes and requires no login. You can correct and add details and upload your own photos; we will of course show them with your photo credit.

One more question: who is the right contact person for your profile? You can enter a name and email address in the form, or simply reply to this email. I read every reply personally.

Best regards
Daniel Reuland
Founder, tri-hotel.de

--
You are receiving this email because your hotel is listed on tri-hotel.de.{{#adresse_website}} Your contact address comes from your website.{{/adresse_website}}
[Privacy]({{datenschutz}}) · [Stop receiving emails]({{abmelden}})
```

## Platzhalter und Abschnitte

| Platzhalter | Inhalt |
|---|---|
| `{{objekt}}` | Name des Hotels |
| `{{kernfakten}}` | bis zu 5 erfasste filterbare Leistungen (Englisch: per KI übersetzt) |
| `{{LINK}}` | persönlicher Link; allein auf der Zeile wird er zum Knopf „👉 Angaben prüfen“ / „👉 Check your details“ |
| `{{datenschutz}}`, `{{abmelden}}` | Datenschutzerklärung, Abmeldelink |
| `{{#kernfakten}}`, `{{#adresse_website}}` | Sätze nur, wenn Leistungen erfasst sind bzw. die Adresse von der Hotel-Website stammt |
| `{{score}}`, `{{platz}}`, `{{gesamt}}`, `{{hotelseite}}` | weiter verfügbar, in dieser Fassung nicht verwendet |
| `[Wörter](Link)` | legt den Link hinter die Wörter |
| `--` | Zeile davor beginnt die Fußzeile: klein, grau, die Trennzeile selbst wird nicht angezeigt |
