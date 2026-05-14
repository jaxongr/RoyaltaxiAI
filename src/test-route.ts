/**
 * Test: get-order-route endpoint — xarita trek va tezlik ma'lumotini olish.
 * Foydalanish: npm run dev -- ORDER_ID
 */
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { apiPost } from './scraper/api.js';
import { config } from './common/config.js';
import { logger } from './common/logger.js';

const orderId = process.argv[2] ? parseInt(process.argv[2], 10) : 0;
if (!orderId) {
  console.error('Foydalanish: npx tsx src/test-route.ts <orderId>');
  process.exit(1);
}

const session = await createBrowserSession();
await login(session);
await session.page.goto(config.ROYALTAXI_BASE_URL + '/management/archive', {
  waitUntil: 'domcontentloaded',
});
await humanPause(2000, 3000);
await session.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', {
  timeout: 20_000,
});

logger.info({ orderId }, 'get-order-route chaqiramiz');
const result = await apiPost(session.page, '/management/archive/get-order-route', {
  orderId,
});
console.log('=== ROUTE RESPONSE ===');
console.log(JSON.stringify(result, null, 2));

// Yana boshqa potential endpointlarni ham sinaymiz
for (const ep of ['get-order-history', 'get-order-checks', 'get-order-event-changes']) {
  try {
    const r = await apiPost(session.page, `/management/archive/${ep}`, { orderId });
    console.log(`\n=== ${ep} ===`);
    console.log(JSON.stringify(r, null, 2).slice(0, 1500));
  } catch (err) {
    console.log(`${ep}: XATO — ${(err as Error).message.slice(0, 100)}`);
  }
}

await closeBrowserSession(session);
