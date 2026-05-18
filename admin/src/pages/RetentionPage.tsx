import { Card, Table, Tag, Empty, Row, Col, Statistic, Tooltip } from 'antd';
import { UserSwitchOutlined, RiseOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, type ClientRetentionResponse } from '../lib/api';

export default function RetentionPage(): JSX.Element {
  const navigate = useNavigate();
  const { data, isFetching } = useQuery<ClientRetentionResponse>({
    queryKey: ['client-retention'],
    queryFn: () => api.get('/client-retention', { params: { days: 30 } }).then((r) => r.data),
    refetchInterval: 5 * 60_000,
  });

  const daily = data?.daily ?? [];
  const churned = data?.churned ?? [];

  const totals = daily.reduce(
    (acc, d) => ({
      new: acc.new + d.new_clients,
      returning: acc.returning + d.returning_clients,
    }),
    { new: 0, returning: 0 },
  );

  return (
    <div>
      <Card
        title={<span><RiseOutlined /> Mijoz retention — oxirgi 30 kun</span>}
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Statistic
              title="Yangi mijozlar (30 kun)"
              value={totals.new}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col xs={24} md={8}>
            <Statistic
              title="Qaytuvchi mijozlar (30 kun)"
              value={totals.returning}
              valueStyle={{ color: '#1677ff' }}
            />
          </Col>
          <Col xs={24} md={8}>
            <Statistic
              title="Yo'qotilgan mijozlar"
              value={churned.length}
              valueStyle={{ color: '#cf1322' }}
              suffix={
                <Tooltip title="14+ kun zakaz qilmagan, ilgari 5+ marta zakaz qilgan">
                  <small style={{ fontSize: 12, color: '#999' }}>(churn)</small>
                </Tooltip>
              }
            />
          </Col>
        </Row>
      </Card>

      <Card title="📅 Kunlik yangi vs qaytuvchi mijoz" style={{ marginBottom: 16 }}>
        <Table
          size="middle"
          rowKey="day"
          loading={isFetching}
          dataSource={daily}
          pagination={{ pageSize: 30 }}
          locale={{ emptyText: <Empty /> }}
          columns={[
            { title: 'Sana', dataIndex: 'day', width: 130 },
            {
              title: 'Yangi mijoz',
              dataIndex: 'new_clients',
              render: (v) => <Tag color="success">{v}</Tag>,
              sorter: (a, b) => a.new_clients - b.new_clients,
            },
            {
              title: 'Qaytuvchi',
              dataIndex: 'returning_clients',
              render: (v) => <Tag color="blue">{v}</Tag>,
              sorter: (a, b) => a.returning_clients - b.returning_clients,
            },
            {
              title: 'Jami uniq',
              dataIndex: 'total_clients',
              sorter: (a, b) => a.total_clients - b.total_clients,
            },
            {
              title: 'Yangi %',
              render: (_, r) => {
                const pct = r.total_clients > 0 ? Math.round((r.new_clients / r.total_clients) * 100) : 0;
                return <Tag color={pct > 30 ? 'gold' : 'default'}>{pct}%</Tag>;
              },
            },
          ]}
        />
      </Card>

      <Card
        title={
          <span>
            <UserSwitchOutlined /> Yo'qotilgan mijozlar — 14+ kun zakaz qilmagan ({churned.length})
          </span>
        }
      >
        <p style={{ color: '#6B7280', marginBottom: 12 }}>
          Ilgari faol mijozlar — ehtimol konkurentga ketgan yoki muammo bo'lgan. Qaytarish kerak.
        </p>
        <Table
          size="middle"
          rowKey="client_phone"
          dataSource={churned}
          pagination={{ pageSize: 50 }}
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
            { title: 'Hudud', dataIndex: 'region', width: 130 },
            {
              title: 'Eski zakaz',
              dataIndex: 'past_orders',
              width: 110,
              sorter: (a, b) => a.past_orders - b.past_orders,
              defaultSortOrder: 'descend',
            },
            { title: 'Oxirgi zakaz', dataIndex: 'last_order', width: 130 },
            {
              title: 'Necha kun yo\'qolgan',
              dataIndex: 'days_since',
              width: 160,
              render: (v) => (
                <Tag color={v >= 30 ? 'error' : 'warning'}>{Math.floor(v)} kun</Tag>
              ),
              sorter: (a, b) => a.days_since - b.days_since,
            },
          ]}
        />
      </Card>
    </div>
  );
}
