# Royaltaxi AI Dispetcher

Real-time firibgarlik aniqlash tizimi Royaltaxi taksi platformasi (`hive-respublika-new.royaltaxi.uz`) uchun. Playwright bilan API'ni kuzatib, qoidalar dvigateli orqali shubhali zakazlarni aniqlaydi va Telegramga xabar yuboradi.

## Imkoniyatlar

- 🔍 **Real-time monitor** — har 5 sekundda yangi zakazlar, paginate qilingan, auto-retry
- 🎯 **11 ta firibgarlik qoidasi** — masofa, vaqt, narx, mijoz patterni, sayt belgisi
- 📱 **Telegram bot** — alertlar darhol telefonga, `/stats`, `/top`, `/blocks`, `/help`
- 🖥 **React + AntD admin paneli** — 13 sahifa, Yandex-uslubidagi premium UI
- 📊 **Dashboard** — Asosiy, Hududlar, Haydovchilar, Mijozlar, Ogohlantirishlar, Bloklar, Qora ro'yxat, Zakazlar, Statistika, Hisobotlar, Audit log, Sozlamalar
- 💾 **SQLite + WAL mode** — 38k+ zakaz saqlanadi
- 🔄 **Auto-sync** — UZ PC dan Germaniya serverga DB sinxronizatsiyasi
- ✅ **Coverage tracking** — qamrov foizi (sayt total vs DB)
- 📜 **Audit log** — barcha amallar saqlanadi

## Arxitektura

```
┌──────────────────────┐         ┌─────────────────────┐
│ UZ KOMPYUTER         │         │ GERMANIYA SERVER    │
│ (O'zbek IP)          │ ─SCP──▶ │ 173.212.216.167     │
│                      │ DB sync │                     │
│ • Monitor (scraper)  │         │ • Dashboard         │
│ • Telegram bot       │         │ • Nginx (port 80)   │
│ • Local dashboard    │         │ • PM2 (auto-start)  │
└──────────────────────┘         └─────────────────────┘
        │                                  │
        ▼                                  ▼
  royaltaxi.uz                    📱 Brauzer (xorijdan)
  (faqat UZ IP)
```

## Talablar

- Node.js 20+ va npm
- PuTTY (pscp.exe) — server sync uchun
- O'zbekiston IP manzili — sayt chet ellik serverlardan ochilmaydi

## O'rnatish (UZ PC)

```bash
git clone https://github.com/jaxongr/RoyaltaxiAI.git
cd RoyaltaxiAI
npm install
npx playwright install chromium
cp .env.example .env

# Admin frontend
cd admin && npm install && npm run build && cd ..
```

`.env` faylini to'ldiring (kalit sirlar):
```bash
ROYALTAXI_USERNAME=jaxong1r
ROYALTAXI_PASSWORD="parolni qo'shtirnoqqa olish kerak (# belgi tufayli)"
TELEGRAM_BOT_TOKEN="bot_tokeningiz"
TELEGRAM_CHAT_ID=chat_id_raqami
SERVER_HOST=173.212.216.167
SERVER_PASSWORD=server_paroli
```

## Ishga tushirish

3 ta jarayon parallel:
```bash
# 1. Real-time monitor (asosiy scraper + Telegram)
npm run monitor

# 2. Local dashboard (test uchun)
npm run dashboard

# 3. Serverga DB sync (har 5 daqiqada)
npm run sync-server
```

Brauzer: http://localhost:4000 (lokal) yoki http://173.212.216.167 (server)

## Buyruqlar

| Buyruq | Tavsifi |
|--------|---------|
| `npm run monitor` | Real-time monitor — har 5 sek yangi zakazlar |
| `npm run dashboard` | Web dashboard — port 4000 |
| `npm run sync-server` | DB ni server'ga jo'natish (loop) |
| `npm run alerts` | CLI orqali alertlar ro'yxati |
| `npm run alerts -- --days 7` | Oxirgi 7 kun |
| `npm run recalc -- --score` | Eski alertlarni qaytadan baholash |
| `npm run sync` | Saytdan haydovchi/mashina/qora ro'yxatni DB'ga sinxronlash |
| `npm run dev -- --target 5000` | 5000 ta tarixiy zakazni tortish |
| `npm run typecheck` | TypeScript tekshiruvi |

## Telegram buyruqlari

- `/stats` — bugungi statistika
- `/top` — eng shubhali haydovchilar
- `/blocks` — blok tavsiyalari
- `/help` — yordam

## Server deploy (Germaniya VPS)

Server allaqachon sozlangan: `http://173.212.216.167`

Yangi versiyani serverga push qilish uchun:
```bash
git push  # GitHub'ga

# Server'da:
ssh root@173.212.216.167
cd /opt/royaltaxi
git pull
cd admin && npm install && npm run build && cd ..
pm2 restart royaltaxi-dashboard
```

## Firibgarlik aniqlash qoidalari

`src/fraud/rules.ts` da 11 ta qoida:

| # | Qoida | Ball |
|---|-------|------|
| 1 | Masofa <200m | +100 |
| 2 | Masofa <350m | +70 |
| 3 | Masofa <500m | +45 |
| 4 | Vaqt <60s | +40 |
| 5 | Vaqt <180s | +20 |
| 6 | Sayt belgisi (isDriverCrook) | +80 |
| 7 | Mijoz telefoni yo'q | +30 |
| 8 | "Xaritadagi nuqta" manzil | +15 |
| 9 | Bugun 3+ qisqa zakaz (pattern) | +50 |
| 10 | Shu mijozdan 5+ marta (self-order) | +40 |
| 11 | Narx 0 so'm + finish | +70 |
| 12 | <30s + impossibly short | +90 |
| 13 | Haydovchi o'zi yaratgan zakaz | +80 |

Chegaralar:
- **Alert** — ≥50 ball (Telegramga xabar)
- **Strong** — ≥100 (kuchli shubha)
- **Auto-block** — ≥150 ball, yoki 7 kun ichida 5+ alert / 400+ jami

## Loyiha tuzilishi

```
src/
├── realtime.ts            # Real-time monitor (asosiy)
├── dashboard.ts           # HTTP server + REST API
├── sync-to-server.ts      # Serverga DB sync
├── main.ts                # Bulk scrape (tarix uchun)
├── telegram.ts            # Bot integratsiya
├── db.ts                  # SQLite schema
├── cli-alerts.ts          # Alertlar CLI
├── cli-recalc.ts          # Qaytadan baholash
├── cli-sync.ts            # Drivers/blacklist sync
├── common/
│   ├── config.ts          # .env validation
│   └── logger.ts          # Pino logger
├── fraud/
│   └── rules.ts           # Qoidalar dvigateli
└── scraper/
    ├── api.ts             # Sayt REST API client
    ├── auth.ts            # OIDC login (retry bilan)
    ├── browser.ts         # Playwright context
    ├── drivers.ts         # Haydovchilar API
    ├── blacklist.ts       # Qora ro'yxat API
    └── selectors.ts       # DOM selektorlar

admin/                     # React + Vite + AntD dashboard
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── AppLayout.tsx
│   │   └── DriverDrawer.tsx
│   ├── pages/             # 13 sahifa
│   └── lib/api.ts         # Axios client
└── package.json
```

## Muhim eslatmalar

1. **Sayt faqat O'zbek IP'da ochiladi** — server'da scraper ishlamaydi (chet IP)
2. **Telegram bot bitta joydan turishi kerak** — UZ PC'da (getUpdates conflict bo'lmasligi uchun)
3. **DB sync 5 daqiqada** — internet tezligiga qarab 3-7 daqiqa olishi mumkin
4. **`.env` git'ga kiritilmaydi** — kalit sirlar mahalliy bo'lib qoladi
5. **`storage-state.json` ham git'da yo'q** — session cookielar avtomatik yaratiladi

## Memory (Claude AI uchun)

Loyihaga oid barcha tushuncha `.claude/projects/.../memory/` ga saqlangan:
- `royaltaxi_sitemap.md` — sayt URL strukturasi
- `royaltaxi_apis.md` — barcha API endpointlar
- `royaltaxi_data_models.md` — data schemalar
- `hivetaxi_complete.md` — HiveTaxi platform tushunchasi
- `hivetaxi_articles_index.md` — 166 ta rasmiy maqola indeksi

## Litsenziya

Privat — faqat ichki foydalanish uchun.
