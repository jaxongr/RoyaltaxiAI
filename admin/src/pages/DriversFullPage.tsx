import { Card, Table, Tag, Input, Empty, App, Button, Tooltip } from 'antd';
import { CheckOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, fmtNarx, type DriverFullRow } from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

export default function DriversFullPage(): JSX.Element {
  const [q, setQ] = useState('');
  const [drvOpen, setDrvOpen] = useState<string | null>(null);
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isFetching } = useQuery<{ items: DriverFullRow[] }>({
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

  return (
    <>
      <Card
        title={`🚖 Haydovchilar — saytdan to'liq (${data?.items.length ?? 0})`}
        extra={
          <Input.Search
            placeholder="Ism, belgi yoki driver ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
        }
      >
        <p style={{ color: '#6B7280', marginBottom: 12 }}>
          Saytning <code>fleet/drivers/get-drivers</code> API'sidan to'g'ridan-to'g'ri olingan to'liq ma'lumot.
          <b> npm run sync</b> bilan yangilanadi. Whitelist'ga qo'shsangiz — kichik alertlar e'tiborga olinmaydi.
        </p>
        <Table<DriverFullRow>
          size="middle"
          rowKey="driver_id"
          loading={isFetching}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 50, showSizeChanger: true }}
          locale={{ emptyText: <Empty description="Sync qiling: npm run sync" /> }}
          onRow={(r) => ({ onClick: () => r.callsign && setDrvOpen(r.callsign), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Belgi', dataIndex: 'callsign', width: 100, render: (v) => <Tag>{v || '—'}</Tag> },
            { title: 'Ism', render: (_, r) => `${r.last_name} ${r.first_name}` },
            { title: 'Avtokolonna', dataIndex: 'fleet_name', ellipsis: true, width: 200 },
            {
              title: 'Balans',
              dataIndex: 'balance',
              width: 110,
              render: (v) =>
                v === null ? '—' : <span style={{ color: v < 0 ? '#EF4444' : '#16A34A' }}>{fmtNarx(v)}</span>,
              sorter: (a, b) => (a.balance ?? 0) - (b.balance ?? 0),
            },
            {
              title: 'Smenada',
              dataIndex: 'on_shift',
              width: 90,
              render: (v) => (v ? <Tag color="success">Ha</Tag> : <Tag>Yo'q</Tag>),
            },
            { title: 'Zakaz', dataIndex: 'orders_count', width: 90, sorter: (a, b) => a.orders_count - b.orders_count },
            {
              title: 'Alert',
              dataIndex: 'alerts_count',
              width: 90,
              render: (v) => (v ? <Tag color="warning">{v}</Tag> : '0'),
              sorter: (a, b) => a.alerts_count - b.alerts_count,
            },
            {
              title: 'Subsidiya',
              dataIndex: 'subsidy_total',
              width: 130,
              render: (v) => (v ? fmtNarx(v) : '—'),
              sorter: (a, b) => a.subsidy_total - b.subsidy_total,
            },
            {
              title: 'Lock (sayt)',
              dataIndex: 'lock_kind',
              width: 150,
              render: (v) =>
                v ? (
                  <Tag color="error">{v}</Tag>
                ) : (
                  <Tag>aktiv</Tag>
                ),
            },
            {
              title: 'Whitelist',
              dataIndex: 'whitelisted',
              width: 110,
              render: (v) => (v ? <Tag color="success">Ishonchli</Tag> : '—'),
            },
            {
              title: '',
              width: 110,
              render: (_, r) => (
                <Tooltip title={r.whitelisted ? "Whitelist'dan olib tashlash" : "Whitelist'ga qo'shish"}>
                  <Button
                    size="small"
                    icon={r.whitelisted ? <StopOutlined /> : <CheckOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      whitelistMut.mutate({ callsign: r.callsign, action: r.whitelisted ? 'remove' : 'add' });
                    }}
                  >
                    {r.whitelisted ? 'Olib tashlash' : 'Ishonchli'}
                  </Button>
                </Tooltip>
              ),
            },
          ]}
        />
      </Card>
      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />
    </>
  );
}
