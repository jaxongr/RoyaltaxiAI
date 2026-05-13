import 'dotenv/config';
import { z } from 'zod';

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
