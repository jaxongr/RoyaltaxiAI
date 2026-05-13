/**
 * Sayt WebSocket / SSE / long-poll ishlatadimi tekshiradi.
 * Barcha network ulanishlarni 60 sek davomida log qiladi.
 */
import { config } from './common/config.js';
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { URLS } from './scraper/selectors.js';

async function main(): Promise<void> {
  const session = await createBrowserSession();
  const { page } = session;

  // WebSocket hodisalarini quloq solamiz
  page.on('websocket', (ws) => {
    console.log(`\n🔌 WS URL: ${ws.url()}`);
    ws.on('framesent', (f) => {
      const p = typeof f.payload === 'string' ? f.payload : f.payload?.toString('utf8') ?? '';
      if (p.length < 300) console.log(`  → ${p}`);
      else console.log(`  → [${p.length} bayt] ${p.slice(0, 200)}...`);
    });
    ws.on('framereceived', (f) => {
      const p = typeof f.payload === 'string' ? f.payload : f.payload?.toString('utf8') ?? '';
      if (p.length < 300) console.log(`  ← ${p}`);
      else console.log(`  ← [${p.length} bayt] ${p.slice(0, 200)}...`);
    });
    ws.on('close', () => console.log(`  WS CLOSED: ${ws.url()}`));
    ws.on('socketerror', (e) => console.log(`  WS ERROR: ${e}`));
  });

  // SSE / long-poll ham bo'lishi mumkin — barcha javoblarni qaymoq
  const interesting = new Set<string>();
  page.on('response', (resp) => {
    const u = resp.url();
    const ct = resp.headers()['content-type'] ?? '';
    if (ct.includes('event-stream') || u.includes('socket') || u.includes('ws') || u.includes('sse')) {
      if (!interesting.has(u)) {
        console.log(`\n📡 ${ct} ${u}`);
        interesting.add(u);
      }
    }
  });

  await login(session);

  const archiveUrl = `${config.ROYALTAXI_BASE_URL}${URLS.archiveOrders}`;
  await page.goto(archiveUrl, { waitUntil: 'domcontentloaded' });
  await humanPause(2000, 3000);
  console.log('\n=== ARCHIVE OCHILDI — 60 sek kuzatamiz ===');

  // Boshqa sahifalarga ham boramiz — jonli dispatcher sahifasi bor bo'lishi mumkin
  await humanPause(20000, 20000);
  console.log('\n=== DASHBOARD / TASKLARga o\'tamiz ===');
  await page.goto(`${config.ROYALTAXI_BASE_URL}/management`, { waitUntil: 'domcontentloaded' });
  await humanPause(30000, 30000);

  console.log('\n=== TUGADI ===');
  await closeBrowserSession(session);
}

void main().catch((err) => {
  console.error('XATO:', err);
  process.exit(1);
});
