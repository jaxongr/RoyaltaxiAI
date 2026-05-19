import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { lookup } from 'node:dns/promises';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { config } from '../common/config.js';
import { childLogger } from '../common/logger.js';

const log = childLogger('browser');

// Storage state path env orqali override qilinishi mumkin (multi-site monitor uchun)
export const STORAGE_STATE_PATH = process.env.STORAGE_STATE_PATH
  ? resolve(process.env.STORAGE_STATE_PATH)
  : resolve(process.cwd(), 'storage-state.json');

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function createBrowserSession(): Promise<BrowserSession> {
  // PROXY_URL .env dan keladi (masalan: socks5://127.0.0.1:1080)
  // Uz VPS chisel tunnel orqali sayt'ga UZ uy IP bilan ulanadi
  const proxyUrl = process.env.PROXY_URL ?? undefined;

  // Chromium SOCKS5 da DNS'ni proxy orqali so'raydi, chisel uni qo'llab-quvvatlamaydi.
  // Yechim: BASE_URL hostname'ni mahalliy hal qilamiz va chromium uchun MAP rule beramiz.
  // Shunda chromium hostname → IP'ni o'zi biladi va SOCKS5 orqali faqat TCP yuboradi.
  const hostRules: string[] = [];
  if (proxyUrl) {
    const hosts = [
      'hive-respublika-new.royaltaxi.uz',
      'hive-respublika.royaltaxi.uz',
      'hive-toshkent-viloyati.royaltaxi.uz',
      // BASE_URL'dan ham olamiz (kelajakdagi saytlar uchun)
      ...(() => {
        try {
          const u = new URL(config.ROYALTAXI_BASE_URL);
          return [u.hostname];
        } catch { return []; }
      })(),
    ];
    const seen = new Set<string>();
    for (const h of hosts) {
      if (seen.has(h)) continue;
      seen.add(h);
      try {
        const r = await lookup(h);
        hostRules.push(`MAP ${h} ${r.address}`);
        log.info({ host: h, ip: r.address }, '🔧 DNS pre-resolve (chisel proxy-DNS bypass)');
      } catch (e) {
        log.warn({ host: h, err: (e as Error).message }, 'DNS lookup xato');
      }
    }
  }

  log.info(
    { headless: config.BROWSER_HEADLESS, proxy: proxyUrl ?? 'yo\'q', hostRules: hostRules.length },
    'Chromium ishga tushirilmoqda',
  );

  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--proxy-bypass-list=<-loopback>',
  ];
  if (hostRules.length > 0) {
    args.push(`--host-resolver-rules=${hostRules.join(', ')}`);
  }

  const browser = await chromium.launch({
    headless: config.BROWSER_HEADLESS,
    args,
    ignoreDefaultArgs: ['--host-resolver-rules'],
    proxy: proxyUrl ? { server: proxyUrl } : undefined,
  });

  const hasStorageState = existsSync(STORAGE_STATE_PATH);
  if (hasStorageState) {
    log.info({ path: STORAGE_STATE_PATH }, 'Saqlangan session topildi, yuklanmoqda');
  } else {
    log.info('Session topilmadi, yangi login kerak');
  }

  const context = await browser.newContext({
    storageState: hasStorageState ? STORAGE_STATE_PATH : undefined,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.0,
    locale: 'ru-RU',
    timezoneId: 'Asia/Tashkent',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'ru-RU,ru;q=0.9,uz;q=0.8,en;q=0.7',
    },
  });

  // Sekin yurish — bot-like aniqlanmaslik uchun
  context.setDefaultNavigationTimeout(30_000);
  context.setDefaultTimeout(15_000);

  const page = await context.newPage();

  return { browser, context, page };
}

export async function saveSession(context: BrowserContext): Promise<void> {
  await context.storageState({ path: STORAGE_STATE_PATH });
  log.info({ path: STORAGE_STATE_PATH }, 'Session saqlandi');
}

export async function closeBrowserSession(session: BrowserSession): Promise<void> {
  try {
    await session.context.close();
  } catch (err) {
    log.warn({ err }, 'Context yopishda xato');
  }
  try {
    await session.browser.close();
  } catch (err) {
    log.warn({ err }, 'Browser yopishda xato');
  }
  log.info('Brauzer yopildi');
}

/** Insonsimon pauza — agressiv scraping'dan qochish */
export async function humanPause(min = 2000, max = 5000): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise((r) => setTimeout(r, ms));
}
