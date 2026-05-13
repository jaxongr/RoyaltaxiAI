/**
 * API-driven scraper — UI click o'rniga to'g'ridan-to'g'ri JSON REST
 * chaqiradi. 10-100x tezroq.
 */
import type { Page } from 'playwright';
import { config } from '../common/config.js';

interface GetOrdersItem {
  orderId: number;
  source: string;
  deferred: boolean;
  dateFinished?: string;
  route?: string[];
  paymentMethod?: string;
  completed: boolean;
  assignee?: {
    driverFirstName?: string;
    driverLastName?: string;
    driverCallSign?: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    vehicleNumber?: string;
  };
}

interface GetOrdersResponse {
  state: { items: GetOrdersItem[]; total?: number; totalCount?: number };
}

interface OrderDetailsResponse {
  orderId: number;
  source: string;
  time: string;
  isDriverCrook?: boolean;
  service: string;
  tariff: string;
  client: { name: string; phone: string };
  route: string[];
  carOptions?: unknown[];
  payment?: {
    cost?: number;
    taximeterDistance?: number;
    isFamily?: boolean;
    showReceipt?: boolean;
    isKaspiPay?: boolean;
  };
  completed: boolean;
  cancelCause?: { kind: string; comment?: string };
  assignee?: {
    callSign?: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    vehicleNumber?: string;
    phones?: string[];
  };
  submissionTime?: string;
  finishTime?: string;
}

export async function apiPost<T>(page: Page, path: string, body: unknown): Promise<T> {
  const result = await page.evaluate(
    async ({ url, body }) => {
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
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'X-CSRF-TOKEN': csrf,
          'X-XSRF-TOKEN': xsrf,
          'X-API-Request': 'true',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json, text/plain, */*',
        },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      return { status: resp.status, body: text, finalUrl: resp.url };
    },
    { url: `${config.ROYALTAXI_BASE_URL}${path}`, body },
  );
  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `API xato ${result.status} (finalUrl=${result.finalUrl}): ${result.body.slice(0, 300)}`,
    );
  }
  return JSON.parse(result.body) as T;
}

export async function getOrders(
  page: Page,
  opts: {
    offset: number;
    limit: number;
    periodStart: string;
    periodEnd: string;
    statuses?: string[];
    officeIds?: number[] | null;
  },
): Promise<GetOrdersResponse> {
  return apiPost<GetOrdersResponse>(page, '/management/archive/get-orders', {
    officeIds: opts.officeIds ?? null,
    serviceIds: null,
    tariffIds: null,
    sources: [],
    paymentMethods: [],
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    driver: '',
    deferred: [true, false],
    status: opts.statuses ?? [],
    clientPhone: '',
    submissionAddress: '',
    destinationAddress: '',
    orderId: null,
    offset: opts.offset,
    limit: opts.limit,
    driverId: null,
    vehicleId: null,
    driverChangedRoute: [],
    incompletePoints: [],
    driverPaidForOrder: [true, false],
  });
}

export async function getOrderDetails(
  page: Page,
  orderId: number,
): Promise<OrderDetailsResponse> {
  return apiPost<OrderDetailsResponse>(page, '/management/archive/get-order-details', {
    orderId,
  });
}

export interface DbOrderRow {
  callsign: string;
  date: string;
  time: string;
  region: string;
  service: string;
  tariff: string;
  address: string;
  driver_name: string;
  car: string;
  client_phone: string;
  driver_phones: string;
  amount: number | null;
  distance_km: number | null;
  status: string;
  raw_text: string;
  order_id: number;
  is_driver_crook: number;
  submission_time: string | null;
  finish_time: string | null;
  duration_sec: number | null;
  source: string | null;
  cancel_kind: string | null;
  cancel_comment: string | null;
}

export function toDbOrder(
  list: GetOrdersItem,
  details: OrderDetailsResponse | null,
): DbOrderRow {
  const a = list.assignee ?? {};
  const da = details?.assignee ?? {};
  // Service like "Яккабаг [BonusTaxi]" → region + service
  const svcRaw = details?.service ?? '';
  const svcMatch = svcRaw.match(/^(.+?)\s*\[(BizningTaxi|BonusTaxi|Royal)\]$/);
  const region = svcMatch?.[1]?.trim() ?? '';
  const service = svcMatch?.[2] ?? '';
  const tariff = details?.tariff ?? '';
  const address = list.route?.join(' → ') ?? '';
  const clientPhone = details?.client?.phone ?? '';
  const dateFinished = list.dateFinished ?? details?.time ?? '';
  const [datePart, timePartFull] = dateFinished.split('T');
  const timePart = (timePartFull ?? '').slice(0, 5);
  const car = [a.vehicleBrand, a.vehicleModel, a.vehicleColor, a.vehicleNumber]
    .filter(Boolean)
    .join(' ');
  const driverName = `${a.driverLastName ?? ''} ${a.driverFirstName ?? ''}`.trim();
  const status =
    list.completed === false
      ? details?.cancelCause
        ? 'order_cancelled'
        : 'unknown'
      : 'finish';
  const cost = details?.payment?.cost;
  const dist = details?.payment?.taximeterDistance;
  const submission = details?.submissionTime ?? details?.time ?? null;
  const finish = details?.finishTime ?? list.dateFinished ?? null;
  let durationSec: number | null = null;
  if (submission && finish) {
    const s = new Date(submission).getTime();
    const f = new Date(finish).getTime();
    if (!isNaN(s) && !isNaN(f) && f >= s) durationSec = Math.round((f - s) / 1000);
  }

  return {
    callsign: a.driverCallSign ?? da.callSign ?? '',
    date: datePart ?? '',
    time: timePart,
    region,
    service,
    tariff,
    address,
    driver_name: driverName,
    car,
    client_phone: clientPhone,
    driver_phones: JSON.stringify(da.phones ?? []),
    amount: typeof cost === 'number' ? cost : null,
    distance_km: typeof dist === 'number' ? dist : null,
    status,
    raw_text: JSON.stringify({ list, details }).slice(0, 4000),
    order_id: list.orderId,
    is_driver_crook: details?.isDriverCrook === true ? 1 : 0,
    submission_time: submission,
    finish_time: finish,
    duration_sec: durationSec,
    source: list.source ?? null,
    cancel_kind: details?.cancelCause?.kind ?? null,
    cancel_comment: details?.cancelCause?.comment ?? null,
  };
}
