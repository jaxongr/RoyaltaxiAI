/**
 * Mavjud DB'dagi orders.raw_text dan distance_km, amount, duration_sec,
 * is_driver_crook, driver_phones ni qaytadan ekstrakt qiladi va
 * shubhalilarni baholaydi.
 *
 * Foydalanish:
 *   npm run recalc                      → faqat update
 *   npm run recalc -- --score           → update + fraud baholash
 */
import { openDb, insertAlert, markOrderFraud, upsertDriverBlock } from './db.js';
import { scoreOrder, FRAUD_THRESHOLDS } from './fraud/rules.js';
import type { OrderRow } from './db.js';

const doScore = process.argv.includes('--score');

const db = openDb();

const updateStmt = db.prepare(`
  UPDATE orders
  SET amount = ?, distance_km = ?, driver_phones = ?, is_driver_crook = ?,
      submission_time = ?, finish_time = ?, duration_sec = ?,
      source = ?, cancel_kind = ?, cancel_comment = ?
  WHERE order_id = ?
`);

const rows = db
  .prepare('SELECT order_id, raw_text FROM orders WHERE raw_text IS NOT NULL')
  .all() as { order_id: number; raw_text: string }[];

console.log(`Jami ${rows.length} ta zakaz qayta hisoblanmoqda...`);

let updated = 0;
let parseErr = 0;
for (const r of rows) {
  try {
    const parsed = JSON.parse(r.raw_text);
    const d = parsed.details;
    const list = parsed.list;
    if (!d) continue;
    const cost = d.payment?.cost ?? null;
    const dist = d.payment?.taximeterDistance ?? null;
    const crook = d.isDriverCrook === true ? 1 : 0;
    const phones = JSON.stringify(d.assignee?.phones ?? []);
    const submission = d.submissionTime ?? d.time ?? null;
    const finish = d.finishTime ?? list?.dateFinished ?? null;
    let duration: number | null = null;
    if (submission && finish) {
      const s = new Date(submission).getTime();
      const f = new Date(finish).getTime();
      if (!isNaN(s) && !isNaN(f) && f >= s) duration = Math.round((f - s) / 1000);
    }
    const source = list?.source ?? null;
    const cancelKind = d.cancelCause?.kind ?? null;
    const cancelComment = d.cancelCause?.comment ?? null;
    updateStmt.run(
      cost, dist, phones, crook, submission, finish, duration,
      source, cancelKind, cancelComment, r.order_id,
    );
    updated++;
  } catch {
    parseErr++;
  }
}

console.log(`Yangilandi: ${updated}, parse xato: ${parseErr}`);

console.log('\n=== YANGI MASOFA TAQSIMOTI (finish) ===');
console.table(
  db
    .prepare(
      `SELECT
        CASE
          WHEN distance_km IS NULL THEN 'NULL'
          WHEN distance_km < 0.3 THEN '0-300m'
          WHEN distance_km < 0.5 THEN '300-500m'
          WHEN distance_km < 1.0 THEN '500m-1km'
          WHEN distance_km < 3.0 THEN '1-3km'
          WHEN distance_km < 10 THEN '3-10km'
          ELSE '10km+'
        END as Masofa,
        COUNT(*) as Soni
       FROM orders WHERE status = 'finish'
       GROUP BY Masofa ORDER BY Soni DESC`,
    )
    .all(),
);

if (doScore) {
  console.log('\n=== FRAUD BAHOLASH BOSHLANDI ===');
  const all = db
    .prepare(
      `SELECT order_id, callsign, date, time, region, service, tariff, address,
              driver_name, car, client_phone, driver_phones, amount, distance_km,
              status, raw_text, is_driver_crook, submission_time, finish_time, duration_sec,
              source, cancel_kind, cancel_comment
       FROM orders WHERE status IN ('finish', 'order_cancelled')`,
    )
    .all() as OrderRow[];

  // Eski alertlarni tozalash (qayta hisoblash uchun)
  db.exec('DELETE FROM fraud_alerts');
  db.exec('DELETE FROM driver_blocks');
  db.exec('UPDATE orders SET fraud_score = 0, fraud_reasons = NULL, alerted_at = NULL');

  let alerts = 0;
  for (const o of all) {
    const res = scoreOrder(db, o);
    if (res.score < FRAUD_THRESHOLDS.ALERT) continue;
    insertAlert(db, {
      order_id: o.order_id,
      callsign: o.callsign,
      driver_name: o.driver_name,
      fraud_type: res.primaryType,
      fraud_score: res.score,
      details: res.reasons.join(' | '),
    });
    markOrderFraud(db, o.order_id, res.score, res.reasons);
    alerts++;
  }

  // Endi haydovchilar bo'yicha agregatlash va blok tavsiyalari
  const drv = db
    .prepare(
      `SELECT callsign, driver_name, COUNT(*) as cnt, SUM(fraud_score) as total,
              MAX(fraud_score) as maxs
       FROM fraud_alerts
       WHERE callsign != ''
       GROUP BY callsign, driver_name
       HAVING total >= 150 OR cnt >= 3 OR maxs >= ${FRAUD_THRESHOLDS.AUTO_BLOCK}`,
    )
    .all() as { callsign: string; driver_name: string; cnt: number; total: number; maxs: number }[];

  for (const d of drv) {
    upsertDriverBlock(db, d.callsign, d.driver_name, 'AGGREGATE', d.total, d.cnt);
  }

  console.log(`Alertlar: ${alerts}, blok tavsiyalari: ${drv.length}`);

  console.log('\n=== 🚨 TOP BLOK TAVSIYALARI ===');
  console.table(
    db
      .prepare(
        `SELECT callsign as Pozyvnoy, driver_name as Haydovchi,
                total_score as Score, alert_count as Alertlar, reason as Sabab
         FROM driver_blocks
         ORDER BY total_score DESC LIMIT 25`,
      )
      .all(),
  );

  console.log('\n=== TOP SHUBHALI ZAKAZLAR ===');
  console.table(
    db
      .prepare(
        `SELECT order_id as ID, date as Sana, time as Vaqt, callsign as Sign,
                driver_name as Haydovchi, region as Hudud,
                distance_km as Km, duration_sec as Sek, amount as Narx,
                fraud_score as Score, fraud_reasons as Sabablar
         FROM orders
         WHERE fraud_score >= ${FRAUD_THRESHOLDS.STRONG}
         ORDER BY fraud_score DESC LIMIT 25`,
      )
      .all(),
  );
}

db.close();
