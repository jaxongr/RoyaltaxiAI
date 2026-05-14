import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15_000,
});

// Sahifa qayta yuklanganda token ni qaytarish
const savedToken = localStorage.getItem('auth_token');
if (savedToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

// 401 — login sahifasiga yo'naltirish
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('auth_token');
      delete api.defaults.headers.common['Authorization'];
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

// ===== Types =====
export interface Overview {
  ordersToday: number;
  alertsToday: number;
  blocksTotal: number;
  alertsLastHour: number;
  secondsSinceLastTick: number | null;
  coveragePct: number | null;
  siteTotalToday: number | null;
  ourCountToday: number;
  tickCount: number;
  rate: number;
}

export interface RegionRow {
  region: string;
  orders: number;
  completed: number;
  cancelled: number;
  alerts: number;
  blocks: number;
  topDriver: string | null;
}

export interface DriverRow {
  callsign: string;
  driver_name: string;
  orders: number;
  completed: number;
  cancelled: number;
  alerts: number;
  total_score: number;
  is_blocked: number | null;
}

export interface AlertRow {
  id: number;
  order_id: number;
  callsign: string;
  driver_name: string;
  fraud_score: number;
  details: string;
  created_at: string;
  distance_km: number | null;
  duration_sec: number | null;
  amount: number | null;
  region: string | null;
  status?: string;
  action_taken?: string | null;
  action_by?: string | null;
  action_at?: string | null;
  action_note?: string | null;
}

export interface BlockRow {
  callsign: string;
  driver_name: string;
  alert_count: number;
  total_score: number;
  reason: string;
  blocked_at: string;
}

export interface OrderRow {
  order_id: number;
  callsign: string;
  driver_name: string;
  region: string | null;
  date: string;
  time: string;
  distance_km: number | null;
  duration_sec: number | null;
  amount: number | null;
  status: string;
  fraud_score: number;
  fraud_reasons: string | null;
  car: string | null;
  client_phone: string | null;
  address: string | null;
  tariff: string | null;
}

export interface ClientRow {
  client_phone: string;
  orders: number;
  distinct_drivers: number;
  top_driver: string;
  top_driver_count: number;
  regions: string;
}

export interface DriverFullRow {
  driver_id: string;
  callsign: string;
  first_name: string;
  last_name: string;
  fleet_name: string;
  balance: number | null;
  on_shift: number;
  lock_kind: string | null;
  lock_comment: string | null;
  whitelisted: number;
  phones: string;
  orders_count: number;
  alerts_count: number;
  is_blocked: number;
  subsidy_total: number;
}

export interface BlacklistMirrorRow {
  number_id: number;
  phone: string;
  enabled: number;
  scraped_at: string;
}

export interface AuditRow {
  id: number;
  action: string;
  target_type: string | null;
  target_id: string | null;
  actor: string | null;
  details: string | null;
  created_at: string;
}

export const fmtKm = (km: number | null | undefined): string => {
  if (km === null || km === undefined) return '—';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
};

export const fmtSek = (s: number | null | undefined): string => {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `${s} sek`;
  return `${Math.floor(s / 60)} daq ${s % 60} sek`;
};

export const fmtNarx = (n: number | null | undefined): string => {
  if (!n) return '—';
  return `${n.toLocaleString('ru-RU')} so'm`;
};

/**
 * SQLite vaqtni UZ vaqtida ko'rsatish.
 * - DB'dagi CURRENT_TIMESTAMP har doim UTC (SQLite default)
 * - "YYYY-MM-DD HH:MM:SS" formatda (T, Z yo'q) → UTC deb hisoblanadi
 * - ISO format (Z bilan) ham UTC sifatida tushuniladi
 * - Brauzer locale qaysi bo'lishidan qat'iy nazar — UZ vaqtida ko'rsatiladi
 */
function toUtcIso(ts: string): string {
  if (ts.includes('T')) {
    return ts.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(ts) ? ts : ts + 'Z';
  }
  // "2026-05-14 14:37:56" → "2026-05-14T14:37:56Z"
  return ts.replace(' ', 'T') + 'Z';
}

export const fmtTime = (ts: string | null | undefined): string => {
  if (!ts) return '—';
  return new Date(toUtcIso(ts)).toLocaleString('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Asia/Tashkent',
  });
};

export const fmtTimeShort = (ts: string | null | undefined): string => {
  if (!ts) return '—';
  return new Date(toUtcIso(ts)).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });
};

export const statusLabel = (s: string): string => {
  if (s === 'finish') return 'Bajarildi';
  if (s === 'order_cancelled') return 'Bekor qilindi';
  return s;
};

export const fraudTypeLabel = (t: string): string => {
  const map: Record<string, string> = {
    SOXTA_QISQA_MASOFA: 'Soxta qisqa masofa',
    QISQA_MASOFA: 'Qisqa masofa',
    JUDA_TEZ_YAKUN: 'Mijozga yetmasdan',
    SAYT_BELGISI: 'Sayt belgisi',
    TAKROR_QILMOQDA: 'Takror qilmoqda',
    OZIGA_OZI_ZAKAZ: "O'ziga o'zi zakaz",
    BOSHQA_SHUBHA: 'Boshqa',
  };
  return map[t] ?? t;
};
