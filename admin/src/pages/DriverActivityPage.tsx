import { Card, Table, Tag, Empty, Row, Col, Statistic, Select, Input, Tooltip, Segmented } from 'antd';
import {
  TeamOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import {
  api,
  fmtNarx,
  type DriverActivityRow,
  type DriverRetentionResponse,
} from '../lib/api';

type FilterTab = 'all' | 'today' | 'week' | 'churned' | 'new' | 'blocked';

const STATUS_TAGS: Record<DriverActivityRow['activity_status'], { color: string; label: string }> = {
  aktiv_bugun: { color: 'success', label: '✅ Bugun ishladi' },
  aktiv_hafta: { color: 'processing', label: '⏰ Hafta ichida' },
  yoqotilgan: { color: 'error', label: '🚫 Yo\'qotilgan' },
  kutmoqda: { color: 'warning', label: '⏸ Kutmoqda' },
};

export default function DriverActivityPage(): JSX.Element {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [inactive, setInactive] = useState(7);
  const [newWindow, setNewWindow] = useState(7);

  const { data: retention } = useQuery<DriverRetentionResponse>({
    queryKey: ['driver-retention', newWindow, inactive],
    queryFn: () =>
      api.get('/driver-retention', { params: { newWindow, inactive } }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data, isFetching } = useQuery<{ items: DriverActivityRow[] }>({
    queryKey: ['driver-activity', newWindow, inactive],
    queryFn: () =>
      api.get('/driver-activity', { params: { newWindow, inactive } }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    let arr = items;
    if (filter === 'today') arr = arr.filter((d) => d.today_orders > 0);
    else if (filter === 'week') arr = arr.filter((d) => d.today_orders === 0 && d.week_orders > 0);
    else if (filter === 'churned') arr = arr.filter((d) => d.activity_status === 'yoqotilgan');
    else if (filter === 'new') arr = arr.filter((d) => d.is_new === 1);
    else if (filter === 'blocked') arr = arr.filter((d) => d.is_site_locked === 1 || d.our_blocked === 1);
    if (search.trim()) {
      const s = search.toLowerCase();
      arr = arr.filter(
        (d) =>
          d.callsign.toLowerCase().includes(s) ||
          d.driver_name.toLowerCase().includes(s),
      );
    }
    return arr;
  }, [items, filter, search]);

  const s = retention?.summary;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={12} md={4}>
            <Statistic
              title="Jami haydovchi"
              value={s?.total_drivers ?? 0}
              prefix={<TeamOutlined />}
            />
          </Col>
          <Col xs={12} md={5}>
            <Statistic
              title="✅ Bugun ishladi"
              value={s?.active_today ?? 0}
              valueStyle={{ color: '#16A34A' }}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
          <Col xs={12} md={5}>
            <Statistic
              title="⏰ Hafta ichida ishladi"
              value={s?.active_week ?? 0}
              valueStyle={{ color: '#1677ff' }}
              prefix={<ClockCircleOutlined />}
            />
          </Col>
          <Col xs={12} md={5}>
            <Statistic
              title={`🚫 Yo'qotilgan (${inactive}+ kun)`}
              value={s?.churned ?? 0}
              valueStyle={{ color: '#cf1322' }}
              prefix={<UserDeleteOutlined />}
            />
          </Col>
          <Col xs={12} md={5}>
            <Statistic
              title={`🌟 Yangi haydovchi (${newWindow} kun)`}
              value={s?.new_drivers ?? 0}
              valueStyle={{ color: '#722ed1' }}
              prefix={<UserAddOutlined />}
            />
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col xs={12} md={6}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>Yo'qotilgan deb hisoblash kuni:</span>
            <Select
              value={inactive}
              onChange={setInactive}
              style={{ width: '100%' }}
              size="small"
              options={[
                { value: 3, label: '3 kun' },
                { value: 7, label: '7 kun' },
                { value: 14, label: '14 kun' },
                { value: 30, label: '30 kun' },
              ]}
            />
          </Col>
          <Col xs={12} md={6}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>Yangi haydovchi oynasi:</span>
            <Select
              value={newWindow}
              onChange={setNewWindow}
              style={{ width: '100%' }}
              size="small"
              options={[
                { value: 3, label: '3 kun' },
                { value: 7, label: '7 kun' },
                { value: 14, label: '14 kun' },
                { value: 30, label: '30 kun' },
              ]}
            />
          </Col>
        </Row>
      </Card>

      <Card
        title={<span><TeamOutlined /> Haydovchilar ro'yxati ({filtered.length})</span>}
        extra={
          <Input.Search
            placeholder="Belgi yoki ism"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
        }
      >
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as FilterTab)}
          options={[
            { value: 'all', label: `Hammasi (${items.length})` },
            { value: 'today', label: `✅ Bugun (${items.filter((d) => d.today_orders > 0).length})` },
            { value: 'week', label: `⏰ Hafta (${items.filter((d) => d.today_orders === 0 && d.week_orders > 0).length})` },
            { value: 'churned', label: `🚫 Yo'qotilgan (${items.filter((d) => d.activity_status === 'yoqotilgan').length})` },
            { value: 'new', label: `🌟 Yangi (${items.filter((d) => d.is_new === 1).length})` },
            { value: 'blocked', label: `⛔ Bloklangan (${items.filter((d) => d.is_site_locked === 1 || d.our_blocked === 1).length})` },
          ]}
          style={{ marginBottom: 16 }}
        />

        <Table<DriverActivityRow>
          size="middle"
          rowKey="callsign"
          loading={isFetching}
          dataSource={filtered}
          pagination={{ pageSize: 50 }}
          locale={{ emptyText: <Empty /> }}
          rowClassName={(r) =>
            r.is_site_locked === 1
              ? 'row-blocked'
              : r.activity_status === 'aktiv_bugun'
              ? 'row-active'
              : ''
          }
          columns={[
            {
              title: 'Belgi',
              dataIndex: 'callsign',
              width: 110,
              render: (v) => <Tag>{v}</Tag>,
              fixed: 'left',
            },
            { title: 'Haydovchi', dataIndex: 'driver_name', ellipsis: true, fixed: 'left' },
            { title: 'Hudud', dataIndex: 'region', width: 130 },
            {
              title: 'Holat',
              dataIndex: 'activity_status',
              width: 160,
              render: (v: DriverActivityRow['activity_status'], r) => {
                const info = STATUS_TAGS[v];
                return (
                  <span>
                    <Tag color={info.color}>{info.label}</Tag>
                    {r.is_new === 1 && <Tag color="purple" style={{ marginLeft: 4 }}>🌟 yangi</Tag>}
                  </span>
                );
              },
              filters: [
                { text: 'Bugun ishladi', value: 'aktiv_bugun' },
                { text: 'Hafta ichida', value: 'aktiv_hafta' },
                { text: 'Yo\'qotilgan', value: 'yoqotilgan' },
                { text: 'Kutmoqda', value: 'kutmoqda' },
              ],
              onFilter: (value, r) => r.activity_status === value,
            },
            {
              title: 'BLOK',
              width: 130,
              render: (_, r) => {
                if (r.is_site_locked === 1) {
                  return (
                    <Tooltip title={`Sayt: ${r.lock_kind ?? ''}`}>
                      <Tag color="error" icon={<StopOutlined />}>
                        SAYT BLOK
                      </Tag>
                    </Tooltip>
                  );
                }
                if (r.our_blocked === 1) {
                  return <Tag color="warning">Bizda blok</Tag>;
                }
                return <Tag color="success">✓ aktiv</Tag>;
              },
              filters: [
                { text: 'Saytda bloklangan', value: 'site' },
                { text: 'Bizda blok', value: 'our' },
                { text: 'Aktiv (blok yo\'q)', value: 'active' },
              ],
              onFilter: (value, r) => {
                if (value === 'site') return r.is_site_locked === 1;
                if (value === 'our') return r.our_blocked === 1 && !r.is_site_locked;
                return !r.is_site_locked && !r.our_blocked;
              },
            },
            {
              title: 'Bugun',
              dataIndex: 'today_orders',
              width: 80,
              render: (v) => (v > 0 ? <Tag color="success">{v}</Tag> : '—'),
              sorter: (a, b) => a.today_orders - b.today_orders,
            },
            {
              title: 'Hafta',
              dataIndex: 'week_orders',
              width: 80,
              sorter: (a, b) => a.week_orders - b.week_orders,
            },
            {
              title: 'Jami',
              dataIndex: 'total_orders',
              width: 90,
              sorter: (a, b) => a.total_orders - b.total_orders,
              defaultSortOrder: 'descend',
            },
            {
              title: 'Daromad',
              dataIndex: 'total_amount',
              width: 140,
              render: (v) => fmtNarx(v),
              sorter: (a, b) => a.total_amount - b.total_amount,
            },
            { title: 'Birinchi zakaz', dataIndex: 'first_date', width: 120 },
            { title: 'Oxirgi zakaz', dataIndex: 'last_date', width: 120 },
            {
              title: 'Faolsizlik',
              dataIndex: 'days_inactive',
              width: 110,
              render: (v) =>
                v === 0 ? (
                  <Tag color="success">bugun</Tag>
                ) : v >= 14 ? (
                  <Tag color="error">{v} kun</Tag>
                ) : v >= 3 ? (
                  <Tag color="warning">{v} kun</Tag>
                ) : (
                  <Tag>{v} kun</Tag>
                ),
              sorter: (a, b) => a.days_inactive - b.days_inactive,
            },
          ]}
          scroll={{ x: 1400 }}
        />

        <style>{`
          .row-active td { background-color: #f6ffed !important; }
          .row-blocked td { background-color: #fff1f0 !important; }
        `}</style>
      </Card>

      {retention && retention.churnedOnes.length > 0 && (
        <Card
          title={`🚫 Yo'qotilgan haydovchilar (${inactive}+ kun) — ${retention.churnedOnes.length}`}
          style={{ marginTop: 16 }}
        >
          <p style={{ color: '#6B7280', marginBottom: 12 }}>
            Ilgari faol bo'lib, oxirgi <b>{inactive}+ kun</b> zakaz olmagan haydovchilar. Ehtimol
            ketib qolgan yoki blok ta'sirida.
          </p>
          <Table
            size="small"
            rowKey="callsign"
            dataSource={retention.churnedOnes}
            pagination={{ pageSize: 30 }}
            columns={[
              { title: 'Belgi', dataIndex: 'callsign', width: 110, render: (v) => <Tag>{v}</Tag> },
              { title: 'Haydovchi', dataIndex: 'driver_name', ellipsis: true },
              { title: 'Hudud', dataIndex: 'region', width: 130 },
              {
                title: 'Eski zakaz',
                dataIndex: 'past_orders',
                width: 110,
                sorter: (a, b) => a.past_orders - b.past_orders,
              },
              {
                title: 'Eski daromad',
                dataIndex: 'past_amount',
                width: 140,
                render: (v) => fmtNarx(v),
              },
              { title: 'Oxirgi zakaz', dataIndex: 'last_date', width: 120 },
              {
                title: 'Necha kun yo\'q',
                dataIndex: 'days_inactive',
                width: 130,
                render: (v) => <Tag color={v >= 30 ? 'error' : 'warning'}>{v} kun</Tag>,
                sorter: (a, b) => a.days_inactive - b.days_inactive,
                defaultSortOrder: 'descend',
              },
              {
                title: 'Blok holati',
                dataIndex: 'lock_kind',
                width: 120,
                render: (v) =>
                  v ? <Tag color="error">SAYT: {v}</Tag> : <Tag>blok yo'q</Tag>,
              },
            ]}
          />
        </Card>
      )}

      {retention && retention.newOnes.length > 0 && (
        <Card
          title={`🌟 Yangi haydovchilar (${newWindow} kun ichida birinchi zakazni qilganlar) — ${retention.newOnes.length}`}
          style={{ marginTop: 16 }}
        >
          <Table
            size="small"
            rowKey="callsign"
            dataSource={retention.newOnes}
            pagination={{ pageSize: 30 }}
            columns={[
              { title: 'Belgi', dataIndex: 'callsign', width: 110, render: (v) => <Tag color="purple">{v}</Tag> },
              { title: 'Haydovchi', dataIndex: 'driver_name', ellipsis: true },
              { title: 'Hudud', dataIndex: 'region', width: 130 },
              {
                title: 'Birinchi zakaz',
                dataIndex: 'first_date',
                width: 130,
                sorter: (a, b) => a.first_date.localeCompare(b.first_date),
                defaultSortOrder: 'descend',
              },
              {
                title: 'Zakaz soni',
                dataIndex: 'orders',
                width: 110,
                sorter: (a, b) => a.orders - b.orders,
              },
              {
                title: 'Daromad',
                dataIndex: 'total_amount',
                width: 140,
                render: (v) => fmtNarx(v),
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
