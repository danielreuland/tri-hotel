-- Anzeigen-/Kampagnenparameter (utm_*, gclid, gad_* …) aus gespeicherten Website-Adressen entfernen.
-- Gleiche Liste wie TRACKING_PARAM in src/lib/util.js; Buchungslinks bleiben unverändert.
CREATE FUNCTION pg_temp.strip_tracking(url text) RETURNS text LANGUAGE sql AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(url,
               '([?&])(utm_[^=&#]*|gad_[^=&#]*|gclid|gclsrc|gbraid|wbraid|dclid|fbclid|msclkid|yclid|ttclid|igshid|twclid|li_fat_id|_ga|_gl|mc_cid|mc_eid|n_okw|tc_alt)=[^&#]*',
               '\1', 'gi'),
             '([?&])&+', '\1', 'g'),
           '[?&]+(#|$)', '\1')
$$;

UPDATE entities SET website = pg_temp.strip_tracking(website), updated_at = now() WHERE website ~ '[?&]';
UPDATE submissions SET website = pg_temp.strip_tracking(website) WHERE website ~ '[?&]';
