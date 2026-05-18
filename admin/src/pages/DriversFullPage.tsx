import { Card, Table, Tag, Input, Empty, App, Button, Tooltip, Space, Segmented, Badge } from 'antd';
import { CheckOutlined, StopOutlined, SafetyOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api, fmtNarx, type DriverFullRow } from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

type FilterMode = 'all' | 'on_shift' | 'locked' | 'whitelisted' | 'minus_balance' | 'with_alerts';

export default function DriversFullPage(): JSX.Element {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [drvOpen, setDrvOpen] = useState<string | null>(null);
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isFetching, refetch } = useQuery<{ items: DriverFullRow[] }>({
    queryKey: ['drivers-full', q],
    queryFn: () => api.get('/drivers-full', { params: { q } }).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const whitelistMut = useMutation({
    mutationFn: (payload: { callsign: string; action: 'add' | 'remove' }) =>
      api.post('/whitelist', payload),
    onSuccess: () => {
      message.success('Whitelist yangilandi');
      qc.invalidateQueries({ queryKey: ['drivers-full'] });
    },
  });

  const rows = data?.items ?? [];
  const filtered = useMemo(() => {
    switch (filter) {
      case 'on_shift': return rows.filter((r) => r.on_shift);
      case 'locked': return rows.filter((r) => r.lock_kind);
      case 'whitelisted': return rows.filter((r) => r.whitelisted);
      case 'minus_balance': return rows.filter((r) => (r.balance ?? 0) < 0);
      case 'with_alerts': return rows.filter((r) => r.alerts_count > 0);
      default: return rows;
    }
  }, [rows, filter]);

  const counts = useMemo(() => ({
    on_shift: rows.filter((r) => r.on_shift).length,
    locked: rows.filter((r) => r.lock_kind).length,
    whitelisted: rows.filter((r) => r.whitelisted).length,
    minus_balance: rows.filter((r) => (r.balance ?? 0) < 0).length,
    with_alerts: rows.filter((r) => r.alerts_count > 0).length,
  }), [rows]);

  return (
    <>
      <Card
        title={
          <Space>
            🚖 Haydovchilar (to'liq)
            <Badge count={rows.length} color="#1677ff" overflowCount={99999} />
          </Space>
        }
        extra={
          <Space>
            <Input.Search
              placeholder="Ism, belgi yoki driver ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching} />
          </Space>
        }
      >
        <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#6B7280' }}>
          💡 Saytning <code>fleet/drivers/get-drivers</code> API'sidan to'liq ma'lumot.
          <b> npm run sync</b> bilan yangilanadi. Haydovchini <b>Ishonchli</b> deb belgilasangiz, past balli alertlar e'tiborga olinmaydi.
        </div>

        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as FilterMode)}
          options={[
            { label: `Hammasi (${rows.length})`, value: 'all' },
            { label: `Smenada (${counts.on_shift})`, value: 'on_shift' },
            { label: `Bloklangan (${counts.locked})`, value: 'locked' },
            { label: `Alert'li (${counts.with_alerts})`, value: 'with_alerts' },
            { label: `Minus balans (${counts.minus_balance})`, value: 'minus_balance' },
            { label: `Ishonchli (${counts.whitelisted})`, value: 'whitelisted' },
          ]}
          style={{ marginBottom: 12 }}
        />

        <Table<DriverFullRow>
          size="middle"
          rowKey="driver_id"
          loading={isFetching && !data}
          dataSource={filtered}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showTotal: (t, [a, b]) => `${a}-${b} / ${t}`,
            pageSizeOptions: [20, 50, 100, 200],
          }}
          locale={{ emptyText: <Empty description="Haydovchi topilmadi. Filter yoki qidiruv yo'q?" /> }}
          onRow={(r) => ({
            onClick: (e) => {
              const target = e.target as HTMLElement;
              if (target.closest('.driver-action')) return;
              if (r.callsign) setDrvOpen(r.callsign);
            },
            style: { cursor: 'pointer' },
          })}
          scroll={{ x: 1280 }}
          columns={[
            {
              title: 'Belgi',
              dataIndex: 'callsign',
              width: 100,
              fixed: 'left',
              render: (v) => <Tag>{v || '—'}</Tag>,
            },
            {
              title: 'Ism',
              width: 200,
              ellipsis: true,
              render: (_, r) => (
                <span style={{ fontWeight: 500 }}>
                  {r.last_name} {r.first_name}
                </span>
              ),
            },
            {
              title: 'Avtokolonna',
              dataIndex: 'fleet_name',
              ellipsis: true,
              width: 200,
              render: (v) => v ? <span style={{ fontSize: 12, color: '#6B7280' }}>{v}</span> : '—',
            },
            {
              title: 'Balans',
              dataIndex: 'balance',
              width: 120,
              align: 'right' as const,
              render: (v) => v === null ? '—' : (
                <span style={{ color: v < 0 ? '#EF4444' : '#16A34A', fontWeight: 500 }}>
                  {fmtNarx(v)}
                </span>
              ),
              sorter: (a, b) => (a.balance ?? 0) - (b.balance ?? 0),
            },
            {
              title: 'Smena',
              dataIndex: 'on_shift',
              width: 80,
              align: 'center' as const,
              render: (v) => v
                ? <Tag color="success" style={{ margin: 0 }}>Ha</Tag>
                : <span style={{ color: '#9aa0aa' }}>—</span>,
              filters: [
                { text: 'Smenada', value: 1 },
                { text: 'Smendan tashqari', value: 0 },
              ],
              onFilter: (v, r) => Boolean(r.on_shift) === Boolean(v),
            },
            {
              title: 'Zakaz',
              dataIndex: 'orders_count',
              width: 90,
              align: 'right' as const,
              sorter: (a, b) => a.orders_count - b.orders_count,
              render: (v) => v > 0 ? <b>{v}</b> : <span style={{ color: '#9aa0aa' }}>0</span>,
            },
            {
              title: 'Alert',
              dataIndex: 'alerts_count',
              width: 80,
              align: 'center' as const,
              render: (v) => v > 0
                ? <Tag color="warning" style={{ margin: 0, fontWeight: 600 }}>{v}</Tag>
                : <span style={{ color: '#9aa0aa' }}>0</span>,
              sorter: (a, b) => a.alerts_count - b.alerts_count,
              defaultSortOrder: 'descend' as const,
            },
            {
              title: 'Subsidiya',
              dataIndex: 'subsidy_total',
              width: 130,
              align: 'right' as const,
              render: (v) => v ? <span style={{ fontSize: 12 }}>{fmtNarx(v)}</span> : <span style={{ color: '#9aa0aa' }}>—</span>,
              sorter: (a, b) => a.subsidy_total - b.subsidy_total,
            },
            {
              title: 'Lock (sayt)',
              dataIndex: 'lock_kind',
              width: 160,
              ellipsis: true,
              render: (v) => v
                ? <Tooltip title={v}><Tag color="error">{v}</Tag></Tooltip>
                : <Tag>aktiv</Tag>,
            },
            {
              title: 'Ishonchli',
              dataIndex: 'whitelisted',
              width: 100,
              align: 'center' as const,
              render: (v) => v
                ? <Tag color="success" icon={<SafetyOutlined />}>Ha</Tag>
                : <span style={{ color: '#9aa0aa' }}>—</span>,
            },
            {
              title: 'Amal',
              width: 110,
              fixed: 'right' as const,
              align: 'center' as const,
              render: (_, r) => (
                <span className="driver-action" onClick={(e) => e.stopPropagation()}>
                  <Tooltip title={r.whitelisted ? "Whitelist'dan olib tashlash" : "Whitelist'ga qo'shish"}>
                    <Button
                      size="small"
                      type={r.whitelisted ? 'default' : 'primary'}
                      danger={!!r.whitelisted}
                      icon={r.whitelisted ? <StopOutlined /> : <CheckOutlined />}
                      onClick={() =>
                        whitelistMut.mutate({
                          callsign: r.callsign,
                          action: r.whitelisted ? 'remove' : 'add',
                        })
                      }
                      loading={whitelistMut.isPending}
                    >
                      {r.whitelisted ? 'Olish' : 'Ishonchli'}
                    </Button>
                  </Tooltip>
                </span>
              ),
            },
          ]}
        />
      </Card>
      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />
    </>
  );
}
