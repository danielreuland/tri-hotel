-- Bewertung direkt beim Vorschlagen eines Objekts: hängt an der Meldung („held“), bis das Objekt online ist.
-- Die E-Mail-Bestätigung der Meldung bestätigt auch die Bewertung (gleiche Adresse).
ALTER TABLE reviews ALTER COLUMN entity_id DROP NOT NULL;
ALTER TABLE reviews ADD COLUMN submission_id uuid REFERENCES submissions(id) ON DELETE CASCADE;
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_status_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_status_check CHECK (status IN ('held', 'received', 'pending', 'published', 'rejected'));
ALTER TABLE reviews ADD CONSTRAINT reviews_target_check CHECK (entity_id IS NOT NULL OR submission_id IS NOT NULL);
CREATE INDEX reviews_submission_idx ON reviews (submission_id) WHERE submission_id IS NOT NULL;
