/**
 * Bitta marta haydovchini sayt orqali bloklash (CLI).
 * Foydalanish: npm exec tsx src/cli-block-driver.ts <callsign> <kind> "<comment>" [duration_days]
 * Default kind: moderation
 *
 * Haydovchini callsign orqali sayt'da qidiradi, keyin lock-driver chaqiradi.
 */
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { lockDriver, getDrivers, getDriverDetails, getFleets } from './scraper/drivers.js';
import { config } from './common/config.js';
import { logger } from './common/logger.js';

const callsign = process.argv[2];
const kind = process.argv[3] ?? 'moderation';
const comment = process.argv[4] ?? 'Royaltaxi AI: aniqlangan firibgarlik';
const durationDaysStr = process.argv[5];

if (!callsign) {
  console.log(JSON.stringify({ ok: false, error: 'callsign kerak' }));
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
  await session.page.goto(config.ROYALTAXI_BASE_URL + '/management/archive', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await humanPause(2000, 3000);
  await session.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', {
    timeout: 20_000,
  });

  // 1) Saytdan callsign bo'yicha haydovchini topish
  logger.info({ callsign }, 'Haydovchini saytdan qidirmoqda');
  const found = await getDrivers(session.page, { query: callsign, limit: 5 });
  const items = found.state?.items ?? [];
  if (items.length === 0) {
    console.log(JSON.stringify({ ok: false, error: `Haydovchi topilmadi: ${callsign}` }));
    process.exit(1);
  }
  const driver = items[0]!;
  const driverUuid = driver.id;

  // 2) Fleet va office'ni topish
  let officeId = 239000000000004; // Qashqadaryo Royal default
  let fleetId = 0;
  const fleetName = driver.groupNames?.fleetName ?? '';
  const fleetsResp = await getFleets(session.page);
  const match = fleetsResp.fleets.find((f) => f.name === fleetName);
  if (match) fleetId = match.fleetId;
  logger.info({ fleetName, fleetId, officeId, driverUuid }, 'Fleet topildi');

  if (!fleetId) {
    console.log(JSON.stringify({ ok: false, error: `Fleet topilmadi: ${fleetName}` }));
    process.exit(1);
  }

  // 3) Get details — bu yerdan haqiqiy driverId (15-digit numerical) keladi
  const details = await getDriverDetails(session.page, driverUuid, fleetId, officeId);
  const driverId = details.driverId ?? driverUuid;
  logger.info({ details, driverId }, 'Details olindi');

  logger.info({ driverId, officeId, kind, comment, due }, 'Bloklash so\'rovi yuborilmoqda');

  const result = await lockDriver(session.page, {
    driverId,
    officeId,
    kind,
    comment,
    due,
  });

  // Sayt javobini tekshirish — status:false bo'lsa xato
  const r = result as { status?: boolean; code?: number; message?: string };
  const apiOk = r.status !== false;
  if (!apiOk) {
    console.log(JSON.stringify({
      ok: false,
      error: `Sayt rad qildi: ${r.message ?? 'noma\'lum xato'} (code ${r.code ?? '?'})`,
      driverId,
      officeId,
      siteResponse: result,
    }));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, driverId, officeId, result }));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: (err as Error).message }));
  process.exitCode = 1;
} finally {
  await closeBrowserSession(session);
}
