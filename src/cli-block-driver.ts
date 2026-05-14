/**
 * Bitta marta haydovchini sayt orqali bloklash (CLI).
 * Foydalanish: npm exec tsx src/cli-block-driver.ts <driver_id> <office_id> <kind> "<comment>" [duration_days]
 * Default kind: moderation
 */
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { lockDriver } from './scraper/drivers.js';
import { config } from './common/config.js';
import { logger } from './common/logger.js';

const driverId = process.argv[2];
const officeId = process.argv[3];
const kind = process.argv[4] ?? 'moderation';
const comment = process.argv[5] ?? 'Royaltaxi AI: avtomatik aniqlangan firibgarlik';
const durationDaysStr = process.argv[6];

if (!driverId || !officeId) {
  console.error(JSON.stringify({ ok: false, error: 'driver_id va office_id kerak' }));
  process.exit(1);
}

let due: string | null = null;
if (durationDaysStr) {
  const days = parseInt(durationDaysStr, 10);
  if (days > 0) {
    due = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19);
  }
}

const session = await createBrowserSession();
try {
  await login(session);
  // Sahifani ochish (CSRF + cookies)
  await session.page.goto(config.ROYALTAXI_BASE_URL + '/management/archive', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await humanPause(2000, 3000);
  await session.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', {
    timeout: 20_000,
  });

  logger.info({ driverId, officeId, kind, comment, due }, 'Sayt blok so\'rovi yuborilmoqda');

  const result = await lockDriver(session.page, {
    driverId,
    officeId,
    kind,
    comment,
    due,
  });

  console.log(JSON.stringify({ ok: true, result }));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: (err as Error).message }));
  process.exitCode = 1;
} finally {
  await closeBrowserSession(session);
}
