import { Card, Table, Tag, Input, Select, Space, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type DriverRow } from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

const sortOptions = [
  { value: 'alerts', label: 'Eng ko\'p alert' },
  { value: 'score', label: 'Eng yuqori ball' },
  { value: 'orders', label: 'Eng ko\'p zakaz' },
  { value: 'cancel', label: 'Eng ko\'p bekor' },
];

export default function DriversPage(): JSX.Element {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('alerts');
  const [open, setOpen] = useState<string | null>(null);
  const { data, isFetching } = useQuery<{ items: DriverRow[] }>({
    queryKey: ['drivers', q, sort],
    queryFn: () => api.get('/drivers', { params: { q, sort } }).then((r) => r.data),
    refetchInterval: 10_000,
  });

  return (
    <>
      <Card
        title={`🚖 Haydovchilar (${data?.items.length ?? 0})`}
        extra={
          <Space>
            <Input.Search
              placeholder="Ism yoki belgi"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 240 }}
              allowClear
            />
            <Select value={sort} onChange={setSort} options={sortOptions} style={{ width: 200 }} />
          </Space>
        }
      >
        <Table<DriverRow>
          size="middle"
          rowKey="callsign"
          loading={isFetching}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 50, showSizeChanger: true }}
          locale={{ emptyText: <Empty /> }}
          onRow={(r) => ({ onClick: () => setOpen(r.callsign), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Belgi', dataIndex: 'callsign', width: 110, render: (v) => <Tag>{v}</Tag> },
            { title: 'Haydovchi', dataIndex: 'driver_name', ellipsis: true },
            { title: 'Zakaz', dataIndex: 'orders', width: 90, sorter: (a, b) => a.orders - b.orders },
            { title: 'Bajarildi', dataIndex: 'completed', width: 110, render: (v) => <Tag color="success">{v}</Tag> },
            { title: 'Bekor', dataIndex: 'cancelled', width: 100, render: (v) => <Tag color="warning">{v}</Tag> },
            { title: 'Alert', dataIndex: 'alerts', width: 90, render: (v) => (v ? <Tag color="warning">{v}</Tag> : '0') },
            {
              title: 'Ball',
              dataIndex: 'total_score',
              width: 110,
              render: (v) =>
                v ? <Tag color={v >= 200 ? 'error' : 'warning'}>{v}</Tag> : '0',
              sorter: (a, b) => a.total_score - b.total_score,
            },
            {
              title: 'Holat',
              dataIndex: 'is_blocked',
              width: 110,
              render: (v) => (v ? <Tag color="error">BLOK</Tag> : <Tag>Normal</Tag>),
            },
          ]}
        />
      </Card>
      <DriverDrawer callsign={open} open={!!open} onClose={() => setOpen(null)} />
    </>
  );
}
