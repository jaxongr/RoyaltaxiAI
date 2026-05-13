import { config } from './common/config.js';
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { URLS } from './scraper/selectors.js';
import { apiPost } from './scraper/api.js';

const session = await createBrowserSession();
await login(session);
await session.page.goto(`${config.ROYALTAXI_BASE_URL}${URLS.archiveOrders}`, { waitUntil: 'domcontentloaded' });
await humanPause(2000, 3000);
await session.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', { timeout: 20_000 });

const today = new Date();
const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
const fmt = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${dd}T${hh}:${mm}`;
};

const resp = await apiPost<Record<string, unknown>>(session.page, '/management/archive/get-orders', {
  officeIds: null, serviceIds: null, tariffIds: null, sources: [], paymentMethods: [],
  periodStart: fmt(start), periodEnd: fmt(end), driver: '', deferred: [true, false],
  status: [], clientPhone: '', submissionAddress: '', destinationAddress: '',
  orderId: null, offset: 0, limit: 1, driverId: null, vehicleId: null,
  driverChangedRoute: [], incompletePoints: [], driverPaidForOrder: [true, false],
});

console.log('TOP KEYS:', Object.keys(resp));
console.log('STATE KEYS:', resp.state ? Object.keys(resp.state as object) : 'no state');
console.log('Full response shape (first 600 chars):');
console.log(JSON.stringify(resp, null, 2).slice(0, 1500));

await closeBrowserSession(session);
