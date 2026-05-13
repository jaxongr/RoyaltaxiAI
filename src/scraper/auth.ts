import type { Page } from 'playwright';
import { config } from '../common/config.js';
import { childLogger } from '../common/logger.js';
import { saveSession, humanPause, type BrowserSession } from './browser.js';
import { URLS } from './selectors.js';

const log = childLogger('auth');

/**
 * Management dastur sahifasidamiz va login formasi YO'QmI?
 * URL `/management` bilan boshlansa va login input ko'rinmasa — kirganmiz.
 */
async function isInsideManagement(page: Page): Promise<boolean> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await humanPause(400, 800);

  const url = page.url();
  const onManagement =
    url.includes('/management') &&
    !url.includes('/oidc/auth') &&
    !url.includes('/login');

  if (!onManagement) return false;

  // Login formasi hali ham ko'rinsa — kirmaganmiz
  const passInput = page.locator('input[type="password"]').first();
  const hasLoginForm = await passInput.isVisible().catch(() => false);
  return !hasLoginForm;
}

async function fillLoginForm(page: Page): Promise<void> {
  const passInput = page.locator('input[type="password"]').first();
  await passInput.waitFor({ state: 'visible', timeout: 15_000 });

  const loginInput = page
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="submit"])')
    .first();
  const submitBtn = page
    .getByRole('button', { name: /ВОЙТИ|Войти|Login/i })
    .or(page.locator('button[type="submit"]'))
    .first();

  await loginInput.fill(config.ROYALTAXI_USERNAME);
  await humanPause(400, 900);

  await passInput.fill(config.ROYALTAXI_PASSWORD);
  await humanPause(400, 900);

  log.info({ url: page.url() }, 'Login submit');
  await submitBtn.click();
}

async function attemptLogin(session: BrowserSession, attempt: number): Promise<boolean> {
  const { page, context } = session;
  const managementUrl = `${config.ROYALTAXI_BASE_URL}${URLS.dashboard}`;

  log.info({ managementUrl, attempt }, 'Management sahifasiga o\'tamiz');
  await page
    .goto(managementUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    .catch((err) => {
      log.warn({ err: (err as Error).message }, 'goto xato — davom etamiz');
    });

  if (await isInsideManagement(page)) {
    log.info({ url: page.url(), attempt }, 'Session aktiv — login shart emas');
    return true;
  }

  log.info({ url: page.url(), attempt }, 'OIDC login sahifasi — form to\'ldirilmoqda');
  try {
    await fillLoginForm(page);
  } catch (err) {
    log.warn({ err: (err as Error).message, attempt }, 'Form to\'ldirishda xato');
    return false;
  }

  try {
    await page.waitForURL(
      (u) => u.href.includes('/management') && !u.href.includes('/oidc/auth'),
      { timeout: 30_000 },
    );
  } catch {
    log.warn({ currentUrl: page.url(), attempt }, 'Management ga qaytmadi (timeout)');
  }

  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);

  if (await isInsideManagement(page)) {
    log.info({ currentUrl: page.url(), attempt }, 'Login muvaffaqiyatli');
    await saveSession(context);
    return true;
  }

  log.warn({ currentUrl: page.url(), attempt }, 'Login tasdiqlanmadi');
  return false;
}

export async function login(session: BrowserSession, maxAttempts = 5): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    const ok = await attemptLogin(session, i).catch((err) => {
      log.warn({ err: (err as Error).message, attempt: i }, 'Login urinishi xato');
      return false;
    });
    if (ok) return;

    if (i < maxAttempts) {
      const wait = Math.min(15_000, 3_000 * i);
      log.info({ wait, nextAttempt: i + 1 }, `Login urinishi ${i} muvaffaqiyatsiz — qayta urinaman`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw new Error(`Login muvaffaqiyatsiz — ${maxAttempts} ta urinishdan keyin`);
}
