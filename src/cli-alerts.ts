/**
 * Firibgarlik alertlari va blok tavsiyalari hisoboti.
 * Foydalanish:
 *   npm run alerts                  → bugungi
 *   npm run alerts -- --days 7      → oxirgi 7 kun
 *   npm run alerts -- --ack 123     → alert #123 ni "ko'rib chiqildi" deb belgilash
 */
import { openDb } from './db.js';

function getArg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
}

const days = parseInt(getArg('days', '1'), 10);
const ackId = process.argv.includes('--ack') ? parseInt(getArg('ack', '0'), 10) : null;

const db = openDb();

if (ackId) {
  db.prepare('UPDATE fraud_alerts SET acknowledged = 1 WHERE id = ?').run(ackId);
  console.log(`Alert #${ackId} acknowledged.`);
  db.close();
  process.exit(0);
}

console.log('\n=============================================');
console.log(`FIRIBGARLIK HISOBOTI — oxirgi ${days} kun`);
console.log('=============================================');

const dateFilter = `date(created_at) >= date('now', '-${days} days')`;

const total = db
  .prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE ${dateFilter}`)
  .get() as { c: number };
console.log(`\nJami alert: ${total.c}`);

console.log('\n--- FIRIBGARLIK TURI BO\'YICHA ---');
console.table(
  db
    .prepare(
      `SELECT fraud_type as Tur, COUNT(*) as Soni,
              ROUND(AVG(fraud_score)) as Orta_score,
              MAX(fraud_score) as Max_score
       FROM fraud_alerts WHERE ${dateFilter}
       GROUP BY fraud_type ORDER BY Soni DESC`,
    )
    .all(),
);

console.log('\n--- 🚨 BLOK TAVSIYA QILINGAN HAYDOVCHILAR ---');
console.table(
  db
    .prepare(
      `SELECT callsign as Pozyvnoy, driver_name as Haydovchi,
              reason as Sabab, total_score as Score, alert_count as Alertlar,
              datetime(blocked_at, 'localtime') as Vaqt
       FROM driver_blocks
       ORDER BY total_score DESC LIMIT 30`,
    )
    .all(),
);

console.log('\n--- TOP SHUBHALI HAYDOVCHI (oxirgi davr) ---');
console.table(
  db
    .prepare(
      `SELECT callsign as Pozyvnoy, driver_name as Haydovchi,
              COUNT(*) as Alertlar,
              SUM(fraud_score) as Jami_score,
              MAX(fraud_score) as Max_score
       FROM fraud_alerts WHERE ${dateFilter}
       GROUP BY callsign, driver_name
       ORDER BY Jami_score DESC LIMIT 20`,
    )
    .all(),
);

console.log('\n--- OXIRGI 30 ALERT (eng yangi avval) ---');
console.table(
  db
    .prepare(
      `SELECT a.id, a.callsign as Pozyvnoy, a.driver_name as Haydovchi,
              a.fraud_type as Tur, a.fraud_score as Score,
              o.distance_km as Km, o.duration_sec as Sek,
              o.amount as Narx, a.details as Sabablar,
              datetime(a.created_at, 'localtime') as Vaqt
       FROM fraud_alerts a
       LEFT JOIN orders o ON o.order_id = a.order_id
       WHERE ${dateFilter}
       ORDER BY a.created_at DESC LIMIT 30`,
    )
    .all(),
);

db.close();
