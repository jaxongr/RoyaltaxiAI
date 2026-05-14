/**
 * Telegram bot integratsiyasi — shubhali zakaz, blok tavsiya va statusni yuboradi.
 * Token va chat ID .env'dan keladi. Token yo'q bo'lsa, sukut bilan o'tib ketadi.
 */
import { config } from './common/config.js';
import { childLogger } from './common/logger.js';

const log = childLogger('telegram');

const API_BASE = config.TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`
  : null;

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

  const lines = [
    head,
    '',
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

export async function sendTelegram(text: string): Promise<boolean> {
  if (!API_BASE || !config.TELEGRAM_CHAT_ID) {
    return false;
  }
  try {
    const resp = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      log.warn({ status: resp.status, body: body.slice(0, 300) }, 'Telegram yuborilmadi');
      return false;
    }
    return true;
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Telegram xato');
    return false;
  }
}

export async function sendAlert(a: AlertPayload): Promise<boolean> {
  return sendTelegram(formatAlert(a));
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
  return sendTelegram(msg);
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
  return sendTelegram(lines.join('\n'));
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
  return sendTelegram(msg);
}

export async function sendSiteRestored(downMinutes: number): Promise<boolean> {
  const msg = [
    `🟢 <b>SAYT QAYTDI</b>`,
    '',
    `Sayt ${downMinutes} daqiqa yopiq edi. Endi qayta ulandik va davom etamiz.`,
  ].join('\n');
  return sendTelegram(msg);
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
  return sendTelegram(msg.join('\n'));
}

export function isTelegramConfigured(): boolean {
  return !!(API_BASE && config.TELEGRAM_CHAT_ID);
}

/**
 * Telegram getUpdates polling — foydalanuvchi buyruqlariga javob beradi.
 * /stats, /top, /blocks, /help
 */
type CommandHandler = () => Promise<string>;

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
              text?: string;
            };
          }>;
        };
        if (!json.ok || !json.result) continue;
        for (const upd of json.result) {
          offset = Math.max(offset, upd.update_id + 1);
          const text = upd.message?.text?.trim();
          if (!text || !text.startsWith('/')) continue;
          const cmd = text.split(/\s+/)[0]!.split('@')[0]!.toLowerCase();
          const handler = handlers[cmd];
          if (handler) {
            try {
              const reply = await handler();
              await fetch(`${API_BASE}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: upd.message!.chat.id,
                  text: reply,
                  parse_mode: 'HTML',
                  disable_web_page_preview: true,
                }),
              });
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
