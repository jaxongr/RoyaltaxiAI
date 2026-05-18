import { Card, Descriptions, Table, Tag, Row, Col, Statistic, Empty, Spin } from 'antd';
import { UserOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { api, fmtKm, fmtNarx, statusLabel, type ClientDetailResponse } from '../lib/api';

export default function ClientDetailPage(): JSX.Element {
  const { phone = '' } = useParams<{ phone: string }>();
  const navigate = useNavigate();

  const { data, isFetching } = useQuery<ClientDetailResponse>({
    queryKey: ['client', phone],
    queryFn: () => api.get('/client', { params: { phone } }).then((r) => r.data),
    enabled: !!phone,
  });

  if (isFetching) return <Spin size="large" style={{ display: 'block', margin: 80 }} />;
  if (!data || !data.summary) return <Empty description="Mijoz topilmadi" />;

  const s = data.summary;
  const cancelRate = s.orders_total > 0 ? Math.round((s.cancelled / s.orders_total) * 100) : 0;

  return (
    <div>
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        style={{ marginBottom: 12 }}
      >
        Orqaga
      </Button>

      <Card
        title={<span><UserOutlined /> Mijoz: <code>{phone}</code></span>}
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16}>
          <Col xs={12} md={6}><Statistic title="Jami zakaz" value={s.orders_total} /></Col>
          <Col xs={12} md={6}><Statistic title="Bajarildi" value={s.completed} valueStyle={{ color: '#52c41a' }} /></Col>
          <Col xs={12} md={6}>
            <Statistic
              title="Bekor"
              value={s.cancelled}
              suffix={`(${cancelRate}%)`}
              valueStyle={{ color: cancelRate > 30 ? '#cf1322' : '#666' }}
            />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="Jami xarajat" value={s.total_spent} formatter={(v) => fmtNarx(Number(v))} />
          </Col>
        </Row>
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col xs={12} md={6}>
            <Statistic title="O'rtacha chek" value={s.avg_check} formatter={(v) => fmtNarx(Math.round(Number(v)))} />
          </Col>
          <Col xs={12} md={6}><Statistic title="Haydovchilar soni" value={s.drivers_used} /></Col>
          <Col xs={12} md={6}>
            <Statistic title="Telefon ko'tarmadi" value={s.no_answer} valueStyle={{ color: s.no_answer > 2 ? '#cf1322' : '#666' }} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="Allaqachon ketgan" value={s.already_left} valueStyle={{ color: s.already_left > 2 ? '#cf1322' : '#666' }} />
          </Col>
        </Row>
        <Descriptions size="small" column={2} style={{ marginTop: 16 }}>
          <Descriptions.Item label="Birinchi zakaz">{s.first_order}</Descriptions.Item>
          <Descriptions.Item label="Oxirgi zakaz">{s.last_order}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="📍 Eng faol hududlar" style={{ marginBottom: 16 }}>
            <Table
              size="small"
              rowKey="region"
              dataSource={data.byRegion}
              pagination={false}
              columns={[
                { title: 'Hudud', dataIndex: 'region', render: (v) => <Tag color="blue">{v}</Tag> },
                { title: 'Zakaz', dataIndex: 'cnt' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="🚕 Afzal ko'rgan haydovchilar" style={{ marginBottom: 16 }}>
            <Table
              size="small"
              rowKey="callsign"
              dataSource={data.byDriver}
              pagination={false}
              columns={[
                { title: 'Belgi', dataIndex: 'callsign', render: (v) => <Tag>{v}</Tag> },
                { title: 'Haydovchi', dataIndex: 'driver_name', ellipsis: true },
                { title: 'Zakaz', dataIndex: 'cnt' },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title={`📋 Oxirgi ${data.recentOrders.length} zakaz`}>
        <Table
          size="small"
          rowKey="order_id"
          dataSource={data.recentOrders}
          pagination={{ pageSize: 30 }}
          columns={[
            { title: 'Sana', render: (_, r) => `${r.date} ${r.time}`, width: 130 },
            { title: 'Haydovchi', render: (_, r) => `${r.callsign} ${r.driver_name}`, ellipsis: true },
            { title: 'Hudud', dataIndex: 'region', width: 110 },
            { title: 'Manzil', dataIndex: 'address', ellipsis: true },
            { title: 'Masofa', render: (_, r) => fmtKm(r.distance_km), width: 90 },
            { title: 'Narx', render: (_, r) => fmtNarx(r.amount), width: 110 },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 120,
              render: (v: string, r) => (
                <Tag color={v === 'finish' ? 'success' : 'warning'}>
                  {v === 'finish' ? 'Bajarildi' : (r.cancel_kind ?? statusLabel(v))}
                </Tag>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
