/**
 * Sayt'dagi xarita oynasidan tezlik va GPS trek ma'lumotini olish uchun
 * qaysi API endpoint chaqirilishini aniqlash.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Response } from 'playwright';
import { config } from './common/config.js';
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { URLS } from './scraper/selectors.js';
import { logger } from './common/logger.js';

const OUT_DIR = resolve(process.cwd(), 'explore-output');

interface NetEvent {
  ts: number;
  method: string;
  url: string;
  status?: number;
  request_body?: string;
  response_sample?: string;
}

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const session = await createBrowserSession();
  await login(session);

  const archiveUrl = `${config.ROYALTAXI_BASE_URL}${URLS.archiveOrders}`;
  await session.page.goto(archiveUrl, { waitUntil: 'domcontentloaded' });
  await humanPause(3000, 4000);
  await session.page.waitForSelector('.hv-table__body-row.hv-table__body-row--body', {
    timeout: 25_000,
  });

  // Tarmoqni tinglashni boshlaymiz
  const events: NetEvent[] = [];
  const collector = async (resp: Response): Promise<void> => {
    const u = resp.url();
    if (u.endsWith('.js') || u.endsWith('.css') || u.endsWith('.woff2') || u.endsWith('.png') || u.endsWith('.svg') || u.endsWith('.ico')) return;
    if (!u.includes('/management/')) return;
    try {
      const ct = resp.headers()['content-type'] ?? '';
      const req = resp.request();
      let body: string | undefined;
      let sample = '';
      if (req.postData()) body = req.postData()!.slice(0, 1000);
      if (ct.includes('json')) sample = (await resp.text().catch(() => '')).slice(0, 2000);
      events.push({
        ts: Date.now(),
        method: req.method(),
        url: u,
        status: resp.status(),
        request_body: body,
        response_sample: sample,
      });
      logger.info({ method: req.method(), url: u.replace(config.ROYALTAXI_BASE_URL, ''), status: resp.status() }, 'API');
    } catch { /* ignore */ }
  };
  session.page.on('response', collector);

  logger.info('Bitta zakazni bosamiz...');
  // Birinchi qatorni bosamiz
  await session.page.click('.hv-table__body-row.hv-table__body-row--body');
  await humanPause(2000, 3000);

  // Xarita tugmasini topamiz — odatda map/карта iconi
  logger.info('Xarita tugmasini qidiramiz...');
  const mapButtons = await session.page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, a, [class*="map"], [class*="карт"], svg use'));
    return all.map((el) => ({
      tag: el.tagName,
      text: el.textContent?.trim().slice(0, 50),
      cls: el.className?.toString().slice(0, 100),
      href: (el as HTMLAnchorElement).href ?? null,
      svgHref: el.getAttribute('xlink:href') ?? null,
    })).filter((x) => /map|карт/i.test(x.cls ?? '') || /map|карт/i.test(x.text ?? '') || /map/i.test(x.svgHref ?? ''));
  });
  logger.info({ count: mapButtons.length, sample: mapButtons.slice(0, 5) }, 'Topilgan map elementlari');

  // Xarita / GPS trek ko'rsatadigan tugma — odatda "show on map" yoki "trip"
  // Sahifani aylanib chiqamiz va har qanday "map" button ni bosamiz
  for (const sel of [
    'button[class*="map"]',
    '.hv-button[class*="trip"]',
    '[class*="show-on-map"]',
    'button:has-text("Карта")',
    'button:has-text("Маршрут")',
    'button:has-text("Трек")',
  ]) {
    const cnt = await session.page.locator(sel).count();
    if (cnt > 0) {
      logger.info({ sel, count: cnt }, 'Topildi — bosamiz');
      await session.page.locator(sel).first().click().catch(() => undefined);
      await humanPause(3000, 4000);
      break;
    }
  }

  // Yana 5 sekund kutamiz — agar tezroq API javob bermasa
  await humanPause(5000, 6000);

  // Saqlash
  writeFileSync(resolve(OUT_DIR, 'map-explore.json'), JSON.stringify(events, null, 2));
  logger.info({ events: events.length }, 'Tarmoq hodisalari saqlandi');

  // Xulosalar: birinchi marta ko'rilgan endpointlar
  const seen = new Set<string>();
  const newOnes: NetEvent[] = [];
  for (const e of events) {
    const p = e.url.replace(config.ROYALTAXI_BASE_URL, '').split('?')[0]!;
    if (!seen.has(p)) {
      seen.add(p);
      newOnes.push(e);
    }
  }
  console.log('\n=== UNIQ ENDPOINTS ===');
  for (const e of newOnes) {
    const p = e.url.replace(config.ROYALTAXI_BASE_URL, '').split('?')[0];
    console.log(`${e.method} ${p}`);
    if (e.request_body) console.log(`  REQ: ${e.request_body.slice(0, 200)}`);
    if (e.response_sample) console.log(`  RES: ${e.response_sample.slice(0, 200)}`);
  }

  await closeBrowserSession(session);
}

void main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'Xato');
  process.exit(1);
});
