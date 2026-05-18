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
import { getOrders, getOrderDetails, toDbOrder, getAccessibleOffices } from './scraper/api.js';
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
  sendPeriodicReport,
  sendDailyReport,
  sendNoOrdersAlert,
  sendSiteRestored,
  startCommandLoop,
  isTelegramConfigured,
} from './telegram.js';
import type Database from 'better-sqlite3';

interface MonitorStats {
  startedAt: number;
  ticks: number;
  ordersProcessed: number;
  lastError: string | undefined;
  lastNewFinishAt: number;
  consecutiveEmptyTicks: number;
  consecutiveSiteErrors: number;
}

// Loginga ruxsat etilgan barcha shaharlar (officeId'lar) — sayt'ning
// "Подразделение" filteri default'da hammasini belgilamaganligi uchun
// biz explicit ravishda hammasini uzatamiz. Bo'sh array yoki null = "barcha"
// (sayt'ning saqlangan filteri ishlatiladi). Aniq ro'yxat yaxshiroq.
let accessibleOfficeIds: number[] | null = null;
let accessibleOfficesRefreshedAt = 0;

async function refreshAccessibleOffices(session: BrowserSession): Promise<void> {
  try {
    const resp = await getAccessibleOffices(session.page);
    const ids = resp.offices?.map((o) => o.officeId) ?? [];
    if (ids.length > 0) {
      accessibleOfficeIds = ids;
      accessibleOfficesRefreshedAt = Date.now();
      const names = resp.offices.map((o) => `${o.name} (${o.officeId}, ${o.fleets.length} park)`);
      logger.info(
        { count: ids.length, offices: names },
        `🏢 Подразделение: ${ids.length} ta shahar topildi (hammasi monitoring uchun belgilanadi)`,
      );
    } else {
      logger.warn('Подразделение API bo\'sh ro\'yxat qaytardi — fallback: officeIds=null');
      accessibleOfficeIds = null;
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'Подразделение enumeratsiya xato — fallback: officeIds=null',
    );
    accessibleOfficeIds = null;
  }
}

/**
 * UI orqali Подразделение filtrini ochib, barcha mavjud (lekin belgilanmagan)
 * checkbox'larni belgilaydi. Bu sayt API'si "saqlangan filter"ga bog'liq holatda
 * yangi tumanlar (Poytug' va boshqalar) kelishini ta'minlaydi.
 *
 * Har 1 soatda chaqiriladi — agar login'ga yangi hudud qo'shilsa, u ham
 * avtomatik belgilanadi.
 */
async function ensureAllSubdivisionsChecked(session: BrowserSession): Promise<void> {
  const { page } = session;
  const archiveUrl = `${config.ROYALTAXI_BASE_URL}${URLS.archiveOrders}`;
  try {
    // Sahifa hali archive'da emas bo'lsa, navigatsiya
    if (!page.url().includes('/archive')) {
      await page.goto(archiveUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 2000));
    }

    // tsx/esbuild __name workaround — browser context'ga shim qo'shamiz
    await page.addInitScript(() => {
      const g = globalThis as Record<string, unknown>;
      if (typeof g.__name === 'undefined') {
        g.__name = (fn: unknown): unknown => fn;
      }
    }).catch(() => undefined);

    // Sahifa to'liq yuklanishini kutamiz (Vue komponentlari render bo'lguncha)
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 3000));

    // Browser tomonida ishlaydigan funksiyani string sifatida uzatamiz —
    // esbuild __name'larini avtomatik inject qilmasligi uchun.
    const evalBody = `
      (async function() {
        var g = globalThis;
        if (typeof g.__name === 'undefined') g.__name = function(fn){return fn;};
        function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}

        function findTrigger() {
          // 1-darajali: matn aniq "Подразделение" bilan boshlanadi (qisqa elementlar)
          var all = Array.from(document.querySelectorAll('button, [role="button"], .hv-filter, [class*="filter"], [class*="dropdown"], [class*="select"], label, span, div, a'));
          for (var i=0; i<all.length; i++) {
            var t = (all[i].textContent || '').trim();
            if (t.length > 200) continue; // juda katta wrapper'lar — o'tkazib yuboramiz
            if (/^Подразделени/i.test(t)) return all[i];
            if (/^Subdivisi|^Hudud|^Подраздел/i.test(t)) return all[i];
          }
          // 2-darajali: matn ichida "Подразделени" bor (qisqa elementlar)
          for (var j=0; j<all.length; j++) {
            var t2 = (all[j].textContent || '').trim();
            if (t2.length > 100) continue;
            if (/Подразделени/i.test(t2)) return all[j];
          }
          return null;
        }

        var trigger = findTrigger();
        if (!trigger) {
          // Debug: barcha qisqa textcontent'larni qaytarib yuboramiz (qaysi matn bor ko'rsin)
          var sample = [];
          var els = Array.from(document.querySelectorAll('button, label, [class*="filter"]')).slice(0, 50);
          for (var s=0; s<els.length; s++) {
            var st = (els[s].textContent || '').trim();
            if (st && st.length < 50) sample.push(st);
          }
          return { ok: false, reason: 'trigger-not-found', sampleTexts: sample.slice(0, 20) };
        }

        trigger.scrollIntoView({ block: 'center' });
        await sleep(300);
        trigger.click();
        await sleep(3000); // popup'ning to'liq ochilishi uchun ko'proq vaqt

        // Real <input type=checkbox> + custom Vue/Antd checkbox'larni topish
        var allCbs = Array.from(document.querySelectorAll(
          'input[type="checkbox"], [role="checkbox"], .hv-checkbox, [class*="checkbox"], [class*="check-item"]'
        ));
        var seen = new Set();
        var checkboxes = [];
        for (var j=0; j<allCbs.length; j++) {
          var el = allCbs[j];
          var r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // bir xil elementning bir necha proksisini olib qolmaslik
          var key = (el.id || '') + '|' + (el.className || '') + '|' + r.top + '|' + r.left;
          if (seen.has(key)) continue;
          seen.add(key);
          checkboxes.push(el);
        }

        function isChecked(el) {
          if (el.tagName === 'INPUT') return !!el.checked;
          var ariaCh = el.getAttribute('aria-checked');
          if (ariaCh === 'true') return true;
          if (ariaCh === 'false') return false;
          // class'da "checked" bormi
          if (/(^|\s)(checked|active|selected)(\s|$)/.test(el.className || '')) return true;
          // ichida tick icon yoki active class
          if (el.querySelector('.checked, .active, [class*="checked"]')) return true;
          return false;
        }

        var checkedCount = 0;
        var alreadyChecked = 0;
        var checkedNames = [];
        for (var k=0; k<checkboxes.length; k++) {
          var cb = checkboxes[k];
          if (!isChecked(cb)) {
            cb.click();
            await sleep(100);
            checkedCount++;
            var parentLabel = cb.closest('label');
            var labelText = parentLabel ? parentLabel.textContent
                          : (cb.nextElementSibling ? cb.nextElementSibling.textContent
                          : (cb.parentElement ? cb.parentElement.textContent : ''));
            var label = (labelText || '').trim();
            if (label) checkedNames.push(label.slice(0, 50));
          } else {
            alreadyChecked++;
          }
        }

        var allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
        var applyBtn = null;
        for (var m=0; m<allBtns.length; m++) {
          var txt = (allBtns[m].textContent || '').trim();
          if (/Применить|Apply|Saqlash|Saqla|^OK$/i.test(txt)) { applyBtn = allBtns[m]; break; }
        }
        if (applyBtn) { applyBtn.click(); await sleep(500); }
        else { document.body.click(); await sleep(300); }

        return {
          ok: true,
          totalCheckboxes: checkboxes.length,
          newlyChecked: checkedCount,
          alreadyChecked: alreadyChecked,
          names: checkedNames
        };
      })()
    `;
    const result = await page.evaluate(evalBody) as {
      ok: boolean;
      reason?: string;
      sampleTexts?: string[];
      totalCheckboxes?: number;
      newlyChecked?: number;
      alreadyChecked?: number;
      names?: string[];
    };

    if (!result.ok && result.reason === 'trigger-not-found') {
      logger.warn(
        { sampleTexts: result.sampleTexts },
        'Подразделение UI ochilmadi — DOM\'da matn topilmadi (debug uchun sample matnlar)',
      );
      return;
    }
    if (result.ok && (result.totalCheckboxes ?? 0) === 0) {
      // Debug: page'ning HTML'ini dump qilamiz keyingi tahlil uchun
      try {
        const html = await page.content();
        const fs = await import('node:fs');
        const dumpPath = `/tmp/archive-page-dump-${Date.now()}.html`;
        fs.writeFileSync(dumpPath, html);
        logger.warn(
          { result, dumpPath, htmlLen: html.length },
          'Подразделение UI: checkbox topilmadi — HTML dump saqlandi tahlil uchun',
        );
      } catch (e) {
        logger.warn({ result, dumpErr: (e as Error).message }, 'Подразделение UI: checkbox topilmadi (dump xato)');
      }
      return;
    }

    if (result.ok && (result.totalCheckboxes ?? 0) > 0) {
      const newly = result.newlyChecked ?? 0;
      const already = result.alreadyChecked ?? 0;
      const total = result.totalCheckboxes ?? 0;
      if (newly > 0) {
        logger.info(
          { newlyChecked: newly, alreadyChecked: already, names: result.names },
          `✅ Подразделение UI: ${newly} ta yangi hudud belgilandi (jami ${total})`,
        );
      } else {
        logger.info(
          { totalCheckboxes: total },
          `Подразделение UI: hammasi belgilangan (${already})`,
        );
      }
    } else {
      logger.warn({ reason: (result as { reason?: string }).reason }, 'Подразделение UI ochilmadi');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Подразделение UI tekshirishda xato');
  }
}

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
      officeIds: accessibleOfficeIds,
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
  stats?: MonitorStats,
): Promise<void> {
  const now = new Date();
  const start = new Date(now.getTime() - lookbackMin * 60 * 1000);
  const end = new Date(now.getTime() + 5 * 60 * 1000); // + 5 min buffer
  const periodStart = formatTs(start);
  const periodEnd = formatTs(end);

  // Подразделение ro'yxatini har 30 daqiqada yangilab turamiz
  // (yangi shahar qo'shilsa, monitoring uchun belgilanadi)
  if (Date.now() - accessibleOfficesRefreshedAt > 30 * 60 * 1000) {
    await refreshAccessibleOffices(session);
  }

  // get-orders: BARCHA SAHIFALARNI paginate qilamiz — bitta zakaz ham qolmasin
  // officeIds: barcha accessible shaharlar (Poytug', Toshkent va h.k. tushib qolmasin)
  const BATCH = 200;
  const MAX_PAGES = 200; // xavfsizlik chegarasi (40k zakazgacha)
  const firstResp = await getOrders(session.page, {
    offset: 0, limit: BATCH, periodStart, periodEnd,
    officeIds: accessibleOfficeIds,
  });
  type Item = (typeof firstResp.state.items)[number];
  const items: Item[] = [...(firstResp.state?.items ?? [])];
  const siteTotalThisWindow = firstResp.state?.total ?? null;
  if (items.length === BATCH) {
    for (let page = 1; page < MAX_PAGES; page++) {
      const r = await getOrders(session.page, {
        offset: page * BATCH, limit: BATCH, periodStart, periodEnd,
        officeIds: accessibleOfficeIds,
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
    const today = new Date(Date.now() + 5*3600*1000).toISOString().slice(0, 10);
    const ourCount = (
      db.prepare(`SELECT COUNT(*) as c FROM orders WHERE date = ?`).get(today) as { c: number }
    ).c;
    if (siteTotal !== null) {
      updateMonitorState(db, { siteTotalToday: siteTotal, ourCountToday: ourCount });
    }
  }
  updateMonitorState(db, { tickIncrement: true });

  // Yangi zakazlarni (HAM finish, HAM bekor) tahlil qilamiz
  const haveStmt = db.prepare('SELECT 1 FROM orders WHERE order_id = ?');
  const fresh = items.filter((it) => !haveStmt.get(it.orderId));

  if (fresh.length === 0) {
    logger.info({ scanned: items.length }, 'Yangi zakaz yo\'q');
    return;
  }

  const freshFinish = fresh.filter((it) => it.completed === true).length;
  const freshCancel = fresh.length - freshFinish;
  logger.info(
    { scanned: items.length, fresh: fresh.length, finish: freshFinish, cancelled: freshCancel },
    'Yangi zakazlarni tahlil qilamiz',
  );

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
         AND date(created_at) >= date('now', '+5 hours', '-7 days')`,
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
      date: row.date,
      time: row.time,
    });
  }

  logger.info(
    { processed: fresh.length, alerts: alertsAdded, newBlocks: blocksAdded },
    'Tick yakunlandi',
  );

  if (stats) {
    stats.ticks++;
    stats.ordersProcessed += fresh.length;
    if (fresh.length > 0) {
      stats.lastNewFinishAt = Date.now();
      stats.consecutiveEmptyTicks = 0;
    } else {
      stats.consecutiveEmptyTicks++;
    }
    stats.consecutiveSiteErrors = 0; // muvaffaqiyatli tick = sayt ishlaydi
  }
}

/**
 * DB'da faol credential bormi tekshiradi. Bor bo'lsa env'ni qaytaradi (override).
 * Aks holda .env qiymatlari ishlatiladi.
 */
function applyActiveCredentialFromDb(db: Database.Database): void {
  // Agar dashboard tomonidan SITE_ID env bilan ishga tushgan bo'lsa,
  // dashboard allaqachon ROYALTAXI_BASE_URL/USERNAME/PASSWORD'ni env'ga qo'ygan.
  // Bu funksiya faqat eski usulda (manual realtime.ts ishga tushirilsa) kerak.
  if (process.env.SITE_ID) {
    logger.info(
      { siteId: process.env.SITE_ID, siteName: process.env.SITE_NAME, url: process.env.ROYALTAXI_BASE_URL },
      'Multi-site monitor — env\'dagi credentials ishlatiladi',
    );
    return;
  }
  const row = db
    .prepare(
      `SELECT base_url, username, password FROM site_credentials WHERE is_active = 1 LIMIT 1`,
    )
    .get() as { base_url: string; username: string; password: string } | undefined;
  if (row) {
    // base_url normalizatsiya — oxiridagi / va /management/ olib tashlanadi
    let baseUrl = row.base_url.replace(/\/+$/, '');
    baseUrl = baseUrl.replace(/\/management\/?$/, '');
    process.env.ROYALTAXI_BASE_URL = baseUrl;
    process.env.ROYALTAXI_USERNAME = row.username;
    process.env.ROYALTAXI_PASSWORD = row.password;
    logger.info(
      { url: baseUrl, user: row.username },
      'DB dan faol credential yuklandi (.env override)',
    );
  } else {
    logger.info('DB da faol credential yo\'q — .env qiymatlari ishlatiladi');
  }
}

async function bootSession(archiveUrl: string): Promise<BrowserSession> {
  const session = await createBrowserSession();
  await login(session);
  await session.page
    .goto(archiveUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    .catch(() => undefined);
  await humanPause(2000, 3000);
  // Jadval qatorini kutamiz, lekin bo'sh sayt uchun (yangi credential) bu xato emas.
  // Empty state'ni ham qabul qilamiz — birinchi marta urinishda agar zakaz yo'q bo'lsa.
  await session.page
    .waitForSelector('.hv-table__body-row.hv-table__body-row--body, .hv-table__empty, .hv-table', {
      timeout: 25_000,
    })
    .catch(() => {
      logger.warn('Archive jadvali topilmadi — sayt bo\'sh yoki UI boshqa. Davom etamiz.');
    });
  return session;
}

/**
 * Startup'da bugun 00:00 dan hozirgi vaqtgacha bo'lgan zakazlarni tortib oladi.
 * Bu ish faqat birinchi yoqilishda yoki monitor uzun vaqt yopilgan bo'lsa kerak.
 * Hisoblash: agar DB'da bugungi zakazlarning soni sayt'da yo'qlari'dan kichik bo'lsa,
 * backfill ishga tushadi.
 */
async function startupBackfill(
  session: BrowserSession,
  db: Database.Database,
  concurrency: number,
): Promise<void> {
  // Bugun 00:00 dan hozirgacha
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const periodStart = formatTs(dayStart);
  const periodEnd = formatTs(new Date(now.getTime() + 5 * 60 * 1000));

  // Avval sayt nima deyishini olamiz (totalCount)
  const probe = await getOrders(session.page, {
    offset: 0, limit: 1, periodStart, periodEnd,
    officeIds: accessibleOfficeIds,
  });
  const siteToday = probe.state?.total ?? 0;

  const today = new Date(now.getTime() + 5*3600*1000).toISOString().slice(0, 10);
  // Multi-site: SITE_ID bo'lsa, faqat shu saytning today count'i
  const siteIdEnv = process.env.SITE_ID ? parseInt(process.env.SITE_ID, 10) : null;
  const ourToday = siteIdEnv
    ? (db
        .prepare(`SELECT COUNT(*) as c FROM orders WHERE date = ? AND site_id = ?`)
        .get(today, siteIdEnv) as { c: number }
      ).c
    : (
        db.prepare(`SELECT COUNT(*) as c FROM orders WHERE date = ?`).get(today) as { c: number }
      ).c;

  const gap = siteToday - ourToday;
  if (gap < 50) {
    logger.info(
      { siteToday, ourToday, gap, siteId: siteIdEnv },
      'Backfill kerak emas — bugungi DB to\'liq',
    );
    return;
  }

  logger.info({ siteToday, ourToday, gap }, '⏪ STARTUP BACKFILL boshlanmoqda...');

  // Paginate qilib bugungi to'liq zakazlarni torta-versi
  const BATCH = 200;
  let offset = 0;
  let inserted = 0;
  let skipped = 0;
  const startedAt = Date.now();
  const haveStmt = db.prepare('SELECT 1 FROM orders WHERE order_id = ?');

  while (offset < siteToday + 500) {
    const resp = await getOrders(session.page, {
      offset, limit: BATCH, periodStart, periodEnd,
      officeIds: accessibleOfficeIds,
    });
    const items = resp.state?.items ?? [];
    if (items.length === 0) break;

    const newOnes = items.filter((it) => !haveStmt.get(it.orderId));
    if (newOnes.length > 0) {
      const details = await mapLimit(newOnes, concurrency, (it) =>
        getOrderDetails(session.page, it.orderId).catch(() => null),
      );
      for (let i = 0; i < newOnes.length; i++) {
        const row = toDbOrder(newOnes[i]!, details[i] ?? null);
        const res = insertOrder(db, row);
        if (res === 'inserted') inserted++;
        else skipped++;

        // Fraud baholash — backfill paytida ham (finish va bekor zakazlar uchun)
        if (row.status === 'finish' || row.status === 'order_cancelled') {
          const result = scoreOrder(db, row);
          if (result.score >= FRAUD_THRESHOLDS.ALERT) {
            insertAlert(db, {
              order_id: row.order_id,
              callsign: row.callsign,
              driver_name: row.driver_name,
              fraud_type: result.primaryType,
              fraud_score: result.score,
              details: result.reasons.join(' | '),
            });
            markOrderFraud(db, row.order_id, result.score, result.reasons);

            // Telegram alert — faqat oxirgi 2 soat ichidagi zakazlar uchun
            // (eski backfillda spam bo'lib ketmasin)
            const orderTime = row.date && row.time
              ? new Date(`${row.date}T${row.time}+05:00`).getTime()
              : 0;
            const ageMs = Date.now() - orderTime;
            if (orderTime > 0 && ageMs < 2 * 60 * 60 * 1000) {
              const aggRow = db
                .prepare(
                  `SELECT COUNT(*) as cnt, COALESCE(SUM(fraud_score), 0) as total
                   FROM fraud_alerts WHERE callsign = ?
                   AND date(created_at) >= date('now', '+5 hours', '-7 days')`,
                )
                .get(row.callsign) as { cnt: number; total: number };
              const shouldBlock =
                result.score >= FRAUD_THRESHOLDS.AUTO_BLOCK ||
                aggRow.total >= FRAUD_THRESHOLDS.WEEKLY_TOTAL_BLOCK ||
                aggRow.cnt >= FRAUD_THRESHOLDS.WEEKLY_COUNT_BLOCK;
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
                date: row.date,
                time: row.time,
              });
            }
          }
        }
      }
    }

    offset += items.length;
    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = inserted / Math.max(1, elapsed);
    logger.info(
      { offset, inserted, skipped, ratePerSec: Math.round(rate * 10) / 10 },
      'Backfill batch',
    );

    if (items.length < BATCH) break;
  }

  const totalSec = Math.round((Date.now() - startedAt) / 1000);
  logger.info({ inserted, skipped, totalSec }, '✅ STARTUP BACKFILL tugadi');
}

function buildStatsHandler(db: Database.Database, s: MonitorStats): () => Promise<string> {
  return async () => {
    const today = new Date(Date.now() + 5*3600*1000).toISOString().slice(0, 10);
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
         WHERE date(created_at) = date('now', '+5 hours', 'localtime')
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
  applyActiveCredentialFromDb(db);
  const stats: MonitorStats = {
    startedAt: Date.now(),
    ticks: 0,
    ordersProcessed: 0,
    lastError: undefined,
    lastNewFinishAt: Date.now(),
    consecutiveEmptyTicks: 0,
    consecutiveSiteErrors: 0,
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

  // Davriy hisobot — har 60 daqiqada "oxirgi 1 soat" xulosasi
  let lastReportAt = Date.now();
  setInterval(
    () => {
      const now = Date.now();
      const sinceMin = Math.round((now - lastReportAt) / 60000);
      lastReportAt = now;
      const fromIso = new Date(now - sinceMin * 60 * 1000).toISOString();
      const newOrders = (
        db.prepare(`SELECT COUNT(*) as c FROM orders WHERE datetime(scraped_at) >= ?`).get(fromIso) as { c: number }
      ).c;
      const alerts = (
        db.prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE datetime(created_at) >= ?`).get(fromIso) as { c: number }
      ).c;
      const blocks = (
        db.prepare(`SELECT COUNT(*) as c FROM driver_blocks WHERE datetime(blocked_at) >= ?`).get(fromIso) as { c: number }
      ).c;
      const topRow = db.prepare(
        `SELECT callsign, driver_name, COUNT(*) as c FROM orders
         WHERE datetime(scraped_at) >= ? AND callsign != ''
         GROUP BY callsign ORDER BY c DESC LIMIT 1`,
      ).get(fromIso) as { callsign: string; driver_name: string; c: number } | undefined;
      void sendPeriodicReport({
        windowLabel: `Oxirgi ${sinceMin} daqiqa`,
        newOrders,
        alerts,
        blocks,
        topDriver: topRow ? `${topRow.driver_name} (${topRow.callsign}) — ${topRow.c} zakaz` : undefined,
      });
    },
    60 * 60 * 1000, // har 60 daqiqa
  );

  // Kunlik hisobot — har kuni 23:59'da (Asia/Tashkent vaqti)
  // Server timezone UZ ga sozlangan (timedatectl Asia/Tashkent)
  let lastDailyReportDate = '';
  setInterval(
    () => {
      const now = new Date();
      const today = new Date(now.getTime() + 5*3600*1000).toISOString().slice(0, 10);
      // 23:59 (server lokal vaqti) — minute = 59, hour = 23
      const isWindow = now.getHours() === 23 && now.getMinutes() >= 59;
      if (!isWindow || lastDailyReportDate === today) return;
      lastDailyReportDate = today;

      try {
        const todayOrders = db
          .prepare(
            `SELECT
               COUNT(*) as orders,
               SUM(CASE WHEN status='finish' THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN status='order_cancelled' THEN 1 ELSE 0 END) as cancelled,
               COALESCE(SUM(amount), 0) as totalAmount,
               COUNT(DISTINCT callsign) as activeDrivers
             FROM orders WHERE date = ?`,
          )
          .get(today) as { orders: number; completed: number; cancelled: number; totalAmount: number; activeDrivers: number };

        const newClients = (
          db.prepare(
            `WITH first_order AS (
               SELECT client_phone, MIN(date) as first FROM orders WHERE client_phone != '' GROUP BY client_phone
             ) SELECT COUNT(*) as c FROM first_order WHERE first = ?`,
          ).get(today) as { c: number }
        ).c;

        const alertsCount = (
          db.prepare(`SELECT COUNT(*) as c FROM fraud_alerts WHERE date(created_at) = ?`).get(today) as { c: number }
        ).c;
        const blocksCount = (
          db.prepare(`SELECT COUNT(*) as c FROM driver_blocks WHERE date(blocked_at) = ?`).get(today) as { c: number }
        ).c;

        const topDriverRow = db
          .prepare(
            `SELECT callsign, driver_name as name, COUNT(*) as orders, COALESCE(SUM(amount), 0) as amount
             FROM orders WHERE date = ? AND callsign != ''
             GROUP BY callsign ORDER BY amount DESC LIMIT 1`,
          )
          .get(today) as { callsign: string; name: string; orders: number; amount: number } | undefined;

        const topRegionRow = db
          .prepare(
            `SELECT region, COUNT(*) as orders FROM orders
             WHERE date = ? AND region != '' AND region IS NOT NULL
             GROUP BY region ORDER BY orders DESC LIMIT 1`,
          )
          .get(today) as { region: string; orders: number } | undefined;

        const topFraudRow = db
          .prepare(
            `SELECT callsign, driver_name as name, SUM(fraud_score) as score
             FROM fraud_alerts WHERE date(created_at) = ?
             GROUP BY callsign ORDER BY score DESC LIMIT 1`,
          )
          .get(today) as { callsign: string; name: string; score: number } | undefined;

        // Bashorat: ertaga uchun
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowWeekday = tomorrow.getDay();
        const weekdayNames = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

        const sameWk = db
          .prepare(
            `SELECT COUNT(*) as orders, COUNT(DISTINCT callsign) as drivers
             FROM orders WHERE date >= date('now', '+5 hours', '-28 days') AND date < date('now', '+5 hours')
               AND CAST(strftime('%w', date) AS INTEGER) = ?`,
          )
          .get(tomorrowWeekday) as { orders: number; drivers: number };
        const last7 = db
          .prepare(
            `SELECT AVG(daily_count) as avg FROM (
               SELECT COUNT(*) as daily_count FROM orders
               WHERE date >= date('now', '+5 hours', '-7 days') AND date < date('now', '+5 hours')
               GROUP BY date
             )`,
          )
          .get() as { avg: number | null };
        const sameWkDays = db
          .prepare(
            `SELECT COUNT(DISTINCT date) as days FROM orders
             WHERE date >= date('now', '+5 hours', '-28 days') AND date < date('now', '+5 hours')
               AND CAST(strftime('%w', date) AS INTEGER) = ?`,
          )
          .get(tomorrowWeekday) as { days: number };
        const avgSameWk = sameWkDays.days > 0 ? Math.round(sameWk.orders / sameWkDays.days) : 0;
        const avgDriversSameWk = sameWkDays.days > 0 ? Math.round(sameWk.drivers / sameWkDays.days) : 0;
        const avgLast7 = Math.round(last7.avg ?? 0);
        const predictedOrders = Math.round(avgSameWk * 0.6 + avgLast7 * 0.4);

        void sendDailyReport({
          date: today,
          orders: todayOrders.orders,
          completed: todayOrders.completed,
          cancelled: todayOrders.cancelled,
          totalAmount: todayOrders.totalAmount,
          activeDrivers: todayOrders.activeDrivers,
          newClients,
          alerts: alertsCount,
          blocks: blocksCount,
          topDriver: topDriverRow,
          topRegion: topRegionRow,
          topFraud: topFraudRow,
          forecast: {
            tomorrowOrders: predictedOrders,
            tomorrowDrivers: avgDriversSameWk,
            weekday: weekdayNames[tomorrowWeekday] ?? '',
          },
        });
      } catch (err) {
        logger.error({ err: (err as Error).message }, 'Kunlik hisobot xato');
      }
    },
    60 * 1000, // har daqiqa tekshiriladi, 23:59 oynasi bo'lsa yuboriladi
  );

  // Подразделение UI tekshiruvi — har 1 soatda barcha hududlar belgilanganini
  // tekshiradi, agar login'ga yangi hudud qo'shilgan bo'lsa, avtomatik belgilaydi.
  setInterval(
    () => {
      void (async (): Promise<void> => {
        try {
          const s = await new Promise<BrowserSession | null>((resolve) => {
            // Hozirgi aktiv session'ni olish — module-level _activeSession
            resolve(_getActiveSession());
          });
          if (s) await ensureAllSubdivisionsChecked(s);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'Hourly Подразделение UI tekshirish xato');
        }
      })();
    },
    60 * 60 * 1000, // har 1 soat
  );

  // "Yangi zakaz yo'q" alarm — har 5 daqiqada tekshiradi
  let noOrdersAlertSent = false;
  let lastNoOrderAt = 0;
  setInterval(
    () => {
      const minSince = Math.round((Date.now() - stats.lastNewFinishAt) / 60000);
      if (minSince >= 15 && !noOrdersAlertSent) {
        void sendNoOrdersAlert(minSince);
        noOrdersAlertSent = true;
        lastNoOrderAt = Date.now();
      } else if (minSince < 5 && noOrdersAlertSent) {
        // Sayt qaytdi
        const downMin = Math.round((Date.now() - lastNoOrderAt) / 60000);
        void sendSiteRestored(downMin);
        noOrdersAlertSent = false;
      }
    },
    5 * 60 * 1000,
  );

  // Heartbeat — har N daqiqada
  setInterval(
    () => {
      const today = new Date(Date.now() + 5*3600*1000).toISOString().slice(0, 10);
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
      _setActiveSession(session);
      logger.info('Sahifa tayyor — monitoring siklini boshlaymiz');
      bootRetry = 0;

      // Подразделение ro'yxati — login'ga ruxsat etilgan barcha shaharlar
      // Bu qilingan bo'lsa, getOrders har bir tickda explicit officeIds
      // bilan chaqiriladi, Poytug' va boshqa tumanlar tushib qolmaydi.
      await refreshAccessibleOffices(session);

      // UI'da Подразделение filtrini barcha hududlarga belgilab qo'yamiz
      // Bu sayt'ning saqlangan filteri Poytug' kabi tumanlarni tashlab ketmasligi uchun.
      // Birinchi marta sessiya ochilganda va keyin har 1 soatda takror tekshiramiz.
      await ensureAllSubdivisionsChecked(session);

      // Startup backfill — bugun 00:00 dan tortib olmagan zakazlarni to'ldiramiz
      // Faqat birinchi sessiyada (qayta-tiklashda emas)
      if (stats.ticks === 0) {
        try {
          await startupBackfill(session, db, concurrency);
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'Backfill xato — keyin davom etamiz');
        }
      }

      let consecutiveErrors = 0;
      while (true) {
        const tickStart = Date.now();
        try {
          await tick(session, db, lookback, concurrency, stats);
          consecutiveErrors = 0;
          stats.lastError = undefined;
          stats.consecutiveSiteErrors = 0;
        } catch (err) {
          consecutiveErrors++;
          stats.consecutiveSiteErrors++;
          stats.lastError = (err as Error).message;
          logger.error(
            { err: stats.lastError, consecutiveErrors, siteErrors: stats.consecutiveSiteErrors },
            'Tick xato',
          );
          // Sayt 10 marta ketma-ket xato bersa, 1 daqiqa kutib qayta urinamiz
          if (stats.consecutiveSiteErrors >= 10) {
            logger.warn('10 ta sayt xato — 60 sek kutamiz (sayt buzilgan bo\'lishi mumkin)');
            await new Promise((r) => setTimeout(r, 60_000));
            stats.consecutiveSiteErrors = 0;
          }
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

// Active session reference (graceful shutdown uchun)
let _activeSession: BrowserSession | null = null;
export function _setActiveSession(s: BrowserSession | null): void { _activeSession = s; }
function _getActiveSession(): BrowserSession | null { return _activeSession; }

async function gracefulExit(signal: string): Promise<void> {
  logger.info({ signal }, 'Monitor yopilmoqda');
  if (_activeSession) {
    try {
      await Promise.race([
        closeBrowserSession(_activeSession),
        new Promise<void>((r) => setTimeout(r, 3000)),
      ]);
    } catch { /* ignore */ }
  }
  process.exit(0);
}
process.on('SIGINT', () => { void gracefulExit('SIGINT'); });
process.on('SIGTERM', () => { void gracefulExit('SIGTERM'); });
process.on('unhandledRejection', (r) => {
  logger.fatal({ r }, 'Unhandled rejection');
});

void main();
