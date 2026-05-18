/**
 * Telegram bot integratsiyasi — shubhali zakaz, blok tavsiya va statusni yuboradi.
 * Multi-user routing: alert hududiga ko'ra kerakli foydalanuvchilarga yuboradi.
 */
import { config } from './common/config.js';
import { childLogger } from './common/logger.js';
import { openDb } from './db.js';

const log = childLogger('telegram');

const API_BASE = config.TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`
  : null;

interface TelegramUser {
  id: number;
  chat_id: string;
  full_name: string | null;
  role: string;
  regions: string | null; // JSON array yoki NULL (= hammasi)
  receive_alerts: number;
  receive_daily_report: number;
  receive_no_orders_alert: number;
  is_active: number;
}

interface BroadcastFilter {
  type: 'alert' | 'daily_report' | 'no_orders' | 'all' | 'admin_only';
  region?: string;
}

/**
 * DB'dan kerakli foydalanuvchilarni topib, hammasiga yuboradi.
 * Filter:
 *   - type='alert' va region berilsa: faqat shu hudud uchun obuna bo'lganlar (yoki regions=NULL/admin)
 *   - type='daily_report': barcha receive_daily_report=1
 *   - type='no_orders': barcha receive_no_orders_alert=1
 *   - type='all': hammaga (boshqa muhim xabarlar)
 */
async function broadcast(text: string, filter: BroadcastFilter): Promise<{ sent: number; failed: number }> {
  if (!API_BASE) return { sent: 0, failed: 0 };
  let users: TelegramUser[] = [];
  try {
    const db = openDb();
    users = db
      .prepare(`SELECT * FROM telegram_users WHERE is_active = 1`)
      .all() as TelegramUser[];
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'DB user ro\'yxati xato');
    // Fallback — .env chat_id ga yuboramiz
    if (config.TELEGRAM_CHAT_ID) {
      users = [{
        id: 0, chat_id: String(config.TELEGRAM_CHAT_ID), full_name: 'env-fallback', role: 'admin',
        regions: null, receive_alerts: 1, receive_daily_report: 1, receive_no_orders_alert: 1, is_active: 1,
      }];
    }
  }

  const targets: TelegramUser[] = users.filter((u) => {
    if (filter.type === 'alert') {
      if (!u.receive_alerts) return false;
      // Admin yoki regions=NULL — hammasini oladi
      if (u.role === 'admin' || !u.regions) return true;
      try {
        const userRegions = JSON.parse(u.regions) as string[];
        if (userRegions.length === 0) return true; // bo'sh array = hammasi
        if (!filter.region) return false; // alert region yo'q bo'lsa, faqat admin
        return userRegions.includes(filter.region);
      } catch {
        return false;
      }
    }
    if (filter.type === 'daily_report') return !!u.receive_daily_report;
    if (filter.type === 'no_orders') return !!u.receive_no_orders_alert;
    if (filter.type === 'admin_only') return u.role === 'admin';
    return true; // 'all'
  });

  let sent = 0; let failed = 0;
  for (const u of targets) {
    try {
      const resp = await fetch(`${API_BASE}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: u.chat_id,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (resp.ok) sent++;
      else {
        failed++;
        const body = await resp.text();
        log.warn({ chat_id: u.chat_id, status: resp.status, body: body.slice(0, 200) }, 'Yuborishda xato');
      }
    } catch (err) {
      failed++;
      log.warn({ chat_id: u.chat_id, err: (err as Error).message }, 'Network xato');
    }
  }
  return { sent, failed };
}

interface AlertPayload {
  callsign: string;
  driver: string;
  score: number;
  orderId: number;
  distance: number | null;
  duration: number | null;
  amount: number | null;
  address: string;
  region: string;
  service: string;
  reasons: string[];
  isBlockRecommendation: boolean;
  totalScore?: number;
  alertCount?: number;
  date?: string;        // zakaz sanasi "YYYY-MM-DD"
  time?: string;        // zakaz vaqti "HH:MM"
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDuration(sec: number | null): string {
  if (sec === null) return 'noma\'lum';
  if (sec < 60) return `${sec} sekund`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} daqiqa` : `${m} daq ${s} sek`;
}

function formatDistance(km: number | null): string {
  if (km === null) return 'noma\'lum';
  if (km < 1) return `${Math.round(km * 1000)} metr`;
  return `${km.toFixed(2)} km`;
}


function formatAlert(a: AlertPayload): string {
  const head = a.isBlockRecommendation
    ? '🚨 <b>BLOK TAVSIYASI — haydovchini tekshirish kerak</b>'
    : '⚠️ <b>Shubhali zakaz aniqlandi</b>';
  const narx =
    a.amount === null ? 'noma\'lum' : `${a.amount.toLocaleString('ru-RU')} so'm`;
  const reasons = a.reasons.map((r) => `   • ${escapeHtml(r)}`).join('\n');

  const dateTime = (a.date && a.time)
    ? `${a.date} ${a.time}`
    : 'noma\'lum';

  const lines = [
    head,
    '',
    `📅 Zakaz vaqti: <b>${escapeHtml(dateTime)}</b>`,
    `👤 Haydovchi: <b>${escapeHtml(a.driver)}</b>`,
    `🔢 Chaqiruv belgisi: <code>${escapeHtml(a.callsign || 'yo\'q')}</code>`,
    `📍 Hudud: ${escapeHtml(a.region || 'noma\'lum')} • ${escapeHtml(a.service || '')}`,
    `🛣 Manzil: ${escapeHtml(a.address || 'noma\'lum')}`,
    '',
    `📏 Bosib o'tilgan masofa: <b>${formatDistance(a.distance)}</b>`,
    `⏱ Zakaz davomiyligi: <b>${formatDuration(a.duration)}</b>`,
    `💰 To'lov: <b>${narx}</b>`,
    '',
    `🎯 Shubha balli: <b>${a.score}</b>`,
    '',
    '<b>Sabablar:</b>',
    reasons,
  ];

  if (a.isBlockRecommendation && a.totalScore !== undefined) {
    lines.push('');
    lines.push(
      `📊 Oxirgi 7 kunda: <b>${a.totalScore}</b> jami ball, <b>${a.alertCount}</b> ta ogohlantirish`,
    );
    lines.push('⛔ <i>Bu haydovchini bloklash tavsiya etiladi</i>');
  }

  lines.push('');
  lines.push(`🆔 Zakaz raqami: <code>${a.orderId}</code>`);

  return lines.join('\n');
}

/**
 * Eski API — `all` rejimda hammaga yuboradi.
 * Mavjud kod (heartbeat, startup va h.k.) buni chaqiradi.
 */
export async function sendTelegram(text: string): Promise<boolean> {
  if (!API_BASE) return false;
  const r = await broadcast(text, { type: 'all' });
  return r.sent > 0;
}

/**
 * Bitta chat_id ga yuborish (test, registratsiya yoki specific user uchun)
 */
export async function sendToChat(chatId: string, text: string): Promise<boolean> {
  if (!API_BASE) return false;
  try {
    const resp = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function sendAlert(a: AlertPayload): Promise<boolean> {
  // Spam himoyasi — distance, duration va amount HAMMASI noma'lum bo'lsa,
  // zakazda hech qanday foydali ma'lumot yo'q. Botga bunaqa alert yuborilmasin.
  if (a.distance === null && a.duration === null && a.amount === null) {
    log.info(
      { orderId: a.orderId, callsign: a.callsign },
      'Alert o\'tkazib yuborildi — ma\'lumot yetarli emas (distance/duration/amount hammasi null)',
    );
    return false;
  }
  const r = await broadcast(formatAlert(a), { type: 'alert', region: a.region });
  if (r.sent === 0 && r.failed === 0) {
    log.info({ region: a.region }, 'Hudud uchun obuna bo\'lgan user yo\'q');
  }
  return r.sent > 0;
}

export async function sendStartup(info: { interval: number; mode: string }): Promise<boolean> {
  const msg = [
    '🟢 <b>Royaltaxi AI monitor ishga tushdi</b>',
    '',
    `Rejim: <code>${info.mode}</code>`,
    `Interval: ${info.interval} sek`,
    `Boshlanish: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`,
    '',
    'Buyruqlar: /stats /top /blocks /help',
  ].join('\n');
  // Faqat admin — texnik xabar
  const r = await broadcast(msg, { type: 'admin_only' });
  return r.sent > 0;
}

export async function sendPeriodicReport(report: {
  windowLabel: string;     // "Oxirgi 1 soat", "Oxirgi 30 daqiqa"
  newOrders: number;
  alerts: number;
  blocks: number;
  topDriver?: string;
}): Promise<boolean> {
  const lines = [
    `📊 <b>${report.windowLabel}</b>`,
    '',
    `📦 Yangi zakaz: <b>${report.newOrders}</b>`,
    `⚠️ Ogohlantirish: <b>${report.alerts}</b>`,
    `🚨 Blok tavsiya: <b>${report.blocks}</b>`,
  ];
  if (report.topDriver) lines.push('', `🏆 Eng faol: ${report.topDriver}`);
  // Faqat admin — bu texnik hisobot
  const r = await broadcast(lines.join('\n'), { type: 'admin_only' });
  return r.sent > 0;
}

export async function sendNoOrdersAlert(minutes: number): Promise<boolean> {
  const msg = [
    `🟡 <b>SAYT MUAMMOSI?</b>`,
    '',
    `Oxirgi <b>${minutes} daqiqa</b> davomida yangi zakaz tushmadi.`,
    '',
    'Sayt buzilgan bo\'lishi mumkin yoki internet uzilgan.',
    'Monitor avtomatik qayta urinmoqda.',
  ].join('\n');
  const r = await broadcast(msg, { type: 'no_orders' });
  return r.sent > 0;
}

export async function sendSiteRestored(downMinutes: number): Promise<boolean> {
  const msg = [
    `🟢 <b>SAYT QAYTDI</b>`,
    '',
    `Sayt ${downMinutes} daqiqa yopiq edi. Endi qayta ulandik va davom etamiz.`,
  ].join('\n');
  const r = await broadcast(msg, { type: 'no_orders' });
  return r.sent > 0;
}

export interface DailyReportPayload {
  date: string;
  orders: number;
  completed: number;
  cancelled: number;
  totalAmount: number;
  activeDrivers: number;
  newClients: number;
  alerts: number;
  blocks: number;
  topDriver?: { callsign: string; name: string; orders: number; amount: number };
  topRegion?: { region: string; orders: number };
  topFraud?: { callsign: string; name: string; score: number };
  forecast?: { tomorrowOrders: number; tomorrowDrivers: number; weekday: string };
}

export async function sendDailyReport(r: DailyReportPayload): Promise<boolean> {
  const fmt = (n: number): string => n.toLocaleString('ru-RU');
  const completionPct = r.orders > 0 ? Math.round((r.completed / r.orders) * 100) : 0;
  const lines = [
    `📊 <b>KUNLIK HISOBOT — ${r.date}</b>`,
    '',
    `📦 Zakazlar: <b>${fmt(r.orders)}</b>`,
    `✅ Bajarildi: ${fmt(r.completed)} (${completionPct}%)`,
    `❌ Bekor: ${fmt(r.cancelled)}`,
    `💰 Jami summa: <b>${fmt(r.totalAmount)} so'm</b>`,
    `🚕 Aktiv haydovchi: <b>${r.activeDrivers}</b>`,
    `👤 Yangi mijoz: <b>${r.newClients}</b>`,
    '',
    `⚠️ Ogohlantirish: <b>${r.alerts}</b>`,
    `🚨 Blok tavsiya: <b>${r.blocks}</b>`,
  ];
  if (r.topDriver) {
    lines.push('', `🏆 <b>Eng faol haydovchi:</b>`);
    lines.push(`   ${r.topDriver.callsign} ${r.topDriver.name}`);
    lines.push(`   ${fmt(r.topDriver.orders)} zakaz, ${fmt(r.topDriver.amount)} so'm`);
  }
  if (r.topRegion) {
    lines.push('', `📍 Eng faol hudud: <b>${r.topRegion.region}</b> (${fmt(r.topRegion.orders)} zakaz)`);
  }
  if (r.topFraud) {
    lines.push('', `⚠️ Eng shubhali: ${r.topFraud.callsign} ${r.topFraud.name} — ${r.topFraud.score} ball`);
  }
  if (r.forecast) {
    lines.push('', `🔮 <b>Ertaga (${r.forecast.weekday}) bashorat:</b>`);
    lines.push(`   ~${fmt(r.forecast.tomorrowOrders)} zakaz, ~${r.forecast.tomorrowDrivers} haydovchi`);
  }
  return sendTelegram(lines.join('\n'));
}

export async function sendHeartbeat(stats: {
  uptimeMin: number;
  ticks: number;
  ordersProcessed: number;
  alertsToday: number;
  blocksToday: number;
  lastError?: string;
}): Promise<boolean> {
  const msg = [
    '💚 <b>Monitor jonli</b>',
    '',
    `⏱ Uptime: ${stats.uptimeMin} daqiqa`,
    `🔄 Tick: ${stats.ticks}`,
    `📦 Ko'rilgan zakaz: ${stats.ordersProcessed}`,
    `⚠️ Bugungi alert: ${stats.alertsToday}`,
    `🚨 Bugungi blok tavsiya: ${stats.blocksToday}`,
  ];
  if (stats.lastError) msg.push('', `❌ Oxirgi xato: ${stats.lastError}`);
  // Faqat admin — texnik heartbeat
  const r = await broadcast(msg.join('\n'), { type: 'admin_only' });
  return r.sent > 0;
}

export function isTelegramConfigured(): boolean {
  return !!(API_BASE && config.TELEGRAM_CHAT_ID);
}

/**
 * Telegram getUpdates polling — foydalanuvchi buyruqlariga javob beradi.
 * /stats, /top, /blocks, /help
 */
type CommandHandler = () => Promise<string>;

/**
 * Yangi user'ni avto-ro'yxatga olish — /start bosilganda.
 * is_active=0 bilan qo'shadi (admin keyin yoqishi kerak).
 */
function autoRegisterUser(chatId: number, firstName: string, lastName: string, username: string): {
  isNew: boolean; isActive: boolean;
} {
  try {
    const db = openDb();
    const existing = db
      .prepare(`SELECT is_active FROM telegram_users WHERE chat_id = ?`)
      .get(String(chatId)) as { is_active: number } | undefined;
    if (existing) {
      return { isNew: false, isActive: !!existing.is_active };
    }
    const fullName = `${firstName} ${lastName}`.trim() || username || 'User';
    db.prepare(
      `INSERT INTO telegram_users (chat_id, full_name, username, role, regions, receive_alerts, receive_daily_report, receive_no_orders_alert, is_active, note)
       VALUES (?, ?, ?, 'viewer', NULL, 1, 0, 0, 0, '/start orqali ro\\'yxatga olindi')`,
    ).run(String(chatId), fullName, username || null);
    return { isNew: true, isActive: false };
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Auto-register xato');
    return { isNew: false, isActive: false };
  }
}

async function notifyAdminsOfNewUser(chatId: number, name: string, username: string): Promise<void> {
  const text = [
    '🆕 <b>Yangi foydalanuvchi ro\'yxatga olindi</b>',
    '',
    `👤 Ism: <b>${name}</b>`,
    username ? `🌐 Username: @${username}` : '',
    `🆔 Chat ID: <code>${chatId}</code>`,
    '',
    '📋 Admin sahifasidan tasdiqlang va hududlarni belgilang:',
    'Dashboard → Bot foydalanuvchilar → Tahrir → AKTIV qiling',
  ].filter(Boolean).join('\n');
  // Faqat admin'larga
  try {
    const db = openDb();
    const admins = db
      .prepare(`SELECT chat_id FROM telegram_users WHERE role = 'admin' AND is_active = 1`)
      .all() as Array<{ chat_id: string }>;
    for (const a of admins) {
      void sendToChat(a.chat_id, text);
    }
  } catch { /* ignore */ }
}

export async function startCommandLoop(
  handlers: Record<string, CommandHandler>,
): Promise<() => void> {
  if (!API_BASE) return () => {};
  let offset = 0;
  let stopped = false;

  const loop = async (): Promise<void> => {
    while (!stopped) {
      try {
        const resp = await fetch(`${API_BASE}/getUpdates?timeout=30&offset=${offset}`);
        const json = (await resp.json()) as {
          ok: boolean;
          result?: Array<{
            update_id: number;
            message?: {
              chat: { id: number };
              from?: { first_name?: string; last_name?: string; username?: string };
              text?: string;
            };
          }>;
        };
        if (!json.ok || !json.result) continue;
        for (const upd of json.result) {
          offset = Math.max(offset, upd.update_id + 1);
          const text = upd.message?.text?.trim();
          const chatId = upd.message?.chat?.id;
          const from = upd.message?.from ?? {};
          if (!text || !chatId) continue;

          // /start — avto-ro'yxatga olish
          if (text.startsWith('/start')) {
            const result = autoRegisterUser(
              chatId,
              from.first_name ?? '',
              from.last_name ?? '',
              from.username ?? '',
            );
            const name = `${from.first_name ?? ''} ${from.last_name ?? ''}`.trim() || from.username || 'Foydalanuvchi';
            let reply: string;
            if (result.isNew) {
              reply = [
                `👋 Salom, <b>${name}</b>!`,
                '',
                '✅ Siz <b>Royaltaxi AI</b> tizimiga ro\'yxatga olindingiz.',
                '',
                '⏳ <b>Hozir admin tasdiqlashi kutilmoqda.</b>',
                'Admin sizning hududlaringizni belgilab, akkauntingizni faollashtiradi.',
                '',
                `🆔 Sizning Chat ID: <code>${chatId}</code>`,
                '',
                '📞 Adminga bog\'laning yoki kutib turing.',
              ].join('\n');
              // Adminni xabardor qilamiz
              await notifyAdminsOfNewUser(chatId, name, from.username ?? '');
            } else if (result.isActive) {
              reply = [
                `👋 Salom, <b>${name}</b>!`,
                '',
                '✅ Siz allaqachon faol foydalanuvchisiz.',
                '',
                'Buyruqlar: /stats /top /blocks /help',
              ].join('\n');
            } else {
              reply = [
                `👋 Salom, <b>${name}</b>!`,
                '',
                '⏳ Sizning akkauntingiz hali tasdiqlanmagan.',
                'Admin tasdiqlashini kuting.',
                '',
                `🆔 Chat ID: <code>${chatId}</code>`,
              ].join('\n');
            }
            await sendToChat(String(chatId), reply);
            continue;
          }

          if (!text.startsWith('/')) continue;

          // Boshqa buyruqlar — faqat aktiv foydalanuvchilar uchun
          let isActive = false;
          try {
            const db = openDb();
            const row = db
              .prepare(`SELECT is_active FROM telegram_users WHERE chat_id = ?`)
              .get(String(chatId)) as { is_active: number } | undefined;
            isActive = !!row?.is_active;
          } catch { /* ignore */ }

          if (!isActive) {
            await sendToChat(
              String(chatId),
              '⏳ Sizning akkauntingiz hali tasdiqlanmagan. /start bilan ro\'yxatdan o\'ting yoki admin tasdiqlashini kuting.',
            );
            continue;
          }

          const cmd = text.split(/\s+/)[0]!.split('@')[0]!.toLowerCase();
          const handler = handlers[cmd];
          if (handler) {
            try {
              const reply = await handler();
              await sendToChat(String(chatId), reply);
            } catch (err) {
              log.warn({ err: (err as Error).message, cmd }, 'Buyruq handleri xato');
            }
          }
        }
      } catch (err) {
        log.warn({ err: (err as Error).message }, 'getUpdates xato');
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  };
  void loop();
  return () => {
    stopped = true;
  };
}
