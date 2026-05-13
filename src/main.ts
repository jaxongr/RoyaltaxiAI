/**
 * API-driven BULK scraper.
 * Usage: npm run dev -- --target 5000 --days 14
 */
import { logger } from './common/logger.js';
import { config } from './common/config.js';
import {
  createBrowserSession,
  closeBrowserSession,
  humanPause,
  type BrowserSession,
} from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { URLS } from './scraper/selectors.js';
import { getOrders, getOrderDetails, toDbOrder } from './scraper/api.js';
import { openDb, insertOrder, countOrders } from './db.js';

function parseArgs(): {
  target: number;
  days: number;
  concurrency: number;
  from: string | null;
  to: string | null;
} {
  const get = (key: string, def: string): string => {
    const idx = process.argv.indexOf(`--${key}`);
    return idx >= 0 ? (process.argv[idx + 1] ?? def) : (process.env[key.toUpperCase()] ?? def);
  };
  return {
    target: parseInt(get('target', '5000'), 10),
    days: parseInt(get('days', '14'), 10),
    concurrency: parseInt(get('concurrency', '8'), 10),
    from: process.argv.includes('--from') ? get('from', '') : null,
    to: process.argv.includes('--to') ? get('to', '') : null,
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}T00:00`;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (err) {
        results[i] = err as R;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  const { target, days, concurrency, from, to } = parseArgs();
  logger.info({ target, days, concurrency, from, to }, 'API bulk scrape boshlandi');

  const db = openDb();
  const before = countOrders(db);
  logger.info({ beforeTotal: before }, 'DB joriy');

  let session: BrowserSession | null = null;
  const startedAt = Date.now();

  try {
    session = await createBrowserSession();
    await login(session);

    const archiveUrl = `${config.ROYALTAXI_BASE_URL}${URLS.archiveOrders}`;
    await session.page.goto(archiveUrl, { waitUntil: 'domcontentloaded' });
    await humanPause(2500, 3500);
    await session.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', {
      timeout: 20_000,
    });
    const csrfInfo = await session.page.evaluate(() => {
      const m = document.querySelector('meta[name="csrf-token"]');
      return {
        url: window.location.href,
        csrf: m?.getAttribute('content') ?? null,
        hasCookie: document.cookie.length > 0,
      };
    });
    logger.info(csrfInfo, 'Sahifa tayyor — API chaqirishga o\'tamiz');

    // Period: --from/--to bo'lsa ularni ishlatamiz, aks holda days asosida
    let periodStart: string;
    let periodEnd: string;
    if (from && to) {
      periodStart = `${from}T00:00`;
      // end exclusive — to + 1 kun (shu sanagacha qamrab olish uchun)
      const toDate = new Date(`${to}T00:00`);
      toDate.setDate(toDate.getDate() + 1);
      periodEnd = formatDate(toDate);
    } else {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - days);
      const end = new Date(now);
      end.setDate(now.getDate() + 1);
      periodStart = formatDate(start);
      periodEnd = formatDate(end);
    }
    logger.info({ periodStart, periodEnd }, 'Davr oralig\'i');

    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    let fetched = 0;
    let offset = 0;
    const BATCH = 100;

    while (fetched < target) {
      const remaining = target - fetched;
      const limit = Math.min(BATCH, remaining);

      logger.info({ offset, limit }, 'get-orders so\'rovi');
      const resp = await getOrders(session.page, {
        offset,
        limit,
        periodStart,
        periodEnd,
      });
      const items = resp.state?.items ?? [];
      if (items.length === 0) {
        logger.info('Ko\'proq zakaz yo\'q — to\'xtaymiz');
        break;
      }

      // Parallel get-order-details
      const detailsStart = Date.now();
      const details = await mapLimit(items, concurrency, async (item) => {
        try {
          return await getOrderDetails(session!.page, item.orderId);
        } catch (err) {
          errors++;
          return null;
        }
      });
      const detailsMs = Date.now() - detailsStart;

      // Insert to DB
      for (let i = 0; i < items.length; i++) {
        const row = toDbOrder(items[i]!, details[i] ?? null);
        const res = insertOrder(db, row);
        if (res === 'inserted') inserted++;
        else skipped++;
      }

      fetched += items.length;
      offset += items.length;

      const elapsed = Date.now() - startedAt;
      const rate = (fetched / elapsed) * 1000;
      const eta = rate > 0 ? Math.round((target - fetched) / rate) : 0;
      logger.info(
        {
          fetched,
          inserted,
          skipped,
          errors,
          detailsMs,
          ratePerSec: Math.round(rate * 10) / 10,
          etaSec: eta,
          dbTotal: countOrders(db),
        },
        'Batch tugadi',
      );

      if (items.length < limit) {
        logger.info('Oxirgi batch to\'liq emas — natija oxiri');
        break;
      }
    }

    const totalMs = Date.now() - startedAt;
    logger.info(
      {
        fetched,
        inserted,
        skipped,
        errors,
        totalSec: Math.round(totalMs / 1000),
        totalMin: Math.round(totalMs / 60000),
        dbBefore: before,
        dbAfter: countOrders(db),
      },
      'BULK yakunlandi',
    );
  } catch (err) {
    logger.error({ err }, 'BULK xato');
    process.exitCode = 1;
  } finally {
    if (session) await closeBrowserSession(session);
    db.close();
  }
}

process.on('unhandledRejection', (r) => {
  logger.fatal({ r }, 'Unhandled rejection');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

void main();
