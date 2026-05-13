# Royaltaxi AI Dispetcher

Royaltaxi taksi platformasini (`hive-respublika-new.royaltaxi.uz`) Playwright bilan kuzatish. **1-bosqich:** login + "Архив заказов" sahifasidan 10 ta buyurtmani o'qib, terminalga chiqarish.

## Talablar

- Node.js 20+
- O'zbekiston IP manzili — sayt chet ellik serverlardan ochilmaydi

## O'rnatish

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

`.env` faylini to'ldiring:

```bash
ROYALTAXI_USERNAME=sizning_login
ROYALTAXI_PASSWORD=sizning_parol
BROWSER_HEADLESS=false   # false — brauzerni ko'rib turish, true — arqa fonda
LOG_LEVEL=info
```

## Ishga tushirish

```bash
npm run dev
```

Birinchi ishga tushurishda brauzer ochiladi, login bo'lib, `storage-state.json` saqlanadi. Keyingi safar shu session qayta ishlatiladi — parolni qayta yozish shart emas.

## Buyruqlar

| Buyruq | Nima qiladi |
|--------|-------------|
| `npm run dev` | `tsx` orqali `src/main.ts` ni ishga tushirish |
| `npm run build` | TypeScript'ni `dist/` ga kompilyatsiya qilish |
| `npm start` | `dist/main.js` ni ishga tushirish |
| `npm run typecheck` | Tip tekshirishi (fayl chiqarmaydi) |

## Struktura

```
src/
├── main.ts                 # Entry point
├── common/
│   ├── config.ts           # .env + zod validation
│   └── logger.ts           # pino logger
└── scraper/
    ├── browser.ts          # Playwright context
    ├── auth.ts             # Login logikasi
    ├── orders.ts           # Buyurtmalarni o'qish
    └── selectors.ts        # DOM selectorlar (1 joyda)
```

## Muhim eslatmalar

1. **Selektorlar taxminiy** — birinchi ishga tushirganda `BROWSER_HEADLESS=false` bilan ko'ring. Selektor topilmasa, DevTools orqali tekshirib `src/scraper/selectors.ts`'da yangilang.
2. **Session saqlash** — `storage-state.json` parol ma'lumotini saqlaydi, `.gitignore`'ga kiritilgan.
3. **Bot-like chiqmaslik uchun** — har amal orasida 2-5 soniya pauza bor.
4. **Sayt faqat O'zbek IP'da ochiladi** — chet VPS'da Playwright timeout'ga tushadi.

## Keyingi bosqichlar

- 100 ta buyurtma + SQLite saqlash
- GPS trek ma'lumotini yig'ish
- Cron orqali har 5 daqiqada
- AI (Gemini) bilan firibgarlik aniqlash
- Telegram hisobot
- Blok/unblok avtomatizatsiyasi (phase 2-3)
