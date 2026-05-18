import 'dotenv/config';
import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

// AUTH_SECRET — agar .env'da yo'q bo'lsa, faylda saqlanadi (restart'larda saqlanadi)
// Bu sessiyalarni saqlab qolish uchun. Date.now() default avval bu ishni buzgan edi.
const SECRET_FILE = resolve(process.cwd(), '.auth-secret');
function getOrCreateSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (existsSync(SECRET_FILE)) {
    try {
      const v = readFileSync(SECRET_FILE, 'utf-8').trim();
      if (v.length >= 32) return v;
    } catch { /* ignore */ }
  }
  const fresh = randomBytes(48).toString('base64url');
  try {
    writeFileSync(SECRET_FILE, fresh, { mode: 0o600 });
  } catch { /* ignore */ }
  return fresh;
}

const EnvSchema = z.object({
  ROYALTAXI_USERNAME: z.string().min(1, 'ROYALTAXI_USERNAME bo\'sh bo\'lmasligi kerak'),
  ROYALTAXI_PASSWORD: z.string().min(1, 'ROYALTAXI_PASSWORD bo\'sh bo\'lmasligi kerak'),
  ROYALTAXI_BASE_URL: z
    .string()
    .url('ROYALTAXI_BASE_URL to\'liq URL bo\'lishi kerak')
    .default('https://hive-respublika-new.royaltaxi.uz'),
  GEMINI_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('Royaltaxi2026'),
  AUTH_SECRET: z.string().default(getOrCreateSecret()),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  BROWSER_HEADLESS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export type AppConfig = z.infer<typeof EnvSchema>;

function loadConfig(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    const message = `\n[config] .env validatsiyasi xato:\n${issues}\n\n.env.example ni .env ga nusxalab to'ldiring.\n`;
    throw new Error(message);
  }

  return parsed.data;
}

export const config: AppConfig = loadConfig();

export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';

// Production'da default admin parol bilan ishlatish XAVFLI — warn log
if (isProduction && config.ADMIN_PASSWORD === 'Royaltaxi2026') {
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  XAVFSIZLIK OGOHLANTIRISHI:\n' +
    '   ADMIN_PASSWORD default qiymatda (Royaltaxi2026)!\n' +
    '   Bu kodda ochiq yozilgan. Birovga ma\'lum bo\'lsa, kira oladi.\n' +
    '   /opt/royaltaxi/.env faylida ADMIN_PASSWORD ni o\'zgartiring.\n',
  );
}
