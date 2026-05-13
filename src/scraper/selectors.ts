/**
 * Barcha DOM selectorlar SHU FAYLDA markazlashtirilgan.
 * Sayt o'zgarganda faqat shu fayl yangilanadi.
 *
 * DIQQAT: selectorlar hozir taxminiy. Birinchi `npm run dev`da headed
 * rejimda DevTools orqali tekshirib, kerak bo'lsa yangilang.
 */

export const SELECTORS = {
  login: {
    form: 'form',
    username: 'input[name="username"], input[type="text"]',
    password: 'input[name="password"], input[type="password"]',
    submit: 'button[type="submit"]',
    errorMessage: '.error, .alert-danger, [class*="error"]',
  },
  layout: {
    /** Login muvaffaqiyatli bo'lganini aniqlash uchun ishonchli element */
    sidebar: 'aside, nav, [class*="sidebar"], [class*="menu"]',
    userMenu: '[class*="user"], [class*="profile"]',
  },
  archiveOrders: {
    navLink: 'a:has-text("Архив"), a[href*="archive"]',
    table: '.blade-table .blade-tbody',
    /** Bitta buyurtma qatori — hv-table ning body qatori */
    row: '.hv-table__body-row.hv-table__body-row--body',
    col: {
      time: '.col-accept .fs-14',
      date: '.col-accept .fs-12',
      address: '.col-address .fw-medium',
      payment: '.col-payment',
      status: '.col-status',
      driver: '.col-driver',
      callsign: '.col-call-sign',
      /** Status ikonka ichidagi SVG use href — "#flag", "#cross" kabi */
      statusIcon: '.col-status svg use',
      paymentIcon: '.col-payment svg use',
    },
    loader: '.loader, .spinner, [class*="loading"]',
  },
} as const;

export const URLS = {
  /** Relative paths — base URL config'dan olinadi */
  login: '/login',
  archiveOrders: '/management/archive',
  dashboard: '/management',
} as const;
