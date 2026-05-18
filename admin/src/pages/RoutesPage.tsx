import { Card, Table, Tag, Select, Empty } from 'antd';
import { CompassOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, fmtNarx, fmtKm, type PopularRouteRow } from '../lib/api';

export default function RoutesPage(): JSX.Element {
  const [days, setDays] = useState(7);
  const { data, isFetching } = useQuery<{ items: PopularRouteRow[] }>({
    queryKey: ['popular-routes', days],
    queryFn: () => api.get('/popular-routes', { params: { days } }).then((r) => r.data),
    refetchInterval: 5 * 60_000,
  });

  return (
    <Card
      title={<span><CompassOutlined /> Mashhur yo'nalishlar</span>}
      extra={
        <Select
          value={days}
          onChange={setDays}
          style={{ width: 150 }}
          options={[
            { value: 1, label: 'Bugun' },
            { value: 7, label: 'Oxirgi 7 kun' },
            { value: 30, label: '30 kun' },
            { value: 90, label: '90 kun' },
          ]}
        />
      }
    >
      <p style={{ color: '#6B7280', marginBottom: 12 }}>
        Eng ko'p takrorlanadigan yo'nalishlar — qaysi nuqtaga ko'p mijoz boradi. Marketing yoki taxi joylash uchun foydali.
      </p>
      <Table<PopularRouteRow>
        size="middle"
        rowKey={(r) => `${r.from_region}-${r.to_address}`}
        loading={isFetching}
        dataSource={data?.items ?? []}
        pagination={{ pageSize: 50 }}
        locale={{ emptyText: <Empty /> }}
        columns={[
          { title: 'Boshlang\'ich hudud', dataIndex: 'from_region', width: 160, render: (v) => <Tag color="blue">{v}</Tag> },
          { title: '→ Manzil', dataIndex: 'to_address', ellipsis: true },
          {
            title: 'Zakaz',
            dataIndex: 'count',
            width: 100,
            render: (v) => <Tag color="gold">{v}</Tag>,
            sorter: (a, b) => a.count - b.count,
            defaultSortOrder: 'descend',
          },
          { title: 'Haydovchi', dataIndex: 'drivers', width: 110 },
          {
            title: 'O\'rt. masofa',
            dataIndex: 'avg_km',
            width: 130,
            render: (v) => fmtKm(v),
          },
          {
            title: 'O\'rt. narx',
            dataIndex: 'avg_amount',
            width: 140,
            render: (v) => fmtNarx(v),
          },
        ]}
      />
    </Card>
  );
}
