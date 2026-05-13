/**
 * Mijoz telefon qora ro'yxati API.
 * Endpointlar:
 *   POST /management/settings/blacklist/get-black-list
 *   POST /management/settings/blacklist/get-history
 */
import type { Page } from 'playwright';
import { apiPost } from './api.js';

interface BlacklistEntry {
  enabled: boolean;
  number: number;
  numberId: number;
}

interface BlacklistResponse {
  numbers: BlacklistEntry[];
}

interface HistoryEntry {
  actionDate: string;
  action: 'add' | 'disable' | 'enable' | 'remove';
  employee: { firstName: string; lastName: string };
  comment: string;
}

export async function getBlacklist(
  page: Page,
  opts: { perPage?: number; idAfter?: number | null; enabled?: boolean | null; pattern?: string | null } = {},
): Promise<BlacklistResponse> {
  return apiPost<BlacklistResponse>(page, '/management/settings/blacklist/get-black-list', {
    perPage: opts.perPage ?? 200,
    idAfter: opts.idAfter ?? null,
    enabled: opts.enabled ?? null,
    pattern: opts.pattern ?? null,
  });
}

export async function getBlacklistHistory(
  page: Page,
  number: number,
): Promise<{ history: HistoryEntry[] }> {
  return apiPost<{ history: HistoryEntry[] }>(
    page,
    '/management/settings/blacklist/get-history',
    { number },
  );
}
