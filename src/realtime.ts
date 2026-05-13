/**
 * Real-time monitor — har 30 sek yangi tugagan zakazlarni tortib,
 * AI-siz qoidalar dvigateliga uzatadi, shubhali bo'lsa alert + driver belgilash.
 *
 * Foydalanish:
 *   npm run monitor -- --interval 30 --lookback 15
 *
 *   --interval N   — har necha sekundda tekshirish (default 30)
 *   --lookback N   — necha daqiqa orqaga qarab tekshirish (default 15)
 *   --concurrency  — parallel get-order-details (default 6)
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
import {
  openDb,
  insertOrder,
  insertAlert,
  markOrderFraud,
  upsertDriverBlock,
  updateMonitorState,
} from './db.js';
import { scoreOrder, FRAUD_THRESHOLDS } from './fraud/rules.js';
import {
  sendAlert,
  sendStartup,
  sendHeartbeat,
  startCommandLoop,
  isTelegramConfigured,
} from './telegram.js';
import type Database from 'better-sqlite3';

function parseArgs(): {
  interval: number;
  lookback: number;
  concurrency: number;
  heartbeatMin: number;
} {
  const get = (key: string, def: string): string => {
    const i = process.argv.indexOf(`--${key}`);
    return i >= 0 ? (process.argv[i + 1] ?? def) : def;
  };
  return {
    interval: parseInt(get('interval', '5'), 10),
    lookback: parseInt(get('lookback', '10'), 10),
    concurrency: parseInt(get('concurrency', '8'), 10),
    heartbeatMin: parseInt(get('heartbeat', '15'), 10),
  };
}

function formatTs(d: Date): string {
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

async function fetchSiteTotalToday(session: BrowserSession): Promise<number | null> {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  try {
    const resp = await getOrders(session.page, {
      offset: 0,
      limit: 1,
      periodStart: formatTs(start),
      periodEnd: formatTs(end),
    });
    return resp.state?.total ?? resp.state?.totalCount ?? null;
  } catch {
    return null;
  }
}

async function tick(
  session: BrowserSession,
  db: Database.Database,
  lookbackMin: number,
  concurrency: number,
  stats?: { ticks: number; ordersProcessed: number },
): Promise<void> {
  const now = new Date();
  const start = new Date(now.getTime() - lookbackMin * 60 * 1000);
  const end = new Date(now.getTime() + 5 * 60 * 1000); // + 5 min buffer
  const periodStart = formatTs(start);
  const periodEnd = formatTs(end);

  // get-orders: BARCHA SAHIFALARNI paginate qilamiz — bitta zakaz ham qolmasin
  const BATCH = 200;
  const MAX_PAGES = 200; // xavfsizlik chegarasi (40k zakazgacha)
  const firstResp = await getOrders(session.page, {
    offset: 0, limit: BATCH, periodStart, periodEnd,
  });
  type Item = (typeof firstResp.state.items)[number];
  const items: Item[] = [...(firstResp.state?.items ?? [])];
  const siteTotalThisWindow = firstResp.state?.total ?? null;
  if (items.length === BATCH) {
    for (let page = 1; page < MAX_PAGES; page++) {
      const r = await getOrders(session.page, {
        offset: page * BATCH, limit: BATCH, periodStart, periodEnd,
      });
      const batch = r.state?.items ?? [];
      if (batch.length === 0) break;
      items.push(...batch);
      if (batch.length < BATCH) break;
    }
  }
  if (siteTotalThisWindow !== null && items.length < siteTotalThisWindow) {
    logger.warn(
      { fetched: items.length, expected: siteTotalThisWindow },
      'Pagination tugamadi — sayt bizdan ko\'p qaytardi',
    );
  }

  // Har 10-tickda bugungi totalCount ni saytdan so'raymiz (coverage uchun)
  if (stats && stats.ticks % 10 === 0) {
    const siteTotal = await fetchSiteTotalToday(session);
    const today = new Date().toISOString().slice(0, 10);
    const ourCount = (
      db.prepare(`SELECT COUNT(*) as c FROM orders WHERE date = ?`).get(today) as { c: number }
    ).c;
    if (siteTotal !== null) {
      updateMonitorState(db, { siteTotalToday: siteTotal, ourCountToday: ourCount });
    }
  }
  updateMonitorState(db, { tickIncrement: true });

  // Faqat completed=true va DB'da yo'q bo'lganlarni tahlil qilamiz
  const haveStmt = db.prepare('SELECT 1 FROM orders WHERE order_id = ?');
  const fresh = items.filter((it) => it.completed === true && !haveStmt.get(it.orderId));

  if (fresh.length === 0) {
    logger.info({ scanned: items.length }, 'Yangi finish zakaz yo\'q');
    return;
  }

  logger.info({ scanned: items.length, fresh: fresh.length }, 'Yangi finish zakazlarni tahlil qilamiz');

  // Parallel details
  const details = await mapLimit(fresh, concurrency, (it) =>
    getOrderDetails(session.page, it.orderId).catch(() => null),
  );

  let alertsAdded = 0;
  let blocksAdded = 0;

  for (let i = 0; i < fresh.length; i++) {
    const row = toDbOrder(fresh[i]!, details[i] ?? null);
    insertOrder(db, row);

    const result = scoreOrder(db, row);
    if (result.score < FRAUD_THRESHOLDS.ALERT) continue;

    insertAlert(db, {
      order_id: row.order_id,
      callsign: row.callsign,
      driver_name: row.driver_name,
      fraud_type: result.primaryType,
      fraud_score: result.score,
      details: result.reasons.join(' | '),
    });
    markOrderFraud(db, row.order_id, result.score, result.reasons);
    alertsAdded++;

    // Haydovchi jami hisobini ko'tarish va auto-block tekshirish
    const aggRow = db
      .prepare(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(fraud_score), 0) as total
         FROM fraud_alerts WHERE callsign = ?
         AND date(created_at) >= date('now', '-7 days')`,
      )
      .get(row.callsign) as { cnt: number; total: number };

    const shouldBlock =
      result.score >= FRAUD_THRESHOLDS.AUTO_BLOCK ||
      aggRow.total >= FRAUD_THRESHOLDS.WEEKLY_TOTAL_BLOCK ||
      aggRow.cnt >= FRAUD_THRESHOLDS.WEEKLY_COUNT_BLOCK;

    if (shouldBlock) {
      upsertDriverBlock(
        db,
        row.callsign,
        row.driver_name,
        result.primaryType,
        aggRow.total,
        aggRow.cnt,
      );
      blocksAdded++;
      logger.warn(
        {
          callsign: row.callsign,
          driver: row.driver_name,
          score: result.score,
          totalScore: aggRow.total,
          alertCount: aggRow.cnt,
          orderId: row.order_id,
          reasons: result.reasons,
        },
        '🚨 HAYDOVCHI BLOKLASH TAVSIYASI',
      );
    } else {
      logger.warn(
        {
          callsign: row.callsign,
          driver: row.driver_name,
          score: result.score,
          orderId: row.order_id,
          distance: row.distance_km,
          duration: row.duration_sec,
          reasons: result.reasons,
        },
        '⚠️ Shubhali zakaz',
      );
    }

    // Telegram alert (fire-and-forget, monitorni bloklamaydi)
    void sendAlert({
      callsign: row.callsign,
      driver: row.driver_name || '(noma\'lum)',
      score: result.score,
      orderId: row.order_id,
      distance: row.distance_km,
      duration: row.duration_sec,
      amount: row.amount,
      address: row.address,
      region: row.region,
      service: row.service,
      reasons: result.reasons,
      isBlockRecommendation: shouldBlock,
      totalScore: shouldBlock ? aggRow.total : undefined,
      alertCount: shouldBlock ? aggRow.cnt : undefined,
    });
  }

  logger.info(
    { processed: fresh.length, alerts: alertsAdded, newBlocks: blocksAdded },
    'Tick yakunlandi',
  );

  if (stats) {
    stats.ticks++;
    stats.ordersProcessed += fresh.length;
  }
}

async function bootSession(archiveUrl: string): Promise<BrowserSession> {
  const session = await createBrowserSession();
  await login(session);
  await session.page
    .goto(archiveUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    .catch(() => undefined);
  await humanPause(2000, 3000);
  await session.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', {
    timeout: 25_000,
  });
  return session;
}

interface MonitorStats {
  startedAt: number;
  ticks: number;
  ordersProcessed: number;
  lastError: string | undefined;
}

function buildStatsHandler(db: Database.Database, s: MonitorStats): () => Promise<string> {
  return async () => {
    const today = new Date().toISOString().slice(0, 10);
    const alertsToday = (
      db
        .prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE date(created_at) = ?`)
        .get(today) as { c: number }
    ).c;
    const blocksToday = (
      db
        .prepare(`SELECT COUNT(*) as c FROM driver_blocks WHERE date(blocked_at) = ?`)
        .get(today) as { c: number }
    ).c;
    const ordersToday = (
      db.prepare(`SELECT COUNT(*) as c FROM orders WHERE date = ?`).get(today) as { c: number }
    ).c;
    const uptimeMin = Math.round((Date.now() - s.startedAt) / 60000);
    return [
      '📊 <b>Bugungi statistika</b>',
      '',
      `📦 Zakaz: ${ordersToday}`,
      `⚠️ Alert: ${alertsToday}`,
      `🚨 Blok tavsiya: ${blocksToday}`,
      `🔄 Tick: ${s.ticks}`,
      `⏱ Uptime: ${uptimeMin} daqiqa`,
    ].join('\n');
  };
}

function buildTopHandler(db: Database.Database): () => Promise<string> {
  return async () => {
    const rows = db
      .prepare(
        `SELECT callsign, driver_name, COUNT(*) as cnt, SUM(fraud_score) as total
         FROM fraud_alerts
         WHERE date(created_at) = date('now', 'localtime')
         GROUP BY callsign, driver_name
         ORDER BY total DESC LIMIT 10`,
      )
      .all() as { callsign: string; driver_name: string; cnt: number; total: number }[];
    if (rows.length === 0) return '✅ Bugun shubhali haydovchi yo\'q';
    const lines = ['🏆 <b>Top shubhali haydovchilar (bugun)</b>', ''];
    rows.forEach((r, i) => {
      lines.push(
        `${i + 1}. <code>${r.callsign}</code> <b>${r.driver_name}</b> — ${r.cnt} alert, score ${r.total}`,
      );
    });
    return lines.join('\n');
  };
}

function buildBlocksHandler(db: Database.Database): () => Promise<string> {
  return async () => {
    const rows = db
      .prepare(
        `SELECT callsign, driver_name, total_score, alert_count, reason,
                datetime(blocked_at, 'localtime') as ts
         FROM driver_blocks
         ORDER BY blocked_at DESC LIMIT 15`,
      )
      .all() as {
      callsign: string;
      driver_name: string;
      total_score: number;
      alert_count: number;
      reason: string;
      ts: string;
    }[];
    if (rows.length === 0) return '✅ Blok tavsiyasi yo\'q';
    const lines = ['🚨 <b>Blok tavsiyalari</b>', ''];
    rows.forEach((r, i) => {
      lines.push(
        `${i + 1}. <code>${r.callsign}</code> ${r.driver_name}\n   ${r.reason} • ${r.alert_count} alert • score ${r.total_score}`,
      );
    });
    return lines.join('\n');
  };
}

async function main(): Promise<void> {
  const { interval, lookback, concurrency, heartbeatMin } = parseArgs();
  logger.info(
    { interval, lookback, concurrency, heartbeatMin, telegram: isTelegramConfigured() },
    'Real-time monitor boshlandi',
  );

  const db = openDb();
  const stats: MonitorStats = {
    startedAt: Date.now(),
    ticks: 0,
    ordersProcessed: 0,
    lastError: undefined,
  };

  void sendStartup({ interval, mode: 'polling-fast' });

  // Telegram buyruqlari
  void startCommandLoop({
    '/stats': buildStatsHandler(db, stats),
    '/top': buildTopHandler(db),
    '/blocks': buildBlocksHandler(db),
    '/help': async () =>
      [
        '🤖 <b>Buyruqlar</b>',
        '',
        '/stats — bugungi statistika',
        '/top — top shubhali haydovchilar',
        '/blocks — blok tavsiyalari',
        '/help — yordam',
      ].join('\n'),
  });

  // Heartbeat — har N daqiqada
  setInterval(
    () => {
      const today = new Date().toISOString().slice(0, 10);
      const alertsToday = (
        db
          .prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE date(created_at) = ?`)
          .get(today) as { c: number }
      ).c;
      const blocksToday = (
        db
          .prepare(`SELECT COUNT(*) as c FROM driver_blocks WHERE date(blocked_at) = ?`)
          .get(today) as { c: number }
      ).c;
      void sendHeartbeat({
        uptimeMin: Math.round((Date.now() - stats.startedAt) / 60000),
        ticks: stats.ticks,
        ordersProcessed: stats.ordersProcessed,
        alertsToday,
        blocksToday,
        lastError: stats.lastError,
      });
    },
    heartbeatMin * 60 * 1000,
  );

  const archiveUrl = `${config.ROYALTAXI_BASE_URL}${URLS.archiveOrders}`;
  let session: BrowserSession | null = null;
  let bootRetry = 0;

  // Tashqi loop — har qanday xato bo'lsa, qayta urinamiz
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      logger.info({ bootRetry }, 'Sessiya yaratilmoqda...');
      session = await bootSession(archiveUrl);
      logger.info('Sahifa tayyor — monitoring siklini boshlaymiz');
      bootRetry = 0;

      let consecutiveErrors = 0;
      while (true) {
        const tickStart = Date.now();
        try {
          await tick(session, db, lookback, concurrency, stats);
          consecutiveErrors = 0;
          stats.lastError = undefined;
        } catch (err) {
          consecutiveErrors++;
          stats.lastError = (err as Error).message;
          logger.error(
            { err: stats.lastError, consecutiveErrors },
            'Tick xato',
          );
          if (consecutiveErrors >= 5) {
            logger.error('5 ta ketma-ket xato — sessiyani qayta tiklaymiz');
            throw new Error('session-reboot');
          }
        }
        const elapsed = Date.now() - tickStart;
        const wait = Math.max(0, interval * 1000 - elapsed);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    } catch (err) {
      bootRetry++;
      const msg = (err as Error).message;
      logger.error({ err: msg, bootRetry }, 'Monitor xatoga uchradi — qayta boshlanadi');
      if (session) {
        try {
          await closeBrowserSession(session);
        } catch {}
        session = null;
      }
      const wait = Math.min(60_000, 5_000 * bootRetry);
      logger.info({ wait }, `${Math.round(wait / 1000)} sek kutib qayta boshlaymiz...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

process.on('SIGINT', () => {
  logger.info('SIGINT — chiqish');
  process.exit(0);
});
process.on('unhandledRejection', (r) => {
  logger.fatal({ r }, 'Unhandled rejection');
});

void main();
