/**
 * Sayt JS fayllarini yuklab, ulardan API endpointlarini topadi.
 * Faqat o'qish — hech narsa yuborilmaydi.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './common/config.js';
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';
import { login } from './scraper/auth.js';
import { logger } from './common/logger.js';

const BASE = config.ROYALTAXI_BASE_URL;
const OUT_DIR = resolve(process.cwd(), 'explore-output');

const JS_FILES = [
  '/management/page/fleet/drivers.js',
  '/management/page/fleet/vehicles.js',
  '/management/page/fleet/inspection.js',
  '/management/page/fleet/vehicles_map.js',
  '/management/page/fleet/news.js',
  '/management/page/fleet/options.js',
  '/management/page/fleet/notifications.js',
  '/management/page/fleet/plans.js',
  '/management/page/fleet/settings.js',
  '/management/page/settings/blacklist.js',
  '/management/page/settings/dynamic-tariffs.js',
  '/management/page/subsidies/manage-subsidies.js',
  '/management/page/subsidies/guarantee-subsidies.js',
  '/management/page/subsidies/tariffs.js',
  '/management/page/archive.js',
  '/management/page/home.js',
  '/management/page/app_profile.js',
  '/management/page/maps/addresses.js',
  '/management/vendor/vendor.js',
];

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const session = await createBrowserSession();
  await login(session);

  const allEndpoints = new Map<string, string[]>(); // endpoint → list of source files
  const detailsByFile = new Map<string, { size: number; endpoints: string[] }>();

  for (const path of JS_FILES) {
    logger.info({ path }, 'JS yuklamoqda');
    try {
      // page.evaluate ichida fetch — ozining sessiyasini ishlatadi
      const text = await session.page.evaluate(async (url: string) => {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) return '';
        return await r.text();
      }, `${BASE}${path}`);

      if (!text || text.length < 100) {
        logger.warn({ path, len: text.length }, 'Bosh javob');
        detailsByFile.set(path, { size: text.length, endpoints: [] });
        continue;
      }

      // Endpoint patternlarni qidirish
      // 1) "/management/.../get-foo" 2) "/management/.../action-name"
      const endpoints = new Set<string>();
      const pattern = /['"`](\/management\/[a-zA-Z0-9_\-/]+)['"`]/g;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        const p = m[1];
        // faqat haqiqiy endpoint, asset emas
        if (p && !p.endsWith('.js') && !p.endsWith('.css') && !p.endsWith('.png') && !p.endsWith('.svg') && !p.endsWith('.woff2')) {
          endpoints.add(p);
        }
      }

      detailsByFile.set(path, { size: text.length, endpoints: Array.from(endpoints) });
      for (const e of endpoints) {
        const list = allEndpoints.get(e) ?? [];
        list.push(path);
        allEndpoints.set(e, list);
      }
      logger.info({ path, size: text.length, found: endpoints.size }, 'Tahlil tugadi');
      await humanPause(300, 500);
    } catch (err) {
      logger.warn({ path, err: (err as Error).message }, 'Xato');
    }
  }

  // Endpointlarni guruhlash
  const grouped = new Map<string, Set<string>>();
  for (const ep of allEndpoints.keys()) {
    const segments = ep.split('/').filter(Boolean);
    const group = segments.slice(0, 3).join('/');
    if (!grouped.has(group)) grouped.set(group, new Set());
    grouped.get(group)!.add(ep);
  }

  // Markdown hisobot
  const md: string[] = ['# JS fayllaridan topilgan API endpointlar'];
  md.push('');
  md.push(`Vaqt: ${new Date().toLocaleString('ru-RU')}`);
  md.push('');
  md.push('## Guruhlar bo\'yicha');
  md.push('');
  const sortedGroups = Array.from(grouped.entries()).sort();
  for (const [group, eps] of sortedGroups) {
    md.push(`### \`/${group}\` (${eps.size} ta)`);
    md.push('');
    for (const ep of Array.from(eps).sort()) {
      const sources = allEndpoints.get(ep) ?? [];
      md.push(`- \`${ep}\``);
      if (sources.length <= 3) {
        md.push(`  - manba: ${sources.map((s) => s.replace('/management/page/', '')).join(', ')}`);
      }
    }
    md.push('');
  }
  writeFileSync(resolve(OUT_DIR, 'JS-ENDPOINTS.md'), md.join('\n'), 'utf-8');

  // JSON output too
  const allEndpointsObj: Record<string, string[]> = {};
  for (const [k, v] of allEndpoints) allEndpointsObj[k] = v;
  writeFileSync(
    resolve(OUT_DIR, 'js-endpoints.json'),
    JSON.stringify({ endpoints: allEndpointsObj, byFile: Object.fromEntries(detailsByFile) }, null, 2),
    'utf-8',
  );

  // KRITIK endpointlar — action ko'rinishlilari
  const actionWords = ['add', 'create', 'lock', 'unlock', 'block', 'remove', 'delete', 'enable', 'disable', 'edit', 'update', 'save', 'send', 'apply', 'reject', 'approve', 'ban'];
  const actions: string[] = [];
  for (const ep of allEndpoints.keys()) {
    const lower = ep.toLowerCase();
    if (actionWords.some((w) => lower.includes(`/${w}-`) || lower.endsWith(`/${w}`))) {
      actions.push(ep);
    }
  }
  writeFileSync(resolve(OUT_DIR, 'action-endpoints.txt'), actions.sort().join('\n'), 'utf-8');

  logger.info(
    { totalEndpoints: allEndpoints.size, files: detailsByFile.size, actions: actions.length },
    'TUGADI',
  );

  await closeBrowserSession(session);
}

void main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'Xato');
  process.exit(1);
});
