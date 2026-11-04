-- Hotel-Ansprache neu, Paket P1 (Konzept 02.11.2026, Text von Daniel 04.11.2026): Die erste Anfrage kommt persönlich von Daniel,
-- als feste Vorlage statt KI-Text. Mia (KI) übernimmt die Erinnerungen und bleibt dabei als KI gekennzeichnet.
-- personas.is_ai: Mensch oder KI (KI-Hinweis in der Mail); personas.own_sender: eigene Absenderadresse, unabhängig von MAIL_PERSONA_SENDER.
ALTER TABLE personas ADD COLUMN is_ai boolean NOT NULL DEFAULT true;
ALTER TABLE personas ADD COLUMN own_sender boolean NOT NULL DEFAULT false;

INSERT INTO personas (site_id, name, role, title, email, is_ai, own_sender)
SELECT id, 'Daniel Reuland', 'founder', 'Gründer', 'daniel@tri-hotel.de', false, true FROM sites WHERE code = 'tri-hotel'
ON CONFLICT (site_id, role) DO NOTHING;

-- Entwürfe ohne Text bekommen beim Formulieren die neue Vorlage; Entwürfe mit Text bleiben, bis der Admin sie neu formuliert
UPDATE inquiries i SET persona_id = p.id
FROM personas p, rankings r
WHERE i.status = 'draft' AND i.body IS NULL AND r.id = i.ranking_id AND p.site_id = r.site_id AND p.role = 'founder';

-- Abmeldelink: Betreiber will keine weiteren Anfragen
ALTER TABLE entities ADD COLUMN inquiry_opt_out_at timestamptz;
-- Ansprechpartner fürs Profil aus dem Antwortformular
ALTER TABLE inquiries ADD COLUMN reply_email text;

INSERT INTO ai_mail_templates (site_id, key, language, subject, body)
SELECT s.id, 'inquiry', v.language, v.subject, v.body
FROM sites s, (VALUES
('de', '{{objekt}} auf tri-hotel.de – kurz prüfen?', $de$Guten Tag,

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
Warum Sie diese Mail erhalten: Ihr Hotel ist auf tri-hotel.de erfasst, Ihre Adresse stammt von Ihrer Website.
Hinweise zum Datenschutz: {{datenschutz}}
Keine weiteren Anfragen gewünscht? {{abmelden}}$de$),
('en', '{{objekt}} on tri-hotel.de – a quick check?', $en$Hello,

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
Why you are receiving this email: your hotel is listed on tri-hotel.de and your address comes from your website.
Privacy information: {{datenschutz}}
No further requests? {{abmelden}}$en$)
) AS v(language, subject, body)
WHERE s.code = 'tri-hotel'
ON CONFLICT (site_id, key, language) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body, version = ai_mail_templates.version + 1, updated_at = now();
