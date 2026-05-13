import { openDb } from './db.js';

function getArg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? def) : def;
}

const today = new Date().toISOString().slice(0, 10);
const from = getArg('from', getArg('date', today));
const to = getArg('to', getArg('date', today));
const showAll = process.argv.includes('--all');

console.log('\n=============================================');
console.log(`HISOBOT: ${showAll ? 'HAMMA DAVR' : `${from} → ${to}`}`);
console.log('=============================================');

const db = openDb();
const whereDate = showAll ? '1=1' : 'date BETWEEN ? AND ?';
const params: string[] = showAll ? [] : [from, to];

const total = db.prepare(`SELECT COUNT(*) as c FROM orders WHERE ${whereDate}`).get(...params) as {
  c: number;
};
console.log(`\nJami zakazlar: ${total.c}`);

const byStatus = db
  .prepare(
    `SELECT status, COUNT(*) as c FROM orders WHERE ${whereDate} GROUP BY status ORDER BY c DESC`,
  )
  .all(...params);
console.log('\n--- Status bo\'yicha ---');
console.table(byStatus);

console.log('\n--- HUDUD × XIZMAT (faqat shu davrda) ---');
console.table(
  db
    .prepare(
      `SELECT
        region as Hudud,
        service as Xizmat,
        COUNT(*) as Jami,
        SUM(CASE WHEN status = 'finish' THEN 1 ELSE 0 END) as Bajarildi,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as Otkaz,
        ROUND(SUM(CASE WHEN status = 'order_cancelled' THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as "Otkaz%"
      FROM orders
      WHERE ${whereDate} AND region != ''
      GROUP BY region, service
      ORDER BY Jami DESC
      LIMIT 30`,
    )
    .all(...params),
);

console.log('\n--- TOP 15 HAYDOVCHI (shu davrda) ---');
console.table(
  db
    .prepare(
      `SELECT
        driver_name as Haydovchi,
        COUNT(*) as Jami,
        SUM(CASE WHEN status = 'finish' THEN 1 ELSE 0 END) as Bajardi,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as Otkaz,
        ROUND(SUM(CASE WHEN status = 'order_cancelled' THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as "Otkaz%"
      FROM orders
      WHERE ${whereDate} AND driver_name != ''
      GROUP BY driver_name
      ORDER BY Jami DESC
      LIMIT 15`,
    )
    .all(...params),
);

console.log('\n--- SHUBHALI HAYDOVCHI (otkaz % yuqori, min 10 zakaz, shu davrda) ---');
console.table(
  db
    .prepare(
      `SELECT
        driver_name as Haydovchi,
        COUNT(*) as Jami,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as Otkaz,
        ROUND(SUM(CASE WHEN status = 'order_cancelled' THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as "Otkaz%"
      FROM orders
      WHERE ${whereDate} AND driver_name != ''
      GROUP BY driver_name
      HAVING Jami >= 10
      ORDER BY "Otkaz%" DESC
      LIMIT 15`,
    )
    .all(...params),
);

console.log('\n--- SHUBHALI MIJOZ (bir haydovchiga juda ko\'p zakaz, shu davrda) ---');
console.table(
  db
    .prepare(
      `SELECT
        client_phone as Telefon,
        COUNT(*) as Zakaz,
        COUNT(DISTINCT driver_name) as "Turli_haydovchilar",
        GROUP_CONCAT(DISTINCT region) as Hududlar
      FROM orders
      WHERE ${whereDate} AND client_phone != ''
      GROUP BY client_phone
      HAVING Zakaz >= 3
      ORDER BY Zakaz DESC, "Turli_haydovchilar" ASC
      LIMIT 20`,
    )
    .all(...params),
);

db.close();
