/**
 * UZ PC dan Germaniya serverga royaltaxi.db ni har N daqiqada yuklash.
 * Foydalanish:
 *   npm run sync-server
 *
 * Talablar:
 *   - .env da SERVER_HOST, SERVER_USER, SERVER_PASSWORD, SERVER_PATH
 *   - PuTTY pscp yo'lda bo'lishi kerak (C:\Program Files\PuTTY\pscp.exe)
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH } from './db.js';
import { logger } from './common/logger.js';

const exec = promisify(execFile);

const SERVER_HOST = process.env.SERVER_HOST ?? '173.212.216.167';
const SERVER_USER = process.env.SERVER_USER ?? 'root';
const SERVER_PASSWORD = process.env.SERVER_PASSWORD ?? '';
const SERVER_PATH = process.env.SERVER_PATH ?? '/opt/royaltaxi/royaltaxi.db';
const SERVER_HOST_KEY = process.env.SERVER_HOST_KEY ?? '';

const INTERVAL_MIN = parseInt(process.env.SYNC_INTERVAL_MIN ?? '5', 10);

const PSCP_PATHS = [
  'C:\\Program Files\\PuTTY\\pscp.exe',
  'C:\\Program Files (x86)\\PuTTY\\pscp.exe',
  'pscp.exe',
  'pscp',
];

const PLINK_PATHS = [
  'C:\\Program Files\\PuTTY\\plink.exe',
  'C:\\Program Files (x86)\\PuTTY\\plink.exe',
  'plink.exe',
  'plink',
];

function findExec(paths: string[]): string | null {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

const TMP_DB_PATH = resolve(dirname(DB_PATH), 'royaltaxi-sync.db');

/**
 * Live DB ni vaqtincha faylga backup qiladi (monitor to'xtamaydi).
 * better-sqlite3 .backup() — atomic, lock qilmasdan ishlaydi.
 */
async function createBackup(): Promise<{ ok: boolean; sizeBytes: number; durationMs: number }> {
  const t0 = Date.now();
  // Eski backup faylini o'chir
  if (existsSync(TMP_DB_PATH)) {
    try { unlinkSync(TMP_DB_PATH); } catch { /* ignore */ }
  }
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    // WAL checkpoint (try, lock olmasa o'tamiz)
    try { db.pragma('wal_checkpoint(PASSIVE)'); } catch { /* ignore */ }
    await db.backup(TMP_DB_PATH);
    const size = statSync(TMP_DB_PATH).size;
    return { ok: true, sizeBytes: size, durationMs: Date.now() - t0 };
  } finally {
    db.close();
  }
}

async function uploadDb(pscp: string, sourcePath: string): Promise<{ ok: boolean; ms: number; sizeBytes: number }> {
  if (!SERVER_PASSWORD) {
    throw new Error('SERVER_PASSWORD .env da yo\'q');
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`DB topilmadi: ${sourcePath}`);
  }
  const args: string[] = ['-batch', '-pw', SERVER_PASSWORD];
  if (SERVER_HOST_KEY) {
    args.push('-hostkey', SERVER_HOST_KEY);
  }
  // .tmp ga yuborib server'da rename qilamiz (atomicness uchun)
  const tmpRemote = `${SERVER_PATH}.tmp`;
  args.push(sourcePath, `${SERVER_USER}@${SERVER_HOST}:${tmpRemote}`);

  const t0 = Date.now();
  const { stdout, stderr } = await exec(pscp, args, { maxBuffer: 64 * 1024 * 1024 });
  const ms = Date.now() - t0;
  const sizeBytes = statSync(sourcePath).size;
  if (stderr && /error|fail|denied/i.test(stderr)) {
    throw new Error(stderr.slice(0, 300));
  }
  void stdout; // ignored
  return { ok: true, ms, sizeBytes };
}

/**
 * Server'da .tmp faylni asosiy nomga rename qilish (atomic).
 * Plink orqali bitta SSH buyrug'i.
 */
async function finalizeOnServer(plink: string): Promise<void> {
  const args: string[] = ['-batch', '-pw', SERVER_PASSWORD];
  if (SERVER_HOST_KEY) args.push('-hostkey', SERVER_HOST_KEY);
  args.push(`${SERVER_USER}@${SERVER_HOST}`, `mv ${SERVER_PATH}.tmp ${SERVER_PATH}`);
  await exec(plink, args, { maxBuffer: 1024 * 1024 });
}

async function tick(pscp: string, plink: string): Promise<void> {
  const t0 = Date.now();
  try {
    const backup = await createBackup();
    logger.info(
      { mb: (backup.sizeBytes / 1024 / 1024).toFixed(1), durMs: backup.durationMs },
      'Backup yaratildi',
    );
    const result = await uploadDb(pscp, TMP_DB_PATH);
    await finalizeOnServer(plink);
    if (existsSync(TMP_DB_PATH)) {
      try { unlinkSync(TMP_DB_PATH); } catch { /* ignore */ }
    }
    const mb = (result.sizeBytes / 1024 / 1024).toFixed(1);
    const sec = Math.round(result.ms / 1000);
    const rate = ((result.sizeBytes / 1024) / Math.max(1, result.ms / 1000)).toFixed(0);
    logger.info(
      { mb: `${mb}MB`, durationSec: sec, rateKBps: rate, totalMs: Date.now() - t0 },
      '✅ DB serverga yuklandi va rename qilindi',
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, '❌ Sync xato');
  }
}

async function main(): Promise<void> {
  const pscp = findExec(PSCP_PATHS);
  const plink = findExec(PLINK_PATHS);
  if (!pscp || !plink) {
    logger.fatal('PuTTY topilmadi! O\'rnating: https://www.putty.org/');
    process.exit(1);
  }
  logger.info(
    { pscp, host: SERVER_HOST, path: SERVER_PATH, intervalMin: INTERVAL_MIN },
    'Server sync boshlandi',
  );

  let syncing = false;
  const runTick = async (): Promise<void> => {
    if (syncing) {
      logger.warn('Avvalgi sync hali tugamadi — keyingi skip');
      return;
    }
    syncing = true;
    try {
      await tick(pscp, plink);
    } finally {
      syncing = false;
    }
  };

  // birinchi tick darhol
  await runTick();

  setInterval(() => {
    void runTick();
  }, INTERVAL_MIN * 60 * 1000);

  // never resolves
  await new Promise<void>(() => {});
}

process.on('SIGINT', () => {
  logger.info('SIGINT — sync toxtatildi');
  process.exit(0);
});

void main();
