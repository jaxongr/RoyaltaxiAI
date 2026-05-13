import { Card, Table, Tag, Input, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, fmtTime, type BlacklistMirrorRow } from '../lib/api';

export default function BlacklistPage(): JSX.Element {
  const [q, setQ] = useState('');
  const { data, isFetching } = useQuery<{ items: BlacklistMirrorRow[]; total: number }>({
    queryKey: ['blacklist-mirror', q],
    queryFn: () => api.get('/blacklist-mirror', { params: { q } }).then((r) => r.data),
  });

  return (
    <Card
      title={`📞 Mijoz telefon qora ro'yxati (${data?.total ?? 0})`}
      extra={
        <Input.Search
          placeholder="Telefon raqami qidirish"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 280 }}
          allowClear
        />
      }
    >
      <p style={{ color: '#6B7280', marginBottom: 12 }}>
        Saytdan olingan mijoz telefon qora ro'yxati (Чёрный список телефонии). <b>npm run sync</b> bilan yangilanadi.
      </p>
      <Table<BlacklistMirrorRow>
        size="middle"
        rowKey="number_id"
        loading={isFetching}
        dataSource={data?.items ?? []}
        pagination={{ pageSize: 100 }}
        locale={{ emptyText: <Empty description="Sync qiling: npm run sync" /> }}
        columns={[
          { title: 'ID', dataIndex: 'number_id', width: 90 },
          { title: 'Telefon', dataIndex: 'phone', render: (v) => <Tag>{v}</Tag> },
          {
            title: 'Holat',
            dataIndex: 'enabled',
            width: 130,
            render: (v) => (v ? <Tag color="error">BLOK aktiv</Tag> : <Tag>O'chirilgan</Tag>),
          },
          { title: 'Yangilangan', dataIndex: 'scraped_at', render: (v) => fmtTime(v), width: 180 },
        ]}
      />
    </Card>
  );
}
