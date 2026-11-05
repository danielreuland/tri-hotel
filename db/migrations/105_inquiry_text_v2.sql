-- Anfrage-Mail, zweite Fassung von Daniel (05.11.2026), Englisch dazu übersetzt. Ersetzt die Vorlage der Site tri-hotel in beiden Sprachen.
-- Ohne Score, Platz, Hotelseite und Hinweis auf Mia. Die Herkunft der Adresse steht nur bei Adressen von der Hotel-Website ({{#adresse_website}}).
INSERT INTO ai_mail_templates (site_id, key, language, subject, body)
SELECT s.id, 'inquiry', v.language, v.subject, v.body
FROM sites s, (VALUES
('de', '{{objekt}} auf tri-hotel.de – stimmen Ihre Angaben?', $de$Guten Tag,

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
[Datenschutz]({{datenschutz}}) · [Keine weiteren E-Mails erhalten]({{abmelden}})$de$),
('en', '{{objekt}} on tri-hotel.de – are your details correct?', $en$Hello,

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
[Privacy]({{datenschutz}}) · [Stop receiving emails]({{abmelden}})$en$)
) AS v(language, subject, body)
WHERE s.code = 'tri-hotel'
ON CONFLICT (site_id, key, language) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body, version = ai_mail_templates.version + 1, updated_at = now();
