import { Card, Table, Tag, Input, Empty, Tooltip } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type ClientRow } from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

export default function ClientsPage(): JSX.Element {
  const [q, setQ] = useState('');
  const [drvOpen, setDrvOpen] = useState<string | null>(null);
  const navigate = useNavigate();
  const { data, isFetching } = useQuery<{ items: ClientRow[] }>({
    queryKey: ['clients', q],
    queryFn: () => api.get('/clients', { params: { q } }).then((r) => r.data),
    refetchInterval: 30_000,
  });

  return (
    <>
      <Card
        title={`👥 Shubhali mijozlar — o'ziga o'zi zakaz beruvchilar (${data?.items.length ?? 0})`}
        extra={
          <Input.Search
            placeholder="Telefon yoki ism"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 240 }}
            allowClear
          />
        }
      >
        <p style={{ color: '#6B7280', marginBottom: 12 }}>
          Bu yerda 5+ marta zakaz bergan va asosan bitta haydovchidan foydalanadigan mijozlar ko'rinadi —
          klassik o'ziga o'zi zakaz berish sxemasi.
        </p>
        <Table<ClientRow>
          size="middle"
          rowKey="client_phone"
          loading={isFetching}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 50 }}
          locale={{ emptyText: <Empty /> }}
          columns={[
            {
              title: 'Telefon',
              dataIndex: 'client_phone',
              width: 180,
              render: (v) => (
                <a onClick={() => navigate(`/clients/${encodeURIComponent(v)}`)}>
                  <Tag color="blue">{v}</Tag>
                </a>
              ),
            },
            { title: 'Zakaz', dataIndex: 'orders', width: 80, sorter: (a, b) => a.orders - b.orders },
            {
              title: 'Turli haydovchi',
              dataIndex: 'distinct_drivers',
              width: 140,
              render: (v) => (
                <Tooltip title="Qancha kam — shubha shuncha kuchli">
                  <Tag color={v === 1 ? 'error' : v <= 2 ? 'warning' : 'default'}>{v}</Tag>
                </Tooltip>
              ),
              sorter: (a, b) => a.distinct_drivers - b.distinct_drivers,
              defaultSortOrder: 'ascend',
            },
            {
              title: 'Asosiy haydovchi',
              render: (_, r) => (
                <a onClick={() => setDrvOpen(r.top_driver)}>{r.top_driver}</a>
              ),
            },
            { title: 'Marta', dataIndex: 'top_driver_count', width: 80 },
            { title: 'Hududlar', dataIndex: 'regions', ellipsis: true },
          ]}
        />
      </Card>
      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />
    </>
  );
}
