import { Card, Table, Tag, Row, Col, Statistic, Select, Empty, Tooltip, Progress } from 'antd';
import { LineChartOutlined, EnvironmentOutlined, CalendarOutlined, RiseOutlined, FireOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  api,
  fmtNarx,
  type RegionStatsRow,
  type DailyStatsRow,
  type ForecastResponse,
  type HeatmapResponse,
} from '../lib/api';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAY_FULL = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

const WEEKDAY_NAMES = ['Yak', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha'];

export default function AnalyticsPage(): JSX.Element {
  const [regionDays, setRegionDays] = useState(7);
  const [dailyDays, setDailyDays] = useState(30);
  const [heatmapDays, setHeatmapDays] = useState(30);

  const { data: heatmap } = useQuery<HeatmapResponse>({
    queryKey: ['heatmap', heatmapDays],
    queryFn: () => api.get('/heatmap', { params: { days: heatmapDays } }).then((r) => r.data),
    refetchInterval: 5 * 60_000,
  });

  const { data: regionData, isFetching: regionLoading } = useQuery<{ items: RegionStatsRow[] }>({
    queryKey: ['region-stats', regionDays],
    queryFn: () => api.get('/region-stats', { params: { days: regionDays } }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: dailyData, isFetching: dailyLoading } = useQuery<{ items: DailyStatsRow[] }>({
    queryKey: ['daily-stats', dailyDays],
    queryFn: () => api.get('/daily-stats', { params: { days: dailyDays } }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: forecast } = useQuery<ForecastResponse>({
    queryKey: ['forecast'],
    queryFn: () => api.get('/forecast').then((r) => r.data),
    refetchInterval: 5 * 60_000,
  });

  const maxDailyOrders = Math.max(1, ...(dailyData?.items ?? []).map((d) => d.orders));

  return (
    <div>
      <Card
        title={
          <span>
            <RiseOutlined /> Ertaga uchun bashorat
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        {forecast ? (
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Statistic
                title={`Ertaga (${forecast.weekdayName})`}
                value={forecast.tomorrow}
                valueStyle={{ fontSize: 18 }}
              />
            </Col>
            <Col xs={24} md={6}>
              <Statistic
                title="Taxminiy zakaz"
                value={forecast.predictedOrders}
                valueStyle={{ color: '#1677ff', fontSize: 28 }}
                suffix="ta"
              />
            </Col>
            <Col xs={24} md={6}>
              <Statistic
                title="Taxminiy aktiv haydovchi"
                value={forecast.predictedDrivers}
                valueStyle={{ color: '#52c41a', fontSize: 28 }}
                suffix="ta"
              />
            </Col>
            <Col xs={24} md={6}>
              <div style={{ fontSize: 12, color: '#6B7280' }}>
                <div>📊 Hafta kuni o'rtachasi: <b>{forecast.basedOn.avgSameWeekday}</b></div>
                <div>📈 Oxirgi 7 kun o'rtachasi: <b>{forecast.basedOn.avgLast7}</b></div>
                <div style={{ marginTop: 4 }}>
                  Formula: 60% hafta kuni + 40% oxirgi 7 kun
                </div>
              </div>
            </Col>
          </Row>
        ) : (
          <Empty />
        )}
      </Card>

      <Card
        title={<span><FireOutlined /> Soat × Hafta kuni Heatmap</span>}
        extra={
          <Select
            value={heatmapDays}
            onChange={setHeatmapDays}
            style={{ width: 160 }}
            options={[
              { value: 7, label: 'Oxirgi 7 kun' },
              { value: 14, label: '14 kun' },
              { value: 30, label: '30 kun' },
              { value: 60, label: '60 kun' },
            ]}
          />
        }
        style={{ marginBottom: 16 }}
      >
        <p style={{ color: '#6B7280', marginBottom: 12 }}>
          Yashilroq — zakaz ko'p. Bo'sh — zakaz yo'q yoki kam. Qaysi soatda haydovchi yetishmasligini ko'rsatadi.
        </p>
        {heatmap ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ padding: '4px 8px', textAlign: 'left' }}></th>
                  {HOURS.map((h) => (
                    <th key={h} style={{ padding: '4px 6px', minWidth: 32, textAlign: 'center', color: '#6B7280' }}>
                      {h.toString().padStart(2, '0')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                  <tr key={wd}>
                    <td style={{ padding: '2px 8px', fontWeight: 600, color: wd === 0 || wd === 6 ? '#F59E0B' : '#374151' }}>
                      {WEEKDAY_FULL[wd]}
                    </td>
                    {HOURS.map((h) => {
                      const cell = heatmap.matrix[wd]?.[h] ?? { orders: 0, drivers: 0 };
                      const intensity = heatmap.max > 0 ? cell.orders / heatmap.max : 0;
                      const bg = intensity === 0
                        ? '#F9FAFB'
                        : `rgba(22, 119, 255, ${Math.max(0.1, intensity)})`;
                      const color = intensity > 0.5 ? '#fff' : '#111';
                      return (
                        <Tooltip
                          key={h}
                          title={`${WEEKDAY_FULL[wd]} ${h}:00 — ${cell.orders} zakaz, ${cell.drivers} haydovchi`}
                        >
                          <td
                            style={{
                              padding: '6px 4px',
                              backgroundColor: bg,
                              color,
                              textAlign: 'center',
                              border: '1px solid #fff',
                              minWidth: 32,
                              fontWeight: intensity > 0.6 ? 600 : 400,
                            }}
                          >
                            {cell.orders || ''}
                          </td>
                        </Tooltip>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </Card>

      <Card
        title={
          <span>
            <EnvironmentOutlined /> Hududlar bo'yicha
          </span>
        }
        extra={
          <Select
            value={regionDays}
            onChange={setRegionDays}
            style={{ width: 160 }}
            options={[
              { value: 1, label: 'Bugun' },
              { value: 7, label: 'Oxirgi 7 kun' },
              { value: 30, label: '30 kun' },
              { value: 90, label: '90 kun' },
            ]}
          />
        }
        style={{ marginBottom: 16 }}
      >
        <p style={{ color: '#6B7280', marginBottom: 12 }}>
          Har bir hududda nechta haydovchi ishladi, nechta zakaz oldi, qancha summa qildi.
        </p>
        <Table<RegionStatsRow>
          size="middle"
          rowKey="region"
          loading={regionLoading}
          dataSource={regionData?.items ?? []}
          pagination={{ pageSize: 30 }}
          locale={{ emptyText: <Empty /> }}
          columns={[
            { title: 'Hudud', dataIndex: 'region', render: (v) => <Tag color="blue">{v}</Tag> },
            {
              title: 'Aktiv haydovchi',
              dataIndex: 'active_drivers',
              sorter: (a, b) => a.active_drivers - b.active_drivers,
              render: (v) => <b>{v}</b>,
            },
            {
              title: 'Jami zakaz',
              dataIndex: 'orders',
              sorter: (a, b) => a.orders - b.orders,
              defaultSortOrder: 'descend',
            },
            {
              title: 'Bajarildi',
              dataIndex: 'completed',
              render: (v) => <Tag color="success">{v}</Tag>,
            },
            {
              title: 'Bekor',
              dataIndex: 'cancelled',
              render: (v) => (v > 0 ? <Tag color="warning">{v}</Tag> : '0'),
            },
            {
              title: 'Ogohlantirish',
              dataIndex: 'alerts_count',
              render: (v) => (v > 0 ? <Tag color="error">{v}</Tag> : '0'),
            },
            {
              title: 'Jami summa',
              dataIndex: 'total_amount',
              render: (v) => fmtNarx(v),
              sorter: (a, b) => a.total_amount - b.total_amount,
            },
            {
              title: 'Konversiya',
              render: (_, r) => {
                const pct = r.orders > 0 ? Math.round((r.completed / r.orders) * 100) : 0;
                return (
                  <Tooltip title={`${r.completed}/${r.orders}`}>
                    <Progress percent={pct} size="small" />
                  </Tooltip>
                );
              },
            },
          ]}
        />
      </Card>

      <Card
        title={
          <span>
            <CalendarOutlined /> Kunlar bo'yicha statistika
          </span>
        }
        extra={
          <Select
            value={dailyDays}
            onChange={setDailyDays}
            style={{ width: 160 }}
            options={[
              { value: 7, label: 'Oxirgi 7 kun' },
              { value: 14, label: '14 kun' },
              { value: 30, label: '30 kun' },
              { value: 60, label: '60 kun' },
              { value: 90, label: '90 kun' },
            ]}
          />
        }
      >
        <p style={{ color: '#6B7280', marginBottom: 12 }}>
          Har kuni nechta haydovchi ishladi va nechta zakaz qabul qilindi. Hafta kuni rangli.
        </p>
        <Table<DailyStatsRow>
          size="middle"
          rowKey="day"
          loading={dailyLoading}
          dataSource={dailyData?.items ?? []}
          pagination={{ pageSize: 30 }}
          locale={{ emptyText: <Empty /> }}
          columns={[
            {
              title: 'Sana',
              dataIndex: 'day',
              render: (v, r) => (
                <span>
                  <Tag color={r.weekday === 0 || r.weekday === 6 ? 'orange' : 'default'}>
                    {WEEKDAY_NAMES[r.weekday]}
                  </Tag>
                  {v}
                </span>
              ),
            },
            {
              title: 'Aktiv haydovchi',
              dataIndex: 'active_drivers',
              render: (v) => <b>{v}</b>,
              sorter: (a, b) => a.active_drivers - b.active_drivers,
            },
            {
              title: 'Jami zakaz',
              dataIndex: 'orders',
              render: (v) => (
                <div style={{ minWidth: 120 }}>
                  <Progress
                    percent={Math.round((v / maxDailyOrders) * 100)}
                    size="small"
                    format={() => v.toString()}
                    strokeColor="#1677ff"
                  />
                </div>
              ),
              sorter: (a, b) => a.orders - b.orders,
            },
            {
              title: 'Bajarildi',
              dataIndex: 'completed',
              render: (v) => <Tag color="success">{v}</Tag>,
            },
            {
              title: 'Bekor',
              dataIndex: 'cancelled',
              render: (v) => (v > 0 ? <Tag color="warning">{v}</Tag> : '0'),
            },
            {
              title: 'Hududlar',
              dataIndex: 'regions',
            },
            {
              title: 'Jami summa',
              dataIndex: 'total_amount',
              render: (v) => fmtNarx(v),
              sorter: (a, b) => a.total_amount - b.total_amount,
            },
          ]}
        />
      </Card>

      <Card
        title={
          <span>
            <LineChartOutlined /> Bashorat asoslari
          </span>
        }
        style={{ marginTop: 16 }}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <h4>📅 O'tgan {forecast?.weekdayName ?? '...'} kunlari</h4>
            <Table
              size="small"
              rowKey="date"
              dataSource={forecast?.basedOn.sameWeekdayDays ?? []}
              pagination={false}
              columns={[
                { title: 'Sana', dataIndex: 'date' },
                { title: 'Zakaz', dataIndex: 'orders' },
                { title: 'Haydovchi', dataIndex: 'drivers' },
              ]}
            />
          </Col>
          <Col xs={24} md={12}>
            <h4>📈 Oxirgi 7 kun</h4>
            <Table
              size="small"
              rowKey="date"
              dataSource={forecast?.basedOn.last7 ?? []}
              pagination={false}
              columns={[
                { title: 'Sana', dataIndex: 'date' },
                { title: 'Zakaz', dataIndex: 'orders' },
                { title: 'Haydovchi', dataIndex: 'drivers' },
              ]}
            />
          </Col>
        </Row>
      </Card>
    </div>
  );
}
