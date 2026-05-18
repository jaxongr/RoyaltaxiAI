import { Card, Table, Tag, Select, Empty, Tooltip } from 'antd';
import { UserDeleteOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type ClientBlacklistRow } from '../lib/api';

export default function ClientBlacklistPage(): JSX.Element {
  const [days, setDays] = useState(30);
  const navigate = useNavigate();
  const { data, isFetching } = useQuery<{ items: ClientBlacklistRow[] }>({
    queryKey: ['client-blacklist-recommend', days],
    queryFn: () =>
      api.get('/client-blacklist-recommend', { params: { days } }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  return (
    <Card
      title={<span><UserDeleteOutlined /> Shubhali mijozlar — Royaltaxi qora ro'yxatiga tavsiya</span>}
      extra={
        <Select
          value={days}
          onChange={setDays}
          style={{ width: 160 }}
          options={[
            { value: 7, label: 'Oxirgi 7 kun' },
            { value: 30, label: '30 kun' },
            { value: 90, label: '90 kun' },
          ]}
        />
      }
    >
      <p style={{ color: '#6B7280', marginBottom: 12 }}>
        50%+ bekorlar, "Telefon ko'tarmadi" yoki "Allaqachon ketgan" 3+ marta —
        bu mijozlar haydovchilarga zarar yetkazadi. Royaltaxi <code>/settings/blacklist</code> ga qo'shing.
      </p>
      <Table<ClientBlacklistRow>
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
          { title: 'Hudud', dataIndex: 'region', width: 120 },
          {
            title: 'Jami zakaz',
            dataIndex: 'orders_total',
            width: 100,
            sorter: (a, b) => a.orders_total - b.orders_total,
          },
          {
            title: 'Bekor',
            dataIndex: 'cancelled',
            width: 90,
            render: (v) => <Tag color="warning">{v}</Tag>,
            sorter: (a, b) => a.cancelled - b.cancelled,
          },
          {
            title: 'Bekor %',
            dataIndex: 'cancel_rate',
            width: 100,
            render: (v) => (
              <Tag color={v >= 70 ? 'error' : v >= 50 ? 'warning' : 'default'}>
                {v}%
              </Tag>
            ),
            sorter: (a, b) => a.cancel_rate - b.cancel_rate,
            defaultSortOrder: 'descend',
          },
          {
            title: 'Tel ko\'tarmadi',
            dataIndex: 'no_answer',
            width: 130,
            render: (v) =>
              v > 0 ? (
                <Tooltip title="Haydovchi keldi, mijoz telefon ko'tarmadi">
                  <Tag color={v >= 3 ? 'error' : 'warning'}>{v}</Tag>
                </Tooltip>
              ) : (
                '—'
              ),
            sorter: (a, b) => a.no_answer - b.no_answer,
          },
          {
            title: 'Allaqachon ketgan',
            dataIndex: 'already_left',
            width: 140,
            render: (v) =>
              v > 0 ? (
                <Tooltip title="Haydovchi kelganida mijoz ketgan edi">
                  <Tag color={v >= 3 ? 'error' : 'warning'}>{v}</Tag>
                </Tooltip>
              ) : (
                '—'
              ),
            sorter: (a, b) => a.already_left - b.already_left,
          },
          {
            title: 'Mijoz aybi',
            dataIndex: 'client_fault',
            width: 110,
            render: (v) => (v > 0 ? <Tag color="error">{v}</Tag> : '—'),
          },
          { title: 'Oxirgi zakaz', dataIndex: 'last_order', width: 120 },
        ]}
      />
    </Card>
  );
}
