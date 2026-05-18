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
          loading={isFetching && !data}
          dataSource={data?.items ?? []}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showTotal: (t, [a, b]) => `${a}-${b} / ${t}`,
          }}
          locale={{ emptyText: <Empty description="Shubhali mijoz topilmadi" /> }}
          scroll={{ x: 1000 }}
          columns={[
            {
              title: 'Telefon',
              dataIndex: 'client_phone',
              width: 180,
              fixed: 'left' as const,
              render: (v) => (
                <a onClick={() => navigate(`/clients/${encodeURIComponent(v)}`)}>
                  <Tag color="blue">{v}</Tag>
                </a>
              ),
            },
            {
              title: 'Zakaz',
              dataIndex: 'orders',
              width: 90,
              align: 'right' as const,
              sorter: (a, b) => a.orders - b.orders,
              render: (v) => <b>{v}</b>,
            },
            {
              title: 'Turli haydovchi',
              dataIndex: 'distinct_drivers',
              width: 150,
              align: 'center' as const,
              render: (v) => (
                <Tooltip title="Qancha kam — shubha shuncha kuchli">
                  <Tag color={v === 1 ? 'error' : v <= 2 ? 'warning' : 'default'} style={{ margin: 0, fontWeight: 600 }}>{v}</Tag>
                </Tooltip>
              ),
              sorter: (a, b) => a.distinct_drivers - b.distinct_drivers,
              defaultSortOrder: 'ascend' as const,
            },
            {
              title: 'Asosiy haydovchi',
              width: 200,
              ellipsis: true,
              render: (_, r) => (
                <a onClick={() => setDrvOpen(r.top_driver)}>{r.top_driver}</a>
              ),
            },
            {
              title: 'Marta',
              dataIndex: 'top_driver_count',
              width: 80,
              align: 'right' as const,
            },
            { title: 'Hududlar', dataIndex: 'regions', ellipsis: true, width: 250 },
          ]}
        />
      </Card>
      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />
    </>
  );
}
