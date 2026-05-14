import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { apiPost } from './scraper/api.js';
import { config } from './common/config.js';

const orderId = parseInt(process.argv[2] ?? '0', 10);
const session = await createBrowserSession();
await login(session);
await session.page.goto(config.ROYALTAXI_BASE_URL + '/management/archive', { waitUntil: 'domcontentloaded' });
await humanPause(2000, 3000);
await session.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', { timeout: 20_000 });

const r = await apiPost<Record<string, unknown>>(session.page, '/management/archive/get-order-route', { orderId });
console.log('TOP KEYS:', Object.keys(r));
for (const [k, v] of Object.entries(r)) {
  if (Array.isArray(v)) {
    console.log(`\n${k}: array(${v.length})`);
    if (v.length > 0) {
      console.log('  Item0 keys:', Object.keys(v[0] as object));
      console.log('  Item0:', JSON.stringify(v[0]).slice(0, 500));
    }
    if (v.length > 1) {
      console.log('  ItemLast:', JSON.stringify(v[v.length - 1]).slice(0, 500));
    }
  } else if (typeof v === 'object' && v !== null) {
    console.log(`\n${k}: object`);
    console.log('  Keys:', Object.keys(v));
    console.log('  Sample:', JSON.stringify(v).slice(0, 500));
  } else {
    console.log(`${k}: ${typeof v}`, v);
  }
}

await closeBrowserSession(session);
