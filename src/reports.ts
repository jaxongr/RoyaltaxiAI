import type { Database } from 'better-sqlite3';

export interface RegionStat {
  region: string;
  service: string;
  total: number;
  cancelled: number;
  finished: number;
  cancelRate: number;
}

export function regionStats(db: Database): RegionStat[] {
  const rows = db
    .prepare(
      `SELECT
        region,
        service,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'finish' THEN 1 ELSE 0 END) as finished
      FROM orders
      WHERE region != ''
      GROUP BY region, service
      ORDER BY total DESC`,
    )
    .all() as Array<{ region: string; service: string; total: number; cancelled: number; finished: number }>;
  return rows.map((r) => ({
    ...r,
    cancelRate: r.total > 0 ? Math.round((r.cancelled / r.total) * 1000) / 10 : 0,
  }));
}

export interface DriverStat {
  driver_name: string;
  total: number;
  cancelled: number;
  finished: number;
  cancelRate: number;
  totalRevenue: number;
}

export function topDrivers(db: Database, limit = 20): DriverStat[] {
  const rows = db
    .prepare(
      `SELECT
        driver_name,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'finish' THEN 1 ELSE 0 END) as finished,
        COALESCE(SUM(amount), 0) as totalRevenue
      FROM orders
      WHERE driver_name != ''
      GROUP BY driver_name
      HAVING total > 0
      ORDER BY total DESC
      LIMIT ?`,
    )
    .all(limit) as Array<{ driver_name: string; total: number; cancelled: number; finished: number; totalRevenue: number }>;
  return rows.map((r) => ({
    ...r,
    cancelRate: r.total > 0 ? Math.round((r.cancelled / r.total) * 1000) / 10 : 0,
  }));
}

export interface TopCancelDriver {
  driver_name: string;
  cancelled: number;
  total: number;
  cancelRate: number;
}

export function topCancelDrivers(db: Database, minOrders = 10): TopCancelDriver[] {
  const rows = db
    .prepare(
      `SELECT
        driver_name,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM orders
      WHERE driver_name != ''
      GROUP BY driver_name
      HAVING total >= ?
      ORDER BY (cancelled * 1.0 / total) DESC
      LIMIT 20`,
    )
    .all(minOrders) as Array<{ driver_name: string; total: number; cancelled: number }>;
  return rows.map((r) => ({
    ...r,
    cancelRate: Math.round((r.cancelled / r.total) * 1000) / 10,
  }));
}

export interface RepeatCustomer {
  client_phone: string;
  orders: number;
  uniqueDrivers: number;
  regions: string;
}

export function repeatCustomers(db: Database, minOrders = 5): RepeatCustomer[] {
  return db
    .prepare(
      `SELECT
        client_phone,
        COUNT(*) as orders,
        COUNT(DISTINCT driver_name) as uniqueDrivers,
        GROUP_CONCAT(DISTINCT region) as regions
      FROM orders
      WHERE client_phone != ''
      GROUP BY client_phone
      HAVING orders >= ?
      ORDER BY orders DESC
      LIMIT 30`,
    )
    .all(minOrders) as RepeatCustomer[];
}

export function byDate(db: Database): Array<{ date: string; total: number; cancelled: number }> {
  return db
    .prepare(
      `SELECT
        date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM orders
      GROUP BY date
      ORDER BY date DESC`,
    )
    .all() as Array<{ date: string; total: number; cancelled: number }>;
}

export function serviceBreakdown(db: Database): Array<{ service: string; total: number; cancelled: number }> {
  return db
    .prepare(
      `SELECT
        service,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'order_cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM orders
      WHERE service != ''
      GROUP BY service
      ORDER BY total DESC`,
    )
    .all() as Array<{ service: string; total: number; cancelled: number }>;
}
