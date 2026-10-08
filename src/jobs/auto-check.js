// Auto-Prüfung einer bestätigten Meldung:
// Dublette? -> Objekt anlegen -> Geodaten -> Klima -> Website-Extraktion -> OSM-Vorschläge
// -> Score + K.O. + Vollständigkeit -> Admin-Warteschlange.
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

async function run(submissionId) {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  if (!sub || !['verified', 'auto_check'].includes(sub.status)) return;
  await submissions.setStatus(sub.id, 'auto_check');
  const ranking = await rankings.getRanking(sub.ranking_id);
  const criteria = await rankings.getCriteria(ranking.id);

  // 1. Dublettenprüfung
  let entity = sub.entity_id ? await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]) : null;
  if (!entity) {
    const dup = await submissions.findDuplicate(ranking, sub);
    if (dup && dup.ranking_status) {
      await submissions.appendLog(sub.id, 'Dublettenprüfung', true, `Bereits vorhanden: ${dup.name} (${dup.ranking_status})`);
      await submissions.setStatus(sub.id, 'duplicate', { entity_id: dup.id });
      if (sub.submitter_email) {
        const site = await sites.forRanking(ranking);
        await mailer.send({
          to: sub.submitter_email,
          template: 'duplicate',
          site,
          submissionId: sub.id,
          data: { ranking, entityName: dup.name, link: dup.ranking_status === 'live' ? submissions.entityUrl(ranking, dup, site) : null },
        });
      }
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

  // 2. Geodaten
  if (entity.lat === null) {
    await step(sub.id, 'Koordinaten', async () => {
      const hit = await geo.geocode({ name: entity.name, city: entity.city, country: entity.country });
      if (!hit) throw new Error('Adresse nicht gefunden – bitte Koordinaten im Admin eintragen.');
      await db.query('UPDATE entities SET lat = $2, lng = $3, updated_at = now() WHERE id = $1', [entity.id, hit.lat, hit.lng]);
      entity.lat = hit.lat;
      entity.lng = hit.lng;
      return `${hit.lat}, ${hit.lng} (${hit.display})`;
    });
  }

  // 3. Klima je Monat
  if (entity.lat !== null) {
    await step(sub.id, 'Klima', async () => {
      const months = await climate.monthlyClimate({ lat: entity.lat, lng: entity.lng });
      for (const m of months) {
        await db.query(
          `INSERT INTO climate_monthly (entity_id, month, avg_high_c, avg_low_c, rain_days) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (entity_id, month) DO UPDATE SET avg_high_c = EXCLUDED.avg_high_c, avg_low_c = EXCLUDED.avg_low_c, rain_days = EXCLUDED.rain_days`,
          [entity.id, m.month, m.avg_high_c, m.avg_low_c, m.rain_days]
        );
      }
      return '12 Monate von Open-Meteo übernommen.';
    });
  }

  // 4. Website-Extraktion (jeder Wert mit Fundstelle)
  if (entity.website) {
    await step(sub.id, 'Website-Extraktion', async () => {
      const pages = await extractor.fetchSite(entity.website);
      const catalog = await featureService.catalog(ranking.entity_type);
      const found = await extractor.extract({ ranking, criteria, entity, pages, features: catalog });
      const n = await insertAutoFacts(entity.id, found.facts);
      // Leistungen ohne Ableitung als Vorschlag (Stufe 4); bestehende nie überschreiben
      let nf = 0;
      for (const f of found.features) {
        const r = await db.query(
          `INSERT INTO entity_features (entity_id, feature_id, source, trust_level, evidence_url, evidence_text)
           VALUES ($1, $2, 'auto', 4, $3, $4) ON CONFLICT DO NOTHING`,
          [entity.id, f.featureId, f.evidenceUrl, f.evidenceText]
        );
        nf += r.rowCount;
      }
      // Kontakt-E-Mail für spätere Anfragen an den Betreiber (nur wenn noch keine eingetragen ist)
      let contact = '';
      const hit = extractor.findContactEmail(pages, entity.website);
      if (hit) {
        const r = await db.query(
          `UPDATE entities SET contact_email = $2, contact_email_source = 'website', contact_email_evidence = $3, updated_at = now()
            WHERE id = $1 AND contact_email IS NULL`,
          [entity.id, hit.email, hit.evidenceUrl]
        );
        if (r.rowCount) contact = ` Kontakt-E-Mail: ${hit.email}.`;
      } else {
        contact = ' Keine Kontakt-E-Mail gefunden – bitte in den Stammdaten ergänzen.';
      }
      return `${pages.length} Seiten gelesen, ${n} Werte und ${nf} Leistungen mit Fundstelle übernommen.${contact}`;
    });
  }

  // 5. OSM-Vorschläge nur für Kriterien ohne Wert aus der Website
  if (entity.lat !== null) {
    await step(sub.id, 'Umgebung (OpenStreetMap)', async () => {
      const existing = new Set((await rankings.getFacts(entity.id, ranking.id)).map((f) => f.criterion_id));
      const facts = await geo.suggestFacts({ lat: Number(entity.lat), lng: Number(entity.lng) }, criteria.filter((c) => !existing.has(c.id)));
      const n = await insertAutoFacts(entity.id, facts);
      return `${n} Werte aus OpenStreetMap vorgeschlagen.`;
    });
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
  await submissions.setStatus(sub.id, 'admin_review');
}

module.exports = { run, insertAutoFacts };
