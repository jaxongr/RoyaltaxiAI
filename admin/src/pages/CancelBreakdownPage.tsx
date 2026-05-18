import { Card, Table, Tag, Select, Empty, Row, Col, Progress } from 'antd';
import { CloseCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type CancelBreakdownResponse } from '../lib/api';

export default function CancelBreakdownPage(): JSX.Element {
  const [days, setDays] = useState(30);
  const { data, isFetching } = useQuery<CancelBreakdownResponse>({
    queryKey: ['cancel-breakdown', days],
    queryFn: () => api.get('/cancel-breakdown', { params: { days } }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const byKind = data?.byKind ?? [];
  const byRegion = data?.byRegion ?? [];

  return (
    <div>
      <Card
        title={<span><CloseCircleOutlined /> Bekor sabablari — to'liq tahlil</span>}
        extra={
          <Select
            value={days}
            onChange={setDays}
            style={{ width: 150 }}
            options={[
              { value: 7, label: 'Oxirgi 7 kun' },
              { value: 30, label: '30 kun' },
              { value: 90, label: '90 kun' },
            ]}
          />
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16}>
          {byKind.map((k) => (
            <Col xs={24} sm={12} md={8} key={k.cancel_kind} style={{ marginBottom: 12 }}>
              <div style={{ padding: 12, border: '1px solid #f0f0f0', borderRadius: 8 }}>
                <div style={{ fontWeight: 600 }}>{k.cancel_kind}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{k.cnt}</span>
                  <Tag color={k.pct > 30 ? 'error' : k.pct > 10 ? 'warning' : 'default'}>{k.pct}%</Tag>
                </div>
                <Progress percent={Math.round(k.pct)} size="small" showInfo={false} />
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="📍 Hudud bo'yicha bekor turlari" loading={isFetching}>
        <Table
          size="middle"
          rowKey="region"
          dataSource={byRegion}
          pagination={{ pageSize: 30 }}
          locale={{ emptyText: <Empty /> }}
          columns={[
            { title: 'Hudud', dataIndex: 'region', width: 130, render: (v) => <Tag color="blue">{v}</Tag> },
            {
              title: 'Mijoz xohishi',
              dataIndex: 'by_client',
              sorter: (a, b) => a.by_client - b.by_client,
            },
            {
              title: 'Avtomatik',
              dataIndex: 'auto',
              render: (v) => (v > 0 ? <Tag color="warning">{v}</Tag> : '0'),
              sorter: (a, b) => a.auto - b.auto,
            },
            {
              title: 'Allaqachon ketgan',
              dataIndex: 'already_left',
              render: (v) => (v > 0 ? <Tag color="orange">{v}</Tag> : '0'),
            },
            {
              title: 'Tel ko\'tarmadi',
              dataIndex: 'no_answer',
              render: (v) => (v > 0 ? <Tag color="orange">{v}</Tag> : '0'),
            },
            {
              title: 'Haydovchi aybi',
              dataIndex: 'driver_fault',
              render: (v) => (v > 0 ? <Tag color="error">{v}</Tag> : '0'),
              sorter: (a, b) => a.driver_fault - b.driver_fault,
            },
            {
              title: 'Dispetcher aybi',
              dataIndex: 'dispatch_fault',
              render: (v) => (v > 0 ? <Tag color="error">{v}</Tag> : '0'),
            },
            {
              title: 'Jami bekor',
              dataIndex: 'total',
              render: (v) => <b>{v}</b>,
              sorter: (a, b) => a.total - b.total,
              defaultSortOrder: 'descend',
            },
          ]}
        />
      </Card>
    </div>
  );
}
