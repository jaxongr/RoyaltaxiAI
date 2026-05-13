/**
 * To'liq sayt o'rganish skripti — har bir burchakni ko'radi.
 *
 * Ishlash printsipi:
 *  1. Login
 *  2. Sidebar menyu elementlarini topadi (ro'yxat)
 *  3. Har birini sekin bosib, sahifa tuzilishini saqlaydi
 *  4. Barcha API chaqiruvlarini intercept qiladi (URL + payload)
 *  5. Screenshot oladi
 *  6. Hammasini explore-report.json va explore-screenshots/ ga yozadi
 *
 * Hech narsani o'zgartirmaydi — faqat o'qiydi.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Response } from 'playwright';
import { config } from './common/config.js';
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { logger } from './common/logger.js';

interface NetworkEvent {
  ts: number;
  method: string;
  url: string;
  status?: number;
  request_body?: string;
  response_sample?: string;
  content_type?: string;
}

interface PageSnapshot {
  url: string;
  title: string;
  links: Array<{ text: string; href: string }>;
  forms: Array<{
    action: string;
    method: string;
    fields: Array<{ name: string | null; type: string | null; placeholder: string | null; label: string | null }>;
  }>;
  buttons: Array<{ text: string; type: string | null }>;
  tables: Array<{ headers: string[]; rowCount: number; sampleRow: string[] }>;
  sidebarItems: Array<{ text: string; href: string | null }>;
  visibleText: string;
}

interface SectionReport {
  name: string;
  url: string;
  ok: boolean;
  error?: string;
  snapshot?: PageSnapshot;
  apiCalls: NetworkEvent[];
  screenshot?: string;
}

const OUT_DIR = resolve(process.cwd(), 'explore-output');
const SHOTS_DIR = resolve(OUT_DIR, 'screenshots');

async function captureSnapshot(page: Page): Promise<PageSnapshot> {
  return await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map((a) => ({
      text: (a.textContent ?? '').trim().slice(0, 80),
      href: a.getAttribute('href') ?? '',
    }));
    const forms = Array.from(document.querySelectorAll('form')).map((f) => {
      const fields = Array.from(f.querySelectorAll('input, select, textarea')).map((el) => {
        const id = el.getAttribute('id');
        let label: string | null = null;
        if (id) {
          const lab = document.querySelector(`label[for="${id}"]`);
          label = lab?.textContent?.trim() ?? null;
        }
        return {
          name: el.getAttribute('name'),
          type: el.getAttribute('type') ?? el.tagName.toLowerCase(),
          placeholder: el.getAttribute('placeholder'),
          label,
        };
      });
      return { action: f.getAttribute('action') ?? '', method: f.getAttribute('method') ?? 'get', fields };
    });
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'))
      .slice(0, 30)
      .map((b) => ({ text: (b.textContent ?? '').trim().slice(0, 50), type: b.getAttribute('type') }));
    const tables = Array.from(document.querySelectorAll('table, .hv-table, [role="table"]')).slice(0, 5).map((t) => {
      const headerEls = t.querySelectorAll('thead th, .hv-table__header-cell, [role="columnheader"]');
      const headers = Array.from(headerEls).map((h) => (h.textContent ?? '').trim().slice(0, 30));
      const rowEls = t.querySelectorAll('tbody tr, .hv-table__body-row, [role="row"]');
      const sampleRow = rowEls[0]
        ? Array.from(rowEls[0].querySelectorAll('td, [role="cell"]')).map((c) => (c.textContent ?? '').trim().slice(0, 50))
        : [];
      return { headers, rowCount: rowEls.length, sampleRow };
    });
    const sidebarItems = Array.from(document.querySelectorAll('.sidebar a, nav a, [class*="menu"] a, [class*="nav"] a'))
      .slice(0, 50)
      .map((a) => ({
        text: (a.textContent ?? '').trim().slice(0, 60),
        href: a.getAttribute('href'),
      }));
    return {
      url: window.location.href,
      title: document.title,
      links,
      forms,
      buttons,
      tables,
      sidebarItems,
      visibleText: (document.body?.innerText ?? '').slice(0, 2500),
    };
  });
}

async function exploreUrl(page: Page, name: string, url: string): Promise<SectionReport> {
  const apiCalls: NetworkEvent[] = [];
  const onResponse = async (resp: Response): Promise<void> => {
    const u = resp.url();
    if (!u.includes('/management/') && !u.includes('/api/')) return;
    if (u.endsWith('.js') || u.endsWith('.css') || u.endsWith('.png') || u.endsWith('.svg')) return;
    try {
      const req = resp.request();
      const body = req.postData() ?? undefined;
      const ct = resp.headers()['content-type'] ?? '';
      let sample = '';
      if (ct.includes('json')) {
        const text = await resp.text().catch(() => '');
        sample = text.slice(0, 600);
      }
      apiCalls.push({
        ts: Date.now(),
        method: req.method(),
        url: u,
        status: resp.status(),
        request_body: body?.slice(0, 600),
        response_sample: sample,
        content_type: ct,
      });
    } catch {
      /* ignore */
    }
  };
  page.on('response', onResponse);

  try {
    logger.info({ name, url }, 'Sahifani ochmoqdamiz');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanPause(2500, 3500);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await humanPause(1500, 2500);
    const snapshot = await captureSnapshot(page);
    const shotPath = resolve(SHOTS_DIR, `${name.replace(/[^a-z0-9]/gi, '_')}.png`);
    await page.screenshot({ path: shotPath, fullPage: true }).catch(() => undefined);
    page.off('response', onResponse);
    return { name, url, ok: true, snapshot, apiCalls, screenshot: shotPath };
  } catch (err) {
    page.off('response', onResponse);
    return { name, url, ok: false, error: (err as Error).message, apiCalls };
  }
}

const BASE = config.ROYALTAXI_BASE_URL;

// To'liq tekshiriladigan sahifalar — ozimiz topgan + odatda hive taksi tizimlarida bo'lgan bo'limlar
const TARGETS = [
  { name: 'home', url: `${BASE}/management/` },
  { name: 'archive', url: `${BASE}/management/archive` },
  { name: 'drivers', url: `${BASE}/management/drivers` },
  { name: 'drivers_create', url: `${BASE}/management/drivers/create` },
  { name: 'drivers_list', url: `${BASE}/management/drivers/list` },
  { name: 'vehicles', url: `${BASE}/management/vehicles` },
  { name: 'vehicles_list', url: `${BASE}/management/vehicles/list` },
  { name: 'orders_active', url: `${BASE}/management/orders` },
  { name: 'services', url: `${BASE}/management/services` },
  { name: 'tariffs', url: `${BASE}/management/tariffs` },
  { name: 'offices', url: `${BASE}/management/offices` },
  { name: 'subdivisions', url: `${BASE}/management/subdivisions` },
  { name: 'clients', url: `${BASE}/management/clients` },
  { name: 'employees', url: `${BASE}/management/employees` },
  { name: 'users', url: `${BASE}/management/users` },
  { name: 'reports', url: `${BASE}/management/reports` },
  { name: 'statistics', url: `${BASE}/management/statistics` },
  { name: 'finance', url: `${BASE}/management/finance` },
  { name: 'settings', url: `${BASE}/management/settings` },
  { name: 'transactions', url: `${BASE}/management/transactions` },
  { name: 'roles', url: `${BASE}/management/roles` },
];

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(SHOTS_DIR)) mkdirSync(SHOTS_DIR, { recursive: true });

  const session = await createBrowserSession();
  try {
    await login(session);
    logger.info('Loginga kirildi — explorationga boshlanadi');

    // Avval bosh sahifaga o'tib, sidebar elementlari to'liq topiladi
    await session.page.goto(`${BASE}/management/`, { waitUntil: 'domcontentloaded' });
    await humanPause(3000, 4000);
    const sidebar = await session.page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('a, [class*="menu"], [class*="sidebar"] li'))
        .map((el) => ({
          text: (el.textContent ?? '').trim().slice(0, 60),
          href: el.getAttribute('href'),
        }))
        .filter((x) => x.text && x.text.length < 60);
      return candidates;
    });
    writeFileSync(resolve(OUT_DIR, '_sidebar.json'), JSON.stringify(sidebar, null, 2), 'utf-8');
    logger.info({ count: sidebar.length }, 'Sidebar elementlari saqlandi');

    const reports: SectionReport[] = [];
    for (const t of TARGETS) {
      const r = await exploreUrl(session.page, t.name, t.url);
      reports.push(r);
      logger.info(
        { name: t.name, ok: r.ok, apis: r.apiCalls.length, forms: r.snapshot?.forms.length ?? 0 },
        'Sahifa tugadi',
      );
    }

    // Birlashtirilgan hisobot
    writeFileSync(resolve(OUT_DIR, 'report.json'), JSON.stringify(reports, null, 2), 'utf-8');

    // Topilgan API endpointlar — alohida fayl
    const allApis = new Map<string, { count: number; methods: Set<string>; sampleBody?: string }>();
    for (const r of reports) {
      for (const a of r.apiCalls) {
        // domaindan keyingi qism, query stringsiz
        const pathOnly = a.url.replace(BASE, '').split('?')[0]!;
        const cur = allApis.get(pathOnly) ?? { count: 0, methods: new Set<string>() };
        cur.count++;
        cur.methods.add(a.method);
        if (a.request_body && !cur.sampleBody) cur.sampleBody = a.request_body;
        allApis.set(pathOnly, cur);
      }
    }
    const apiSummary = Array.from(allApis.entries())
      .map(([path, info]) => ({
        path,
        methods: Array.from(info.methods),
        count: info.count,
        sampleBody: info.sampleBody ?? null,
      }))
      .sort((a, b) => b.count - a.count);
    writeFileSync(resolve(OUT_DIR, 'apis.json'), JSON.stringify(apiSummary, null, 2), 'utf-8');

    // Markdown hisobot
    const md: string[] = [];
    md.push('# Saytni o\'rganish hisoboti');
    md.push('');
    md.push(`Boshqaruv URL: ${BASE}/management`);
    md.push(`Vaqt: ${new Date().toLocaleString('ru-RU')}`);
    md.push('');
    md.push('## Topilgan sahifalar');
    md.push('');
    md.push('| Nom | URL | OK | Formlar | API'+'lar |');
    md.push('|---|---|---|---|---|');
    for (const r of reports) {
      const u = new URL(r.url).pathname;
      md.push(`| ${r.name} | \`${u}\` | ${r.ok ? '✅' : '❌ '+r.error?.slice(0,60)} | ${r.snapshot?.forms.length ?? 0} | ${r.apiCalls.length} |`);
    }
    md.push('');
    md.push('## Topilgan API endpointlar');
    md.push('');
    md.push('| Path | Methods | Count |');
    md.push('|---|---|---|');
    for (const a of apiSummary.slice(0, 60)) {
      md.push(`| \`${a.path}\` | ${a.methods.join(', ')} | ${a.count} |`);
    }
    writeFileSync(resolve(OUT_DIR, 'REPORT.md'), md.join('\n'), 'utf-8');

    logger.info({ outDir: OUT_DIR }, 'EXPLORATION TUGADI');
  } finally {
    await closeBrowserSession(session);
  }
}

void main().catch((err) => {
  logger.error({ err: (err as Error).message, stack: (err as Error).stack }, 'Exploration xato');
  process.exit(1);
});
