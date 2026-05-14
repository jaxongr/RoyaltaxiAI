/**
 * Block API'ni chuqur tekshirish. Saytdagi lock-driver tugmasi qanday ishlashini
 * aniqlash uchun network'ni to'liq tahlil qiladi.
 */
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { getDrivers, getFleets } from './scraper/drivers.js';
import { apiPost } from './scraper/api.js';
import { config } from './common/config.js';
import { logger } from './common/logger.js';

const callsign = process.argv[2] ?? 'QSH3589';
const session = await createBrowserSession();

try {
  await login(session);
  await session.page.goto(config.ROYALTAXI_BASE_URL + '/management/archive', {
    waitUntil: 'domcontentloaded',
  });
  await humanPause(2000, 3000);
  await session.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', { timeout: 20_000 });

  // 1. get-drivers TO'LIQ javob — barcha maydonlar
  logger.info('=== get-drivers ===');
  const r1 = await getDrivers(session.page, { query: callsign, limit: 5, includingDocuments: true } as never);
  console.log('GET-DRIVERS RESPONSE (full):');
  console.log(JSON.stringify(r1.state?.items ?? [], null, 2).slice(0, 3000));

  if (!r1.state?.items?.length) {
    console.log('No driver found');
    process.exit(1);
  }

  const driver = r1.state.items[0]!;
  console.log('\nDriver keys:', Object.keys(driver));

  // 2. Fleets ro'yxati
  const fleets = await getFleets(session.page);
  const fleetName = driver.groupNames?.fleetName ?? '';
  const fleetMatch = fleets.fleets.find((f) => f.name === fleetName);
  const fleetId = fleetMatch?.fleetId ?? 0;
  console.log('\nFleet:', fleetName, '-> fleetId:', fleetId);

  // 3. get-driver-details — bir nechta variant sinab ko'ramiz
  const officeId = 239000000000004;
  for (const driverIdAttempt of [driver.id, String(driver.id)]) {
    try {
      logger.info({ driverIdAttempt }, 'get-driver-details');
      const det = await apiPost<Record<string, unknown>>(session.page, '/management/fleet/drivers/get-driver-details', {
        driverId: driverIdAttempt,
        fleetId,
        officeId,
      });
      console.log(`\nget-driver-details with ${driverIdAttempt}:`);
      console.log(JSON.stringify(det, null, 2).slice(0, 2000));
    } catch (err) {
      console.log(`Xato: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  // 4. Driver lookup boshqa endpointlari
  for (const endpoint of [
    '/management/fleet/drivers/get-driver',
    '/management/fleet/drivers/find-driver',
    '/management/fleet/drivers/by-callsign',
  ]) {
    try {
      const r = await apiPost<Record<string, unknown>>(session.page, endpoint, { callsign });
      console.log(`\n${endpoint}: ${JSON.stringify(r).slice(0, 300)}`);
    } catch (err) {
      console.log(`${endpoint}: ${(err as Error).message.slice(0, 100)}`);
    }
  }

  await closeBrowserSession(session);
} catch (err) {
  console.error('Xato:', (err as Error).message);
  await closeBrowserSession(session);
}
