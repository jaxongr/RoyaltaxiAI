import type { Page } from 'playwright';
import { config } from '../common/config.js';
import { childLogger } from '../common/logger.js';
import { humanPause } from './browser.js';
import { SELECTORS, URLS } from './selectors.js';

const log = childLogger('orders');

export interface Order {
  rowIndex: number;
  date: string;
  time: string;
  region: string;
  address: string;
  driverName: string;
  car: string;
  pozivnoy: string;
  statusIcon: string;
  paymentIcon: string;
  rawText: string;
}

function splitRoute(route: string): { region: string; address: string } {
  const idx = route.indexOf(',');
  if (idx === -1) return { region: '', address: route.trim() };
  return {
    region: route.slice(0, idx).trim(),
    address: route.slice(idx + 1).trim(),
  };
}

function splitDriver(raw: string): { driverName: string; car: string } {
  const compact = raw.replace(/\s+/g, ' ').trim();
  // Avtomobil nomi odatda lotin kapital so'z (Daewoo, Chevrolet, Ravon...) bilan boshlanadi
  const carRe = /\b(Daewoo|Chevrolet|Ravon|Hyundai|Kia|Toyota|Nissan|BYD|Lada|Captiva|Matiz|Nexia|Cobalt|Lacetti|Spark|Damas)\b.*$/;
  const m = compact.match(carRe);
  if (m && m.index !== undefined) {
    return {
      driverName: compact.slice(0, m.index).trim(),
      car: compact.slice(m.index).trim(),
    };
  }
  return { driverName: compact, car: '' };
}

export async function fetchArchiveOrders(page: Page, limit = 10): Promise<Order[]> {
  const archiveUrl = `${config.ROYALTAXI_BASE_URL}${URLS.archiveOrders}`;
  log.info({ archiveUrl, limit }, 'Archive zakazov sahifasi ochilmoqda');

  await page.goto(archiveUrl, { waitUntil: 'domcontentloaded' });
  await humanPause(1500, 3000);

  // Loader yo'qolishini kutish (bor bo'lsa)
  await page
    .waitForSelector(SELECTORS.archiveOrders.loader, {
      state: 'detached',
      timeout: 10_000,
    })
    .catch(() => {
      log.debug('Loader selektori topilmadi yoki allaqachon yo\'q');
    });

  await page.waitForSelector(SELECTORS.archiveOrders.row, { timeout: 15_000 });

  const rows = page.locator(SELECTORS.archiveOrders.row);
  const total = await rows.count();
  const take = Math.min(limit, total);

  log.info({ totalRows: total, taking: take }, 'Buyurtmalar qatorlari topildi');

  const cols = SELECTORS.archiveOrders.col;
  const orders: Order[] = [];

  for (let i = 0; i < take; i++) {
    const row = rows.nth(i);
    const rawText = ((await row.textContent()) ?? '').replace(/\s+/g, ' ').trim();

    const readText = async (selector: string): Promise<string> => {
      const el = row.locator(selector).first();
      if (await el.count()) {
        return ((await el.textContent()) ?? '').replace(/\s+/g, ' ').trim();
      }
      return '';
    };

    const readHref = async (selector: string): Promise<string> => {
      const el = row.locator(selector).first();
      if (await el.count()) {
        const href = (await el.getAttribute('xlink:href')) ?? (await el.getAttribute('href')) ?? '';
        return href.replace(/^#/, '');
      }
      return '';
    };

    const { region, address } = splitRoute(await readText(cols.address));
    const { driverName, car } = splitDriver(await readText(cols.driver));

    const order: Order = {
      rowIndex: i + 1,
      time: await readText(cols.time),
      date: await readText(cols.date),
      region,
      address,
      driverName,
      car,
      pozivnoy: await readText(cols.callsign),
      statusIcon: await readHref(cols.statusIcon),
      paymentIcon: await readHref(cols.paymentIcon),
      rawText,
    };

    orders.push(order);
  }

  log.info({ count: orders.length }, 'Buyurtmalar o\'qildi');
  return orders;
}
