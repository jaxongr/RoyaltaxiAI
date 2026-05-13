import { Drawer, Descriptions, Statistic, Row, Col, Tag, Table, Empty, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api, fmtKm, fmtNarx, fmtSek, statusLabel, type OrderRow } from '../lib/api';

interface Props {
  callsign: string | null;
  open: boolean;
  onClose: () => void;
}

interface DriverResp {
  driver_name: string;
  stats: {
    total: number;
    completed: number;
    cancelled: number;
    alerts: number;
    totalScore: number;
    is_blocked: boolean;
  };
  orders: OrderRow[];
}

export default function DriverDrawer({ callsign, open, onClose }: Props): JSX.Element {
  const { data, isLoading } = useQuery<DriverResp>({
    queryKey: ['driver', callsign],
    queryFn: () =>
      api.get<DriverResp>('/driver', { params: { callsign } }).then((r) => r.data),
    enabled: !!callsign && open,
  });

  return (
    <Drawer
      title={
        callsign ? (
          <span>
            {data?.driver_name ?? callsign}{' '}
            <Tag style={{ marginLeft: 8 }}>{callsign}</Tag>
            {data?.stats.is_blocked && <Tag color="error">BLOK</Tag>}
          </span>
        ) : (
          'Haydovchi'
        )
      }
      open={open}
      onClose={onClose}
      width={920}
    >
      {isLoading || !data ? (
        <Spin />
      ) : (
        <>
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic title="Jami zakaz" value={data.stats.total} />
            </Col>
            <Col span={6}>
              <Statistic title="Bajarildi" value={data.stats.completed} valueStyle={{ color: '#16A34A' }} />
            </Col>
            <Col span={6}>
              <Statistic title="Bekor" value={data.stats.cancelled} valueStyle={{ color: '#F59E0B' }} />
            </Col>
            <Col span={6}>
              <Statistic
                title="Shubha balli"
                value={data.stats.totalScore}
                valueStyle={{ color: data.stats.totalScore >= 200 ? '#EF4444' : '#F59E0B' }}
              />
            </Col>
          </Row>

          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Pozyvnoy">{callsign}</Descriptions.Item>
            <Descriptions.Item label="Ogohlantirish">{data.stats.alerts}</Descriptions.Item>
          </Descriptions>

          <h3 style={{ margin: '12px 0' }}>Oxirgi 30 zakazi</h3>
          <Table
            size="small"
            rowKey="order_id"
            dataSource={data.orders}
            pagination={false}
            locale={{ emptyText: <Empty description="Zakaz topilmadi" /> }}
            columns={[
              { title: 'Sana', dataIndex: 'date', width: 100 },
              { title: 'Vaqt', dataIndex: 'time', width: 70 },
              { title: 'Hudud', dataIndex: 'region', width: 110 },
              { title: 'Masofa', render: (_, r) => fmtKm(r.distance_km), width: 90 },
              { title: 'Davomi', render: (_, r) => fmtSek(r.duration_sec), width: 100 },
              { title: 'Narx', render: (_, r) => fmtNarx(r.amount), width: 110 },
              {
                title: 'Status',
                render: (_, r) => (
                  <Tag color={r.status === 'finish' ? 'success' : 'warning'}>{statusLabel(r.status)}</Tag>
                ),
              },
              {
                title: 'Ball',
                render: (_, r) =>
                  r.fraud_score ? (
                    <Tag color={r.fraud_score >= 150 ? 'error' : r.fraud_score >= 80 ? 'warning' : 'processing'}>
                      {r.fraud_score}
                    </Tag>
                  ) : (
                    '—'
                  ),
                width: 80,
              },
            ]}
          />
        </>
      )}
    </Drawer>
  );
}
