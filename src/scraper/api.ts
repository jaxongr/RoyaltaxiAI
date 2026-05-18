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
    serviceIds?: number[] | null;
    tariffIds?: number[] | null;
  },
): Promise<GetOrdersResponse> {
  return apiPost<GetOrdersResponse>(page, '/management/archive/get-orders', {
    officeIds: opts.officeIds ?? null,
    serviceIds: opts.serviceIds ?? null,
    tariffIds: opts.tariffIds ?? null,
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

/**
 * Loginga ruxsat etilgan barcha shaharlar (offices) va parklarni (fleets) qaytaradi.
 * Saytdagi "Подразделение" filteri shu endpointni chaqiradi.
 * Default holatda getOrders'da officeIds=null bo'lsa, sayt foydalanuvchi saqlagan
 * filtri (qaysi shaharlar belgilangan)dan foydalanadi — natijada ba'zi tumanlar
 * (masalan Poytug') tushib qoladi. Buni oldini olish uchun bu yerdan barcha
 * accessible officeId'larni olib, ularning hammasini getOrders ga uzatamiz.
 */
export interface OfficeWithFleets {
  officeId: number;
  name: string;
  fleets: Array<{ fleetId: number; name: string }>;
}
export interface OfficesAndFleetsResponse {
  offices: OfficeWithFleets[];
}
async function apiGet<T>(page: Page, path: string): Promise<T> {
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
  }, `${config.ROYALTAXI_BASE_URL}${path}`);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`GET ${path} xato ${result.status}: ${result.body.slice(0, 200)}`);
  }
  return JSON.parse(result.body) as T;
}

export async function getAccessibleOffices(page: Page): Promise<OfficesAndFleetsResponse> {
  // HiveTaxi'da bir nechta endpoint office ro'yxatini qaytaradi — login'ning huquqlariga
  // qarab birortasi javob beradi. Birinchi muvaffaqiyatli (bo'sh bo'lmagan) javobni
  // ishlatamiz. POST bilan boshlaymiz, keyin GET fallbacklar.
  const candidates: Array<{ method: 'POST' | 'GET'; path: string }> = [
    // Archive sahifa filteri (eng ehtimoliy)
    { method: 'POST', path: '/management/archive/get-offices' },
    { method: 'GET',  path: '/management/archive/get-offices' },
    { method: 'POST', path: '/management/archive/get-fleets' },
    { method: 'GET',  path: '/management/archive/get-fleets' },
    { method: 'POST', path: '/management/archive/get-filters' },
    { method: 'GET',  path: '/management/archive/get-filters' },
    // Fleet sahifalari (eski recon)
    { method: 'POST', path: '/management/fleet/vehicles-map/get-fleets' },
    { method: 'GET',  path: '/management/fleet/plans/fleets' },
    { method: 'GET',  path: '/management/fleet/cars/fleets' },
    { method: 'GET',  path: '/management/fleet/settings/fleets' },
    { method: 'GET',  path: '/management/fleet/options/fleets' },
    // Drivers (boshqa nom — flat fleet list)
    { method: 'GET',  path: '/management/fleet/drivers/get-fleets' },
  ];

  for (const c of candidates) {
    try {
      const resp = c.method === 'POST'
        ? await apiPost<OfficesAndFleetsResponse>(page, c.path, {})
        : await apiGet<OfficesAndFleetsResponse>(page, c.path);
      if (resp?.offices && resp.offices.length > 0) {
        return resp;
      }
    } catch {
      // shu endpoint javob bermadi — keyingisiga o'tamiz
    }
  }

  // Fallback: DOM/HTML'dan officeId'larni chiqarib olamiz.
  // Sayt'ning Подразделение filteri archive sahifa'da render bo'ladi,
  // officeId'lar HTML/script'da JSON sifatida joylashgan bo'lishi mumkin.
  try {
    const fromDom = await extractOfficesFromDom(page);
    if (fromDom.offices.length > 0) return fromDom;
  } catch { /* ignore */ }

  return { offices: [] };
}

async function extractOfficesFromDom(page: Page): Promise<OfficesAndFleetsResponse> {
  const result = await page.evaluate(() => {
    const found = new Map<string, string>(); // officeId → name

    // 1) Har qanday select option ichida officeId-ga o'xshash value
    document.querySelectorAll('option').forEach((opt) => {
      const v = opt.getAttribute('value') ?? '';
      const t = (opt.textContent ?? '').trim();
      if (/^\d{15,20}$/.test(v) && t && t.length > 1) {
        found.set(v, t);
      }
    });

    // 2) data-* atributlari
    document.querySelectorAll('[data-office-id], [data-officeid], [data-id]').forEach((el) => {
      const id =
        el.getAttribute('data-office-id') ??
        el.getAttribute('data-officeid') ??
        el.getAttribute('data-id') ??
        '';
      const t = (el.textContent ?? '').trim();
      if (/^\d{15,20}$/.test(id) && t && t.length > 1 && t.length < 100) {
        // birinchi qator nomi
        const name = t.split('\n')[0]!.trim();
        if (name) found.set(id, name);
      }
    });

    // 3) HTML/script ichidagi JSON pattern
    const html = document.documentElement.innerHTML;
    // {"officeId":239000...,"name":"..."}
    const re1 = /"officeId"\s*:\s*(\d{15,20})\s*,\s*"name"\s*:\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re1.exec(html)) !== null) {
      found.set(m[1]!, m[2]!);
    }
    // {"id":239000...,"name":"..."} (umumiyroq)
    const re2 = /"id"\s*:\s*(\d{15,20})\s*,\s*"name"\s*:\s*"([^"]+)"/g;
    while ((m = re2.exec(html)) !== null) {
      // faqat hali yo'q bo'lganlarini qo'shamiz (xato false positivelarni kamaytirish uchun)
      if (!found.has(m[1]!)) found.set(m[1]!, m[2]!);
    }

    return Array.from(found.entries()).map(([id, name]) => ({ officeId: id, name }));
  });

  const offices: OfficeWithFleets[] = result.map((r) => ({
    officeId: Number(r.officeId),
    name: r.name,
    fleets: [],
  }));
  return { offices };
}

export interface GpsPoint {
  lat: number;
  lng: number;
  ts?: string;
  speed?: number;
}

export interface OrderRouteResponse {
  points?: GpsPoint[];
  driverRoute?: GpsPoint[];
  route?: GpsPoint[];
  [k: string]: unknown;
}

export async function getOrderRoute(
  page: Page,
  orderId: number,
): Promise<OrderRouteResponse> {
  return apiPost<OrderRouteResponse>(page, '/management/archive/get-order-route', {
    orderId,
  });
}

/**
 * GPS chiziqdan max va o'rtacha tezlikni hisoblash (km/soat).
 * Haversine formula.
 */
export function analyzeGpsSpeed(points: GpsPoint[]): {
  maxSpeed: number;
  avgSpeed: number;
  totalKm: number;
  pointCount: number;
} {
  if (points.length < 2) return { maxSpeed: 0, avgSpeed: 0, totalKm: 0, pointCount: points.length };

  let maxSpeed = 0;
  let totalKm = 0;
  let totalSec = 0;

  const R = 6371; // Earth radius km
  const toRad = (d: number): number => (d * Math.PI) / 180;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (!a.lat || !b.lat) continue;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const dist = 2 * R * Math.asin(Math.sqrt(h));
    totalKm += dist;

    const ta = a.ts ? new Date(a.ts).getTime() : 0;
    const tb = b.ts ? new Date(b.ts).getTime() : 0;
    if (ta > 0 && tb > 0 && tb > ta) {
      const sec = (tb - ta) / 1000;
      totalSec += sec;
      const speed = (dist / sec) * 3600; // km/soat
      if (speed > maxSpeed && speed < 300) maxSpeed = speed; // 300+ noise
    }
  }

  const avgSpeed = totalSec > 0 ? (totalKm / totalSec) * 3600 : 0;
  return {
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    avgSpeed: Math.round(avgSpeed * 10) / 10,
    totalKm: Math.round(totalKm * 100) / 100,
    pointCount: points.length,
  };
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
  const service = svcMatch?.[2] ?? svcRaw.trim();
  const tariff = details?.tariff ?? '';
  const address = list.route?.join(' → ') ?? '';
  // Region: avval service brackets'idan, agar yo'q bo'lsa — address'ning birinchi qismidan
  // ("Пойтуг, Кушкуприк" → "Пойтуг"; "Андижан, Тош питак → Пойтуг, X" → "Андижан")
  let region = svcMatch?.[1]?.trim() ?? '';
  if (!region && address) {
    // birinchi route nuqtasidagi vergulgacha bo'lgan qism
    const firstRoute = list.route?.[0] ?? '';
    const commaIdx = firstRoute.indexOf(',');
    if (commaIdx > 0) {
      const candidate = firstRoute.slice(0, commaIdx).trim();
      // 2-50 belgi va alfa-numeric (geo nomi)
      if (candidate.length >= 2 && candidate.length <= 50) {
        region = candidate;
      }
    }
  }
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
