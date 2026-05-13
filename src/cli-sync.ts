/**
 * Saytdan haydovchilar, mashinalar, qora ro'yxat va lock kinds ni DB'ga ko'chiradi.
 * Foydalanish: npm run sync
 */
import { logger } from './common/logger.js';
import { config } from './common/config.js';
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { URLS } from './scraper/selectors.js';
import { getDrivers, getDriverDetails, getLockKinds, getFleets } from './scraper/drivers.js';
import { getBlacklist } from './scraper/blacklist.js';
import { openDb } from './db.js';

async function syncLockKinds(page: import('playwright').Page, db: import('better-sqlite3').Database): Promise<void> {
  const { kinds } = await getLockKinds(page);
  const stmt = db.prepare(`INSERT OR REPLACE INTO lock_kinds (kind_id, name) VALUES (?, ?)`);
  for (const k of kinds) stmt.run(k.kindId, k.name);
  logger.info({ count: kinds.length }, 'Lock kinds sinxronlandi');
}

async function syncDrivers(page: import('playwright').Page, db: import('better-sqlite3').Database): Promise<void> {
  let offset = 0;
  const LIMIT = 100;
  let total = 0;
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO drivers
      (driver_id, first_name, last_name, callsign, office_id, fleet_id, fleet_name, raw_data, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  while (true) {
    const resp = await getDrivers(page, { offset, limit: LIMIT });
    const items = resp.state.items ?? [];
    if (items.length === 0) break;
    for (const d of items) {
      upsert.run(
        d.id,
        d.firstName ?? '',
        d.lastName ?? '',
        d.callsign ?? '',
        String(d.officeId ?? ''),
        String(d.fleetId ?? ''),
        d.groupNames?.fleetName ?? '',
        JSON.stringify(d).slice(0, 2000),
      );
    }
    total += items.length;
    logger.info({ offset, fetched: items.length, total }, 'Haydovchi batch');
    if (items.length < LIMIT) break;
    offset += LIMIT;
    await humanPause(300, 600);
  }
  logger.info({ total }, 'Haydovchilar to\'liq sinxronlandi');
}

async function enrichDriverDetails(
  page: import('playwright').Page,
  db: import('better-sqlite3').Database,
  limit: number,
): Promise<void> {
  // Hozircha balans, lock_kind, phones bo'sh bo'lganlarni boyitamiz
  const rows = db
    .prepare(`SELECT driver_id, fleet_id, office_id FROM drivers WHERE balance IS NULL LIMIT ?`)
    .all(limit) as { driver_id: string; fleet_id: string; office_id: string }[];

  const update = db.prepare(`
    UPDATE drivers SET
      first_name = ?, last_name = ?, phones = ?, balance = ?, on_shift = ?,
      lock_kind = ?, lock_comment = ?, scraped_at = CURRENT_TIMESTAMP
    WHERE driver_id = ?
  `);

  let done = 0;
  for (const r of rows) {
    try {
      const d = await getDriverDetails(page, r.driver_id, r.fleet_id, r.office_id);
      update.run(
        d.firstName ?? '',
        d.lastName ?? '',
        JSON.stringify(d.phones ?? []),
        d.account?.balance ?? null,
        d.onShift ? 1 : 0,
        d.lock?.kind ?? null,
        d.lock?.comment ?? null,
        r.driver_id,
      );
      done++;
      if (done % 10 === 0) logger.info({ done, total: rows.length }, 'Boyitildi');
    } catch (err) {
      logger.warn({ err: (err as Error).message, driverId: r.driver_id }, 'Boyitishda xato');
    }
    await humanPause(150, 350);
  }
  logger.info({ done }, 'Haydovchi tafsilotlari boyitildi');
}

async function syncBlacklist(page: import('playwright').Page, db: import('better-sqlite3').Database): Promise<void> {
  let idAfter: number | null = null;
  let total = 0;
  const upsert = db.prepare(
    `INSERT OR REPLACE INTO blacklist_mirror (number_id, phone, enabled, raw_data, scraped_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  );

  while (true) {
    const resp = await getBlacklist(page, { perPage: 200, idAfter });
    const items = resp.numbers ?? [];
    if (items.length === 0) break;
    for (const b of items) {
      upsert.run(b.numberId, String(b.number), b.enabled ? 1 : 0, JSON.stringify(b));
    }
    total += items.length;
    idAfter = items[items.length - 1]!.numberId;
    if (items.length < 200) break;
    await humanPause(300, 600);
  }
  logger.info({ total }, 'Qora ro\'yxat sinxronlandi');
}

async function updateWhitelist(db: import('better-sqlite3').Database): Promise<void> {
  // Ishonchli haydovchi: 1000+ zakaz, ammo 0 ta alert, 0 ta blok
  const result = db
    .prepare(
      `UPDATE drivers SET whitelisted = 1
       WHERE callsign IN (
         SELECT o.callsign FROM orders o
         LEFT JOIN fraud_alerts a ON a.callsign = o.callsign
         LEFT JOIN driver_blocks b ON b.callsign = o.callsign
         WHERE o.callsign != ''
         GROUP BY o.callsign
         HAVING COUNT(o.id) >= 1000 AND COUNT(DISTINCT a.id) = 0 AND COUNT(DISTINCT b.callsign) = 0
       )`,
    )
    .run();
  logger.info({ whitelisted: result.changes }, 'Whitelist yangilandi');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipDetails = args.includes('--skip-details');
  const detailsLimit = parseInt(
    args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '100',
    10,
  );

  const db = openDb();
  const session = await createBrowserSession();
  try {
    await login(session);
    const url = `${config.ROYALTAXI_BASE_URL}${URLS.archiveOrders}`;
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    await humanPause(2500, 3500);
    await session.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', {
      timeout: 20_000,
    });

    logger.info('Lock kinds...');
    await syncLockKinds(session.page, db);

    logger.info('Fleets ko\'rib chiqilmoqda...');
    const fleets = await getFleets(session.page);
    logger.info({ count: fleets.fleets.length }, 'Avtokolonnalar');

    logger.info('Haydovchilar (asosiy)...');
    await syncDrivers(session.page, db);

    if (!skipDetails) {
      logger.info({ limit: detailsLimit }, 'Haydovchi tafsilotlari (balance, lock, phones)...');
      await enrichDriverDetails(session.page, db, detailsLimit);
    }

    logger.info('Qora ro\'yxat...');
    await syncBlacklist(session.page, db);

    logger.info('Whitelist yangilash...');
    await updateWhitelist(db);

    const stats = {
      drivers: (db.prepare('SELECT COUNT(*) as c FROM drivers').get() as { c: number }).c,
      whitelisted: (db.prepare('SELECT COUNT(*) as c FROM drivers WHERE whitelisted = 1').get() as { c: number }).c,
      locked: (db.prepare('SELECT COUNT(*) as c FROM drivers WHERE lock_kind IS NOT NULL').get() as { c: number }).c,
      blacklist: (db.prepare('SELECT COUNT(*) as c FROM blacklist_mirror').get() as { c: number }).c,
      lockKinds: (db.prepare('SELECT COUNT(*) as c FROM lock_kinds').get() as { c: number }).c,
    };
    logger.info(stats, 'YAKUNIY STATISTIKA');
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Sync xato');
    process.exitCode = 1;
  } finally {
    await closeBrowserSession(session);
    db.close();
  }
}

void main();
