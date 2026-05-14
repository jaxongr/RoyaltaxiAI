/**
 * Haydovchilar va mashinalar API — saytdan to'liq ro'yxat tortish.
 * Endpointlar:
 *   POST /management/fleet/drivers/get-drivers
 *   POST /management/fleet/drivers/get-driver-details
 *   POST /management/fleet/drivers/get-lock-kinds
 *   GET  /management/fleet/drivers/get-fleets
 */
import type { Page } from 'playwright';
import { apiPost } from './api.js';

interface DriverItem {
  id: string;
  callsign?: string;
  firstName?: string;
  lastName?: string;
  groupNames?: { officeName?: string; fleetName?: string };
  fleetId?: string | number;
  officeId?: string | number;
  onShift?: boolean;
  locked?: boolean;
}

interface GetDriversResponse {
  state: { items: DriverItem[]; total?: number };
}

export interface DriverDetails {
  driverId: string;
  officeId: number;
  fleetId: number;
  firstName: string;
  lastName: string;
  lock?: { kind?: string; comment?: string };
  onShift?: boolean;
  account?: { balance: number };
  phones?: string[];
  callsign?: string;
}

export interface LockKind {
  kindId: string;
  name: string;
}

export async function getDrivers(
  page: Page,
  opts: {
    offset?: number;
    limit?: number;
    query?: string;
    fleetId?: string | null;
    officeId?: string | null;
    onShift?: ('true' | 'false')[];
    locked?: ('true' | 'false')[];
  } = {},
): Promise<GetDriversResponse> {
  return apiPost<GetDriversResponse>(page, '/management/fleet/drivers/get-drivers', {
    fleet: { officeId: opts.officeId ?? null, fleetId: opts.fleetId ?? null },
    query: opts.query ?? '',
    onShift: opts.onShift ?? [],
    online: [],
    onModeration: [],
    locked: opts.locked ?? [],
    status: [],
    dismissed: false,
    offset: opts.offset ?? 0,
    limit: opts.limit ?? 100,
    includingDocuments: false,
    needPhotoInspection: false,
  });
}

export async function getDriverDetails(
  page: Page,
  driverId: string,
  fleetId: string | number,
  officeId: string | number,
): Promise<DriverDetails> {
  return apiPost<DriverDetails>(page, '/management/fleet/drivers/get-driver-details', {
    driverId,
    fleetId,
    officeId,
  });
}

export async function getLockKinds(page: Page): Promise<{ kinds: LockKind[] }> {
  return apiPost<{ kinds: LockKind[] }>(page, '/management/fleet/drivers/get-lock-kinds', {});
}

/**
 * Haydovchini bloklash. Royaltaxi panelidagi "Блок" tugmasi qiladigan ish.
 * @param due - bloklash muddati. null = abadiy. ISO date string = shu vaqtga qadar.
 * @param kind - bloklash sababi (lock kind id, masalan "moderation")
 * @param comment - izoh (sayt admin'ga ko'rinadi)
 */
export async function lockDriver(
  page: Page,
  args: { officeId: string | number; driverId: string; kind: string; comment: string; due?: string | null },
): Promise<unknown> {
  return apiPost(page, '/management/fleet/drivers/lock-driver', {
    officeId: args.officeId,
    driverId: args.driverId,
    kind: args.kind,
    comment: args.comment,
    due: args.due ?? null,
  });
}

export async function unlockDriver(
  page: Page,
  args: { officeId: string | number; driverId: string },
): Promise<unknown> {
  return apiPost(page, '/management/fleet/drivers/unlock-driver', {
    officeId: args.officeId,
    driverId: args.driverId,
  });
}

interface Fleet {
  name: string;
  fleetId: number;
}

export async function getFleets(page: Page): Promise<{ fleets: Fleet[] }> {
  const result = await page.evaluate(async (url: string) => {
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrf = csrfMeta?.getAttribute('content') ?? '';
    const xsrfCookie = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('XSRF-TOKEN='));
    const xsrf = xsrfCookie
      ? decodeURIComponent(xsrfCookie.substring('XSRF-TOKEN='.length))
      : '';
    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-CSRF-TOKEN': csrf,
        'X-XSRF-TOKEN': xsrf,
        'X-API-Request': 'true',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json, text/plain, */*',
      },
    });
    return { status: resp.status, body: await resp.text() };
  }, '/management/fleet/drivers/get-fleets');
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`get-fleets xato ${result.status}: ${result.body.slice(0, 200)}`);
  }
  return JSON.parse(result.body) as { fleets: Fleet[] };
}
