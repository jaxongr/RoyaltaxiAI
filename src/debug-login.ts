/**
 * Debug skripti — login submitdan keyin sahifada nima bor — chiqarib beradi.
 */
import { config } from './common/config.js';
import { createBrowserSession, closeBrowserSession, humanPause } from './scraper/browser.js';

async function main(): Promise<void> {
  const session = await createBrowserSession();
  const { page } = session;

  await page.goto(`${config.ROYALTAXI_BASE_URL}/management`, { waitUntil: 'domcontentloaded' });
  await humanPause(1500, 2000);

  console.log('--- BEFORE LOGIN ---');
  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  // Form maydonlari ro'yxati
  const inputs = await page.$$eval('input', (els) =>
    els.map((e) => ({
      type: e.getAttribute('type'),
      name: e.getAttribute('name'),
      id: e.getAttribute('id'),
      placeholder: e.getAttribute('placeholder'),
      autocomplete: e.getAttribute('autocomplete'),
    })),
  );
  console.log('Inputs:', JSON.stringify(inputs, null, 2));

  const buttons = await page.$$eval('button, input[type="submit"]', (els) =>
    els.map((e) => ({ text: e.textContent?.trim(), type: e.getAttribute('type') })),
  );
  console.log('Buttons:', JSON.stringify(buttons, null, 2));

  // Login submit qilish
  const passInput = page.locator('input[type="password"]').first();
  const loginInput = page
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="submit"])')
    .first();
  const submitBtn = page
    .getByRole('button', { name: /ВОЙТИ|Войти|Login/i })
    .or(page.locator('button[type="submit"]'))
    .first();

  await loginInput.fill(config.ROYALTAXI_USERNAME);
  await humanPause(300, 500);
  await passInput.fill(config.ROYALTAXI_PASSWORD);
  await humanPause(300, 500);

  console.log('\n--- SUBMITTING ---');
  await submitBtn.click();
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await humanPause(2000, 3000);

  console.log('\n--- AFTER LOGIN ---');
  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  // Sahifa matni
  const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
  console.log('\n--- BODY TEXT (first 1500 chars) ---');
  console.log(bodyText.slice(0, 1500));

  // Form mavjud bo'lsa hali ham
  const stillHasForm = await page.locator('input[type="password"]').count();
  console.log('\nParol input qoldimi:', stillHasForm);

  // Error matn topish
  const errorTexts = await page.$$eval(
    '[class*="error"], [class*="alert"], [class*="danger"], [role="alert"]',
    (els) => els.map((e) => e.textContent?.trim()).filter(Boolean),
  );
  console.log('Error matnlar:', errorTexts);

  // Screenshot
  await page.screenshot({ path: 'debug-login.png', fullPage: true });
  console.log('\nScreenshot: debug-login.png');

  await humanPause(8000, 8000);
  await closeBrowserSession(session);
}

void main().catch((err) => {
  console.error('XATO:', err);
  process.exit(1);
});
