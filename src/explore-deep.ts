/**
 * Chuqur o'rganish — to'g'ri URL'larga, SPA to'liq yuklanguncha kutib.
 * Faqat o'qiydi.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Response } from 'playwright';
import { config } from './common/config.js';
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { logger } from './common/logger.js';

const OUT_DIR = resolve(process.cwd(), 'explore-output');
const SHOTS_DIR = resolve(OUT_DIR, 'screenshots-deep');

interface NetEvent {
  ts: number;
  method: string;
  url: string;
  status?: number;
  request_body?: string;
  response_sample?: string;
}

const BASE = config.ROYALTAXI_BASE_URL;

const TARGETS = [
  { name: 'home', url: `${BASE}/management/` },
  { name: 'fleet', url: `${BASE}/management/fleet` },
  { name: 'fleet_drivers', url: `${BASE}/management/fleet/drivers` },
  { name: 'fleet_vehicles', url: `${BASE}/management/fleet/vehicles` },
  { name: 'fleet_inspection', url: `${BASE}/management/fleet/inspection` },
  { name: 'fleet_map', url: `${BASE}/management/fleet/map-vehicles` },
  { name: 'fleet_plans', url: `${BASE}/management/fleet/plans` },
  { name: 'fleet_settings', url: `${BASE}/management/fleet/settings` },
  { name: 'fleet_options', url: `${BASE}/management/fleet/options` },
  { name: 'fleet_news', url: `${BASE}/management/fleet/news` },
  { name: 'fleet_notifications', url: `${BASE}/management/fleet/notifications` },
  { name: 'blacklist', url: `${BASE}/management/settings/blacklist` },
  { name: 'dynamic_tariffs', url: `${BASE}/management/settings/dynamic-tariffs` },
  { name: 'subsidies', url: `${BASE}/management/subsidies` },
  { name: 'subsidies_manage', url: `${BASE}/management/subsidies/manage-subsidies` },
  { name: 'subsidies_guarantee', url: `${BASE}/management/subsidies/guarantee-subsidies` },
  { name: 'subsidies_tariffs', url: `${BASE}/management/subsidies/tariffs` },
  { name: 'maps_addresses', url: `${BASE}/management/maps/addresses` },
  { name: 'app_profile', url: `${BASE}/management/app_profile` },
];

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(SHOTS_DIR)) mkdirSync(SHOTS_DIR, { recursive: true });

  const session = await createBrowserSession();
  await login(session);
  const { page } = session;

  const results: Array<{
    name: string;
    url: string;
    finalUrl: string;
    title: string;
    apis: NetEvent[];
    forms: Array<{ fields: Array<{ name: string | null; type: string | null; placeholder: string | null }> }>;
    headers: string[];
    buttons: string[];
    visibleText: string;
    error?: string;
  }> = [];

  for (const t of TARGETS) {
    const apis: NetEvent[] = [];
    const collector = async (resp: Response): Promise<void> => {
      const u = resp.url();
      if (u.endsWith('.js') || u.endsWith('.css') || u.endsWith('.woff2') || u.endsWith('.png') || u.endsWith('.svg')) return;
      if (!u.includes('/management/') && !u.includes('/api/')) return;
      try {
        const ct = resp.headers()['content-type'] ?? '';
        let body: string | undefined;
        let sample = '';
        if (resp.request().postData()) body = resp.request().postData()!.slice(0, 800);
        if (ct.includes('json')) sample = (await resp.text().catch(() => '')).slice(0, 800);
        apis.push({ ts: Date.now(), method: resp.request().method(), url: u, status: resp.status(), request_body: body, response_sample: sample });
      } catch { /* ignore */ }
    };
    page.on('response', collector);

    logger.info({ name: t.name, url: t.url }, 'Sahifa');
    try {
      await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      // SPA yuklanishi uchun ko'proq kutamiz
      await humanPause(4000, 5500);
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      await humanPause(2500, 3500);

      const snap = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map((el) => ({
          name: el.getAttribute('name'),
          type: el.getAttribute('type') ?? el.tagName.toLowerCase(),
          placeholder: el.getAttribute('placeholder'),
        }));
        const headers = Array.from(document.querySelectorAll('h1, h2, h3, .hv-table__header-cell'))
          .map((h) => (h.textContent ?? '').trim())
          .filter((t) => t && t.length < 50)
          .slice(0, 30);
        const buttons = Array.from(document.querySelectorAll('button'))
          .map((b) => (b.textContent ?? '').trim())
          .filter((t) => t && t.length < 60)
          .slice(0, 40);
        const text = (document.body?.innerText ?? '').slice(0, 3500);
        return { title: document.title, inputs, headers, buttons, text };
      });

      const shot = resolve(SHOTS_DIR, `${t.name}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);

      results.push({
        name: t.name,
        url: t.url,
        finalUrl: page.url(),
        title: snap.title,
        apis,
        forms: snap.inputs.length > 0 ? [{ fields: snap.inputs }] : [],
        headers: snap.headers,
        buttons: snap.buttons,
        visibleText: snap.text,
      });
      logger.info({ name: t.name, inputs: snap.inputs.length, apis: apis.length, finalUrl: page.url() }, 'Tugadi');
    } catch (err) {
      results.push({ name: t.name, url: t.url, finalUrl: page.url(), title: '', apis, forms: [], headers: [], buttons: [], visibleText: '', error: (err as Error).message });
    }
    page.off('response', collector);
  }

  writeFileSync(resolve(OUT_DIR, 'deep-report.json'), JSON.stringify(results, null, 2), 'utf-8');

  // API path summary
  const allApis = new Map<string, { count: number; methods: Set<string>; sampleBody?: string; sampleResp?: string }>();
  for (const r of results) {
    for (const a of r.apis) {
      const p = a.url.replace(BASE, '').split('?')[0]!;
      const cur = allApis.get(p) ?? { count: 0, methods: new Set<string>() };
      cur.count++;
      cur.methods.add(a.method);
      if (a.request_body && !cur.sampleBody) cur.sampleBody = a.request_body;
      if (a.response_sample && !cur.sampleResp) cur.sampleResp = a.response_sample;
      allApis.set(p, cur);
    }
  }
  const apiSummary = Array.from(allApis.entries())
    .map(([path, info]) => ({ path, methods: Array.from(info.methods), count: info.count, sampleBody: info.sampleBody ?? null, sampleResp: info.sampleResp?.slice(0, 400) ?? null }))
    .sort((a, b) => b.count - a.count);
  writeFileSync(resolve(OUT_DIR, 'deep-apis.json'), JSON.stringify(apiSummary, null, 2), 'utf-8');

  // Markdown
  const md: string[] = ['# Chuqur tekshiruv'];
  md.push('');
  md.push(`Vaqt: ${new Date().toLocaleString('ru-RU')}`);
  md.push('');
  md.push('## Sahifalar');
  md.push('| Nom | Title | Input | API | Tugma | Status |');
  md.push('|---|---|---|---|---|---|');
  for (const r of results) {
    md.push(`| ${r.name} | ${r.title.slice(0, 30)} | ${r.forms[0]?.fields.length ?? 0} | ${r.apis.length} | ${r.buttons.length} | ${r.error ? '❌ ' + r.error.slice(0, 40) : '✅'} |  `);
  }
  md.push('');
  md.push('## Topilgan API endpointlar (eng faollari)');
  md.push('| Path | Methods | Count | Sample request |');
  md.push('|---|---|---|---|');
  for (const a of apiSummary.slice(0, 40)) {
    md.push(`| \`${a.path}\` | ${a.methods.join(',')} | ${a.count} | ${a.sampleBody?.slice(0, 100) ?? '—'} |`);
  }
  writeFileSync(resolve(OUT_DIR, 'DEEP-REPORT.md'), md.join('\n'), 'utf-8');

  logger.info({ pages: results.length, apis: apiSummary.length }, 'CHUQUR TEKSHIRUV TUGADI');
  await closeBrowserSession(session);
}

void main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'Xato');
  process.exit(1);
});
