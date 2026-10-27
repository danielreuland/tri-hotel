// Auto-Prüfung einer bestätigten Meldung in zwei Phasen:
// 1. Grunddaten: Dublette? -> Objekt anlegen -> Website lesen (Anschrift, Kartenlinks) -> Google-Eintrag (Place ID)
//    -> Koordinaten (offene Quellen, mit Google abgeglichen). Fehlt danach Website, Google-Eintrag oder Koordinaten,
//    wartet die Meldung im Status 'basics'; ergänzt der Admin, läuft sie automatisch weiter (services/basics.js).
// 2. Prüfung: KI-Auswertung der Website (ggf. 2. Durchgang) -> Klima -> OSM-Vorschläge -> Score + Vollständigkeit
//    -> Kontaktadresse -> Anfrage-Entwurf -> Admin-Warteschlange.
// Einzelne Schritte dürfen scheitern; sie landen im pipeline_log, der Admin entscheidet.
const db = require('../db');
const rankings = require('../services/rankings');
const submissions = require('../services/submissions');
const mailer = require('../services/mailer');
const sites = require('../services/sites');
const geo = require('../services/geo');
const climate = require('../services/climate');
const extractor = require('../services/extractor');
const featureService = require('../services/features');
const llm = require('../lib/llm');
const config = require('../config');
const sitedata = require('../services/sitedata');
const places = require('../services/places');
const basics = require('../services/basics');

// Zweiter Durchgang nur, wenn danach noch mehrere auslesbare Kriterien fehlen
const MIN_MISSING_FOR_SECOND_PASS = 3;

// Ein KI-Durchgang: extrahieren, Verbrauch protokollieren, Fakten und Leistungen als Vorschläge speichern
async function extractRound(subId, ranking, criteria, entity, pages, features) {
  const found = await extractor.extract({ ranking, criteria, entity, pages, features });
  const cost = found.usage
    ? await llm.record({ purpose: 'extraction', model: found.usage.model, usage: found.usage.raw, entityId: entity.id, submissionId: subId })
    : null;
  const n = await insertAutoFacts(entity.id, found.facts);
  let nf = 0;
  for (const f of found.features) {
    const r = await db.query(
      `INSERT INTO entity_features (entity_id, feature_id, source, trust_level, evidence_url, evidence_text)
       VALUES ($1, $2, 'auto', 4, $3, $4) ON CONFLICT DO NOTHING`,
      [entity.id, f.featureId, f.evidenceUrl, f.evidenceText]
    );
    nf += r.rowCount;
  }
  return { facts: n, features: nf, address: found.address || null, cost };
}

function sumCost(a, b) {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite, usd: Math.round((a.usd + b.usd) * 10000) / 10000 };
}

// Auslesbare Kriterien (Option/Ja-Nein/Zahl), zu denen noch kein Wert vorliegt
async function missingExtractable(entityId, rankingId, criteria) {
  const have = new Set((await rankings.getFacts(entityId, rankingId)).map((f) => f.criterion_id));
  return criteria.filter((c) => !have.has(c.id) && extractor.describeCriterion(c));
}

async function missingCatalogFeatures(entityId, catalog) {
  const have = new Set((await db.many('SELECT feature_id FROM entity_features WHERE entity_id = $1', [entityId])).map((r) => r.feature_id));
  return catalog.filter((f) => !f.derive && !have.has(f.id));
}

// Seiten nach Treffern der gesuchten Begriffe sortieren (Startseite bleibt vorn)
function rankPages(pages, labels) {
  const words = extractor.hintsFrom(labels).filter((w) => w.length >= 4);
  const hits = (p) => words.reduce((n, w) => n + (p.text.toLowerCase().includes(w) ? 1 : 0), 0);
  return [...pages].sort((a, b) => hits(b) - hits(a));
}

async function step(subId, name, fn) {
  try {
    const info = await fn();
    await submissions.appendLog(subId, name, true, info || null);
    return true;
  } catch (err) {
    console.error(`[auto-check] ${subId} ${name}:`, err.message);
    await submissions.appendLog(subId, name, false, err.message);
    return false;
  }
}

// Fakten nur ergänzen, nie bestehende (z. B. vom Admin geprüfte) überschreiben.
async function insertAutoFacts(entityId, facts) {
  let n = 0;
  for (const f of facts) {
    const r = await db.query(
      `INSERT INTO entity_facts (entity_id, criterion_id, value, source, trust_level, evidence_url, evidence_text)
       VALUES ($1, $2, $3, 'auto', 4, $4, $5) ON CONFLICT (entity_id, criterion_id) DO NOTHING`,
      [entityId, f.criterionId, JSON.stringify(f.value), f.evidenceUrl, f.evidenceText]
    );
    n += r.rowCount;
  }
  return n;
}

// refresh: Daten eines bereits freigegebenen Objekts aktualisieren – Status und Sichtbarkeit bleiben unverändert,
// neue Werte kommen nur als Vorschläge hinzu.
async function run(submissionId, { refresh = false } = {}) {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  if (!sub) return;
  if (refresh ? !(sub.status === 'live' && sub.entity_id) : !['verified', 'auto_check', 'basics'].includes(sub.status)) return;
  if (!refresh) await submissions.setStatus(sub.id, 'auto_check');
  const ranking = await rankings.getRanking(sub.ranking_id);
  const criteria = await rankings.getCriteria(ranking.id);

  // 1. Dublettenprüfung: nur markieren, der Admin entscheidet (gleiche Domain ≠ gleiches Hotel, z. B. bei Ketten)
  let entity = sub.entity_id ? await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]) : null;
  if (!entity) {
    const dup = sub.duplicate_check_done ? null : await submissions.findDuplicate(ranking, sub);
    if (dup && dup.ranking_status) {
      await submissions.appendLog(sub.id, 'Dublettenprüfung', false,
        `Mögliche Dublette: ${dup.name} (${dup.city || ''}) – gleiche Website-Domain oder gleicher Name. Bitte im Admin entscheiden.`);
      await submissions.setStatus(sub.id, 'admin_review', { possible_duplicate_of: dup.id });
      return;
    }
    if (dup) {
      // Objekt existiert schon in einem anderen Ranking -> wiederverwenden
      entity = dup;
      await db.query(`INSERT INTO entity_rankings (entity_id, ranking_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [dup.id, ranking.id]);
      await submissions.appendLog(sub.id, 'Dublettenprüfung', true, `Objekt aus anderem Ranking übernommen: ${dup.name}`);
    } else {
      entity = await submissions.createEntity(ranking, sub);
      await submissions.appendLog(sub.id, 'Dublettenprüfung', true, 'Keine Dublette, Objekt angelegt.');
    }
    await db.query('UPDATE submissions SET entity_id = $2 WHERE id = $1', [sub.id, entity.id]);
  }

  // ---------- Phase 1: Grunddaten ----------
  const ctx = await identifyBasics(sub, entity, ranking, criteria);
  entity = await db.one('SELECT * FROM entities WHERE id = $1', [entity.id]);
  const miss = basics.missing(entity);
  if (miss.length && !refresh) {
    await submissions.appendLog(sub.id, 'Grunddaten', false,
      `Es fehlt: ${basics.describe(miss)}. Bitte im Admin ergänzen oder bestätigen – danach läuft die Prüfung automatisch weiter.`);
    await submissions.setStatus(sub.id, 'basics');
    return;
  }

  // ---------- Phase 2: Prüfung ----------
  // 2. Website mit KI auswerten (Seiten aus Phase 1 wiederverwenden)
  let site = ctx.site;
  let found = { address: null };
  if (entity.website) {
    await step(sub.id, 'Website-Auswertung', async () => {
      const catalog = await featureService.catalog(ranking.entity_type);
      const labels = [...criteria.flatMap(extractor.criterionTerms), ...catalog.map((f) => f.label)];
      const pages = ctx.pages || await extractor.fetchSite(entity.website, { labels });
      if (!pages.length) throw new Error('Website nicht erreichbar.');
      site = sitedata.merge(pages);
      const res = await extractRound(sub.id, ranking, criteria, entity, pages, catalog);
      found = res;
      const parts = [`${pages.length} Seiten gelesen, ${res.facts} Werte und ${res.features} Leistungen mit Fundstelle übernommen.`];

      // Zweiter, gezielter Durchgang für noch fehlende Kriterien (weitere Seiten passend zu deren Begriffen)
      const missing = await missingExtractable(entity.id, ranking.id, criteria);
      if (missing.length >= MIN_MISSING_FOR_SECOND_PASS && config.llm.provider !== 'none') {
        const more = await extractor.fetchMore(pages, missing.flatMap(extractor.criterionTerms));
        const focus = rankPages([...more, ...pages], missing.flatMap(extractor.criterionTerms)).slice(0, 10);
        const missingFeatures = await missingCatalogFeatures(entity.id, catalog);
        const res2 = await extractRound(sub.id, ranking, missing, entity, focus, missingFeatures);
        if (!found.address && res2.address) found.address = res2.address;
        if (res2.cost) res.cost = res.cost ? sumCost(res.cost, res2.cost) : res2.cost;
        site = sitedata.merge([...pages, ...more]);
        parts.push(`2. Durchgang (${missing.length} offene Kriterien, ${more.length} weitere Seiten): ${res2.facts} Werte, ${res2.features} Leistungen.`);
      }

      // Kontakt-E-Mail für spätere Anfragen (nur wenn noch keine eingetragen ist): Strukturdaten zuerst
      const hit = site.emails[0] ? { email: site.emails[0].email, evidenceUrl: site.emails[0].url } : extractor.findContactEmail(pages, entity.website);
      if (hit) {
        const r = await db.query(
          `UPDATE entities SET contact_email = $2, contact_email_source = 'website', contact_email_evidence = $3, updated_at = now()
            WHERE id = $1 AND contact_email IS NULL`,
          [entity.id, hit.email, hit.evidenceUrl]
        );
        if (r.rowCount) parts.push(`Kontakt-E-Mail: ${hit.email}.`);
      } else {
        parts.push('Keine Kontakt-E-Mail auf der Website.');
      }
      // Anschrift aus der KI-Auswertung, falls die Strukturdaten keine hatten
      if (!ctx.address && found.address) {
        await saveAddress(entity.id, found.address);
        parts.push(`Anschrift (KI): ${found.address.street || found.address.text}${found.address.city ? `, ${found.address.city}` : ''}.`);
      }
      if (res.cost) parts.push(`KI gesamt: ${llm.formatTokens(res.cost)}.`);
      return parts.join(' ');
    });
  }

  // 4. Klima je Monat
  if (entity.lat !== null) await climateStep(sub.id, entity, 'Klima');

  // 5. OSM-Vorschläge nur für Kriterien ohne Wert aus der Website.
  //    Sind die öffentlichen Overpass-Server gestört, wird der Schritt später automatisch nachgeholt.
  if (entity.lat !== null) {
    const ok = await osmStep(sub.id, entity, ranking, criteria, 'Umgebung (OpenStreetMap)');
    if (!ok) await scheduleOsmRetry(sub.id, 1);
  }

  // 6. Score, K.O., Vollständigkeit -> Admin-Warteschlange
  const result = await rankings.recomputeEntity(entity.id, ranking.id);
  await db.query(
    `UPDATE entity_rankings SET status = 'in_review', updated_at = now() WHERE entity_id = $1 AND ranking_id = $2 AND status = 'draft'`,
    [entity.id, ranking.id]
  );
  const summary = result.ko
    ? `K.O.: ${result.koReason}`
    : `Vorläufiger ${ranking.score_name} ${result.score ?? '–'}, Vollständigkeit ${result.completeness} %`;
  await submissions.appendLog(sub.id, 'Score', !result.ko, summary);
  // 7. Kontaktadresse, wenn die Website keine liefert: OpenStreetMap, dann Hunter.io (nur Vorschlag, Admin bestätigt)
  if (!result.ko) {
    const current = await db.one('SELECT * FROM entities WHERE id = $1', [entity.id]);
    // Sammelimporte (hints.no_hunter) ohne Hunter.io, damit das Monatskontingent nicht sofort aufgebraucht ist
    if (!current.contact_email) await step(sub.id, 'Kontaktadresse', () => require('../services/contacts').fallback(current, { noHunter: Boolean((sub.hints || {}).no_hunter) }));
  }
  // 8. Offene Punkte als Anfrage-Entwurf an den Betreiber vorbereiten (Versand erst nach Freigabe im Admin)
  if (!result.ko) {
    await step(sub.id, 'Anfrage-Entwurf', async () => {
      const r = await require('../services/inquiries').createDraft({ entityId: entity.id, rankingId: ranking.id, submissionId: sub.id });
      return r.reason;
    });
  }
  if (!refresh) await submissions.setStatus(sub.id, 'admin_review');
}

// ---------- Phase 1: Grunddaten ermitteln ----------
// Website lesen (Anschrift, Koordinaten aus Strukturdaten/Kartenlinks), Google-Eintrag erkennen, Koordinaten bestimmen.
// Vom Admin gesetzte Werte (Place ID, geo_manual) bleiben unangetastet. Rückgabe: Seiten und Website-Daten für Phase 2.
async function identifyBasics(sub, entity, ranking, criteria) {
  const out = { pages: null, site: { geo: [], addresses: [], emails: [], amenities: [] }, address: null };
  const attrs = entity.attributes || {};

  if (entity.website) {
    await step(sub.id, 'Website lesen', async () => {
      const catalog = await featureService.catalog(ranking.entity_type);
      const labels = [...criteria.flatMap(extractor.criterionTerms), ...catalog.map((f) => f.label)];
      const pages = await extractor.fetchSite(entity.website, { labels });
      if (!pages.length) throw new Error('Website nicht erreichbar – bitte Adresse in den Stammdaten prüfen.');
      out.pages = pages;
      out.site = sitedata.merge(pages);
      out.address = out.site.addresses.find((a) => a.street) || null;
      const parts = [`${pages.length} Seiten gelesen.`];
      if (out.address) {
        await saveAddress(entity.id, out.address);
        parts.push(`Anschrift: ${out.address.street || out.address.text}${out.address.city ? `, ${out.address.city}` : ''}.`);
      } else parts.push('Keine Anschrift in den Strukturdaten.');
      if (out.site.geo.length) parts.push(`Koordinaten auf der Website (${out.site.geo[0].kind}).`);
      return parts.join(' ');
    });
  }
  if (!out.address && attrs.address && attrs.address.street) out.address = attrs.address;

  // Google-Eintrag: Suche mit Name, Anschrift, Ort, Land; eindeutig -> Place ID automatisch speichern
  let googleLoc = null;
  if (places.enabled() && !attrs.no_google_place) {
    await step(sub.id, 'Google-Eintrag', async () => {
      const r = await places.identify(entity, { address: out.address });
      if (r.pick) googleLoc = r.pick.location;
      if (attrs.google_place_id) {
        // vorhandene ID (z. B. vom Admin) nie überschreiben; passt der Treffer dazu, dient er dem Abgleich
        if (!r.pick || r.pick.id !== attrs.google_place_id) googleLoc = null;
        return r.pick && r.pick.id === attrs.google_place_id ? 'Place ID vorhanden und bestätigt.' : 'Place ID vorhanden (vom Admin) – bleibt unverändert.';
      }
      if (r.pick) {
        await places.saveAuto(entity.id, r.pick);
        return `Eindeutig gefunden, Place ID gespeichert (Name ${r.pick.match === 2 ? 'gleich' : 'teilweise gleich'}, ${r.pick.address}).`;
      }
      await places.markUnclear(entity.id, r.candidates.length);
      throw new Error(r.candidates.length
        ? `${r.candidates.length} Treffer für „${r.query}“, keiner eindeutig – bitte in den Stammdaten auswählen.`
        : `Kein Treffer für „${r.query}“ – bitte suchen oder „Kein Google-Eintrag“ markieren.`);
    });
  }

  // Koordinaten aus offenen Quellen, mit dem Google-Eintrag abgeglichen; unsicher -> Vorschlag mit Karte
  if (entity.lat === null && !attrs.geo_manual) {
    await step(sub.id, 'Koordinaten', async () => {
      const addresses = [...out.site.addresses];
      if (out.address && !addresses.includes(out.address)) addresses.push(out.address);
      const hit = await geo.locate({ name: entity.name, city: entity.city, country: entity.country }, { geo: out.site.geo, addresses });
      const verdict = basics.judge(hit, googleLoc);
      if (verdict.save && await basics.saveAuto(entity.id, hit, verdict.note)) {
        return `${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)} – ${hit.source}: ${hit.detail} (${verdict.note}).`;
      }
      await basics.suggest(entity.id, { hit, reason: verdict.reason, googleDistanceM: verdict.googleDistanceM });
      throw new Error(`${verdict.reason || 'Nicht gespeichert'} – Vorschlag mit Karte in den Stammdaten bestätigen.${hit.tried && hit.tried.length && hit.lat === null ? ` Versucht: ${hit.tried.join('; ')}` : ''}`);
    });
  }
  return out;
}

async function saveAddress(entityId, address) {
  await db.query(`UPDATE entities SET attributes = attributes || jsonb_build_object('address', $2::jsonb), updated_at = now() WHERE id = $1`,
    [entityId, JSON.stringify({ street: address.street || address.text || null, postal_code: address.postal_code || null, city: address.city || null, url: address.url || null })]);
}

async function climateStep(subId, entity, label) {
  return step(subId, label, async () => {
    const point = { lat: Number(entity.lat), lng: Number(entity.lng) };
    const months = await climate.monthlyClimate(point);
    for (const m of months) {
      await db.query(
        `INSERT INTO climate_monthly (entity_id, month, avg_high_c, avg_low_c, rain_days) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (entity_id, month) DO UPDATE SET avg_high_c = EXCLUDED.avg_high_c, avg_low_c = EXCLUDED.avg_low_c, rain_days = EXCLUDED.rain_days`,
        [entity.id, m.month, m.avg_high_c, m.avg_low_c, m.rain_days]
      );
    }
    // Wassertemperatur vor der Küste (nächste Meereszelle ≤ 20 km, Raster etwa 8–9 km); Binnenland ohne. Fehler hier bremsen die Prüfung nicht.
    let seaText = '';
    try {
      const sea = await climate.hotelSea(point);
      for (let m = 1; m <= 12; m++) {
        await db.query('UPDATE climate_monthly SET sea_c = $3 WHERE entity_id = $1 AND month = $2', [entity.id, m, sea ? sea.months[m - 1] : null]);
      }
      await db.query(`UPDATE entities SET attributes = CASE WHEN $2::jsonb IS NULL THEN attributes - 'sea_point' ELSE attributes || jsonb_build_object('sea_point', $2::jsonb) END WHERE id = $1`,
        [entity.id, sea ? JSON.stringify(sea.points[0]) : null]);
      seaText = sea ? ` Wassertemperatur aus ${sea.points[0].distance_km} km.` : ' Nicht am Meer (keine Meeresfläche in 3 km).';
    } catch (err) {
      seaText = ` Wassertemperatur nicht abrufbar (${err.message}).`;
    }
    return `12 Monate von Open-Meteo übernommen.${seaText}`;
  });
}

// Nach einer Koordinaten-Änderung im Admin (Meldung schon geprüft oder live): Klima, Umgebung, ggf. Google-Eintrag
// und Score nachziehen – ohne die ganze Prüfung neu zu starten. Vorhandene Werte bleiben, neue kommen als Vorschläge.
async function geoFollowup(submissionId) {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  if (!sub || !sub.entity_id || !['auto_check', 'admin_review', 'live'].includes(sub.status)) return;
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]);
  if (!entity || entity.lat === null) return;
  const ranking = await rankings.getRanking(sub.ranking_id);
  const criteria = await rankings.getCriteria(ranking.id);
  await submissions.appendLog(sub.id, 'Koordinaten geändert', true, `${Number(entity.lat).toFixed(5)}, ${Number(entity.lng).toFixed(5)} – Klima und Umgebung werden nachgezogen.`);
  const a = entity.attributes || {};
  if (places.enabled() && !a.google_place_id && !a.no_google_place) {
    await step(sub.id, 'Google-Eintrag', async () => {
      const r = await places.identify(entity);
      if (r.pick && await places.saveAuto(entity.id, r.pick)) return `Place ID gespeichert (${r.pick.distanceM} m, Name ${r.pick.match === 2 ? 'gleich' : 'teilweise gleich'}).`;
      await places.markUnclear(entity.id, r.candidates.length);
      return r.candidates.length ? 'Kein eindeutiger Treffer – bei Bedarf in den Stammdaten suchen.' : 'Kein Treffer bei Google.';
    });
  }
  await climateStep(sub.id, entity, 'Klima');
  const ok = await osmStep(sub.id, entity, ranking, criteria, 'Umgebung (OpenStreetMap)');
  if (!ok) await scheduleOsmRetry(sub.id, 1);
  const result = await rankings.recomputeEntity(entity.id, ranking.id);
  await submissions.appendLog(sub.id, 'Score', !result.ko,
    result.ko ? `K.O.: ${result.koReason}` : `Neu berechnet: ${ranking.score_name} ${result.score ?? '–'}, Vollständigkeit ${result.completeness} %`);
}

async function osmStep(subId, entity, ranking, criteria, label) {
  return step(subId, label, async () => {
    const existing = new Set((await rankings.getFacts(entity.id, ranking.id)).map((f) => f.criterion_id));
    // Kennzahlen (z. B. Gelände) auch für schon belegte Kriterien neu ermitteln – sie stehen nur als Info im Admin
    const withInfo = criteria.filter((c) => !existing.has(c.id) || [].concat((c.scoring || {}).auto || []).some((r) => r.info_only || r.source === 'bike_area'));
    const facts = await geo.suggestFacts({ lat: Number(entity.lat), lng: Number(entity.lng) }, withInfo, { siteId: ranking.site_id });
    const n = await insertAutoFacts(entity.id, facts.filter((x) => !existing.has(x.criterionId)));
    if (Object.keys(facts.infos || {}).length) {
      await db.query(`UPDATE entities SET attributes = attributes || jsonb_build_object('geo_info', $2::jsonb), updated_at = now() WHERE id = $1`,
        [entity.id, JSON.stringify(facts.infos)]);
    }
    return `${n} Werte vorgeschlagen (OpenStreetMap, EU-Badegewässer, Höhendaten, Radrevier).`;
  });
}

const OSM_RETRY_MINUTES = [30, 120, 480];

async function scheduleOsmRetry(subId, attempt) {
  if (attempt > OSM_RETRY_MINUTES.length) {
    await submissions.appendLog(subId, 'Umgebung (OpenStreetMap)', false, 'Nach mehreren Versuchen nicht erreichbar – bitte später „Auto-Prüfung erneut starten“.');
    return;
  }
  const minutes = OSM_RETRY_MINUTES[attempt - 1];
  await submissions.enqueue('osm-retry', { submissionId: subId, attempt }, { startAfter: minutes * 60 });
  await submissions.appendLog(subId, 'Umgebung (OpenStreetMap)', true, `Server gestört – neuer Versuch in ${minutes} Minuten (Versuch ${attempt + 1}).`);
}

// Nachholen des OSM-Schritts, danach Score neu berechnen
async function retryOsm(submissionId, attempt) {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  if (!sub || !sub.entity_id || ['rejected', 'expired', 'duplicate'].includes(sub.status)) return;
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]);
  if (!entity || entity.lat === null) return;
  const ranking = await rankings.getRanking(sub.ranking_id);
  const criteria = await rankings.getCriteria(ranking.id);
  const ok = await osmStep(sub.id, entity, ranking, criteria, `Umgebung (OpenStreetMap), Versuch ${attempt + 1}`);
  if (!ok) return scheduleOsmRetry(sub.id, attempt + 1);
  const result = await rankings.recomputeEntity(entity.id, ranking.id);
  await submissions.appendLog(sub.id, 'Score', !result.ko,
    result.ko ? `K.O.: ${result.koReason}` : `Neu berechnet: ${ranking.score_name} ${result.score ?? '–'}, Vollständigkeit ${result.completeness} %`);
}

module.exports = { run, retryOsm, geoFollowup, insertAutoFacts, rankPages, sumCost };
