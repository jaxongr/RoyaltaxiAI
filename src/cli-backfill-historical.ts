/**
 * Tarixga qaytarib backfill — N kun orqaga sayt'dan zakazlarni torta-versi.
 *
 * Foydalanish:
 *   tsx src/cli-backfill-historical.ts <siteId> <daysBack> [concurrency]
 *
 * Misol:
 *   tsx src/cli-backfill-historical.ts 1 30 16
 *
 * Env: SITE_ID, ROYALTAXI_BASE_URL, ROYALTAXI_USERNAME, ROYALTAXI_PASSWORD,
 *      STORAGE_STATE_PATH (har sayt uchun alohida)
 */
import { logger } from './common/logger.js';
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { config } from './common/config.js';
import { getOrders, getOrderDetails, toDbOrder } from './scraper/api.js';
import { openDb, insertOrder } from './db.js';

const siteIdArg = parseInt(process.argv[2] ?? '0', 10);
const daysBack = parseInt(process.argv[3] ?? '7', 10);
const concurrency = parseInt(process.argv[4] ?? '12', 10);

if (!process.env.SITE_ID) process.env.SITE_ID = String(siteIdArg);

const db = openDb();

// Per-site credentials DB'dan yuklash (agar SITE_ID berilgan bo'lsa)
if (siteIdArg > 0) {
  const row = db
    .prepare(
      `SELECT base_url, username, password FROM site_credentials WHERE id = ?`,
    )
    .get(siteIdArg) as { base_url: string; username: string; password: string } | undefined;
  if (row) {
    let baseUrl = row.base_url.replace(/\/+$/, '');
    baseUrl = baseUrl.replace(/\/management\/?$/, '');
    process.env.ROYALTAXI_BASE_URL = baseUrl;
    process.env.ROYALTAXI_USERNAME = row.username;
    process.env.ROYALTAXI_PASSWORD = row.password;
    if (!process.env.STORAGE_STATE_PATH) {
      process.env.STORAGE_STATE_PATH = `storage-state-site-${siteIdArg}.json`;
    }
    logger.info({ siteId: siteIdArg, baseUrl, user: row.username }, 'Sayt credentials DB\'dan yuklandi');
  } else {
    logger.error({ siteIdArg }, 'Sayt topilmadi DB\'da');
    process.exit(1);
  }
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${dd}T${hh}:${mm}`;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i]!);
      } catch (err) {
        results[i] = err as R;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function backfillDay(session: import('./scraper/browser.js').BrowserSession, date: Date): Promise<{
  fetched: number; inserted: number; skipped: number;
}> {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const periodStart = fmt(dayStart);
  const periodEnd = fmt(dayEnd);

  const BATCH = 500;
  let offset = 0;
  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  const haveStmt = db.prepare('SELECT 1 FROM orders WHERE order_id = ?');

  while (true) {
    const resp = await getOrders(session.page, {
      offset, limit: BATCH, periodStart, periodEnd,
    });
    const items = resp.state?.items ?? [];
    if (items.length === 0) break;
    fetched += items.length;

    const newOnes = items.filter((it) => !haveStmt.get(it.orderId));

    if (newOnes.length > 0) {
      const details = await mapLimit(newOnes, concurrency, (it) =>
        getOrderDetails(session.page, it.orderId).catch(() => null),
      );
      for (let i = 0; i < newOnes.length; i++) {
        const row = toDbOrder(newOnes[i]!, details[i] ?? null);
        const res = insertOrder(db, row);
        if (res === 'inserted') inserted++; else skipped++;
      }
    } else {
      skipped += items.length;
    }

    logger.info(
      { date: dayStart.toISOString().slice(0, 10), offset, fetched, inserted, skipped },
      'Backfill progress',
    );

    offset += items.length;
    if (items.length < BATCH) break;
  }

  return { fetched, inserted, skipped };
}

async function main(): Promise<void> {
  if (daysBack < 1 || daysBack > 90) {
    logger.error({ daysBack }, 'daysBack 1-90 oralig\'ida bo\'lishi kerak');
    process.exit(1);
  }

  logger.info(
    { siteId: siteIdArg, daysBack, concurrency, baseUrl: config.ROYALTAXI_BASE_URL },
    `🔄 HISTORICAL BACKFILL boshlanmoqda — ${daysBack} kun orqaga`,
  );

  const session = await createBrowserSession();
  await login(session);
  await session.page.goto(config.ROYALTAXI_BASE_URL + '/management/archive', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await humanPause(2000, 3000);

  const startedAt = Date.now();
  let totalFetched = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  // Bugundan boshlab ortga: 0..daysBack-1
  for (let i = 0; i < daysBack; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    try {
      const r = await backfillDay(session, d);
      totalFetched += r.fetched;
      totalInserted += r.inserted;
      totalSkipped += r.skipped;
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      logger.info(
        {
          day: d.toISOString().slice(0, 10),
          dayResult: r,
          totalFetched,
          totalInserted,
          totalSkipped,
          elapsedSec: elapsed,
          rate: Math.round(totalInserted / Math.max(1, elapsed) * 60),
        },
        `📅 Kun #${i + 1}/${daysBack} tugadi`,
      );
    } catch (err) {
      logger.error({ day: d.toISOString().slice(0, 10), err: (err as Error).message }, 'Kun xato');
    }
  }

  const totalSec = Math.round((Date.now() - startedAt) / 1000);
  logger.info(
    {
      daysBack,
      totalFetched,
      totalInserted,
      totalSkipped,
      totalSec,
      ratePerMin: Math.round((totalInserted / Math.max(1, totalSec)) * 60),
    },
    '✅ HISTORICAL BACKFILL TUGADI',
  );

  await closeBrowserSession(session);
  db.close();
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'Backfill xato');
  process.exit(1);
});
