import { Card, Col, Row, Statistic, Table, Tag, Empty } from 'antd';
import {
  CarOutlined,
  WarningOutlined,
  StopOutlined,
  AimOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  api,
  fmtKm,
  fmtNarx,
  fmtTime,
  fmtTimeShort,
  type AlertRow,
  type BlockRow,
  type Overview,
} from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

export default function DashboardPage(): JSX.Element {
  const [drvOpen, setDrvOpen] = useState<string | null>(null);
  const { data: ov } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () => api.get<Overview>('/overview').then((r) => r.data),
    refetchInterval: 3000,
  });
  const { data: alerts } = useQuery<{ items: AlertRow[] }>({
    queryKey: ['alerts-recent'],
    queryFn: () => api.get('/alerts', { params: { limit: 15 } }).then((r) => r.data),
    refetchInterval: 5000,
  });
  const { data: blocks } = useQuery<{ items: BlockRow[] }>({
    queryKey: ['blocks-recent'],
    queryFn: () => api.get('/blocks', { params: { limit: 10 } }).then((r) => r.data),
    refetchInterval: 5000,
  });

  return (
    <>
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic title="Bugun zakaz" value={ov?.ordersToday ?? 0} prefix={<CarOutlined />} valueStyle={{ color: '#0066FF' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic title="Ogohlantirish" value={ov?.alertsToday ?? 0} prefix={<WarningOutlined />} valueStyle={{ color: '#F59E0B' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic title="Blok tavsiya" value={ov?.blocksTotal ?? 0} prefix={<StopOutlined />} valueStyle={{ color: '#EF4444' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic title="Oxirgi 1 soat" value={ov?.alertsLastHour ?? 0} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#16A34A' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic
              title="Qamrov"
              value={ov?.coveragePct === null || ov?.coveragePct === undefined ? '—' : `${ov.coveragePct.toFixed(1)}%`}
              prefix={<AimOutlined />}
              valueStyle={{
                color: !ov?.coveragePct || ov.coveragePct < 95 ? '#EF4444' : ov.coveragePct < 99 ? '#F59E0B' : '#16A34A',
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card>
            <Statistic title="Tezlik" value={`${ov?.rate ?? 0} /min`} prefix={<ThunderboltOutlined />} valueStyle={{ color: '#0066FF' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="🚨 Eng so'nggi ogohlantirishlar" size="small">
            <Table<AlertRow>
              size="small"
              rowKey="id"
              dataSource={alerts?.items ?? []}
              pagination={false}
              locale={{ emptyText: <Empty description="Hozircha ogohlantirish yo'q" /> }}
              onRow={(r) => ({ onClick: () => setDrvOpen(r.callsign), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Vaqt', render: (_, r) => fmtTimeShort(r.created_at), width: 70 },
                {
                  title: 'Haydovchi',
                  render: (_, r) => (
                    <span>
                      <Tag>{r.callsign || '—'}</Tag> {r.driver_name || ''}
                    </span>
                  ),
                },
                { title: 'Masofa', render: (_, r) => fmtKm(r.distance_km), width: 80 },
                { title: 'Narx', render: (_, r) => fmtNarx(r.amount), width: 100 },
                {
                  title: 'Ball',
                  width: 70,
                  render: (_, r) => (
                    <Tag color={r.fraud_score >= 150 ? 'error' : r.fraud_score >= 80 ? 'warning' : 'processing'}>
                      {r.fraud_score}
                    </Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="⛔ Blok tavsiyalari" size="small">
            <Table<BlockRow>
              size="small"
              rowKey="callsign"
              dataSource={blocks?.items ?? []}
              pagination={false}
              locale={{ emptyText: <Empty description="Hozircha blok yo'q" /> }}
              onRow={(r) => ({ onClick: () => setDrvOpen(r.callsign), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Belgi', dataIndex: 'callsign', width: 100, render: (v) => <Tag>{v}</Tag> },
                { title: 'Haydovchi', dataIndex: 'driver_name' },
                { title: 'Alert', dataIndex: 'alert_count', width: 70 },
                {
                  title: 'Ball',
                  dataIndex: 'total_score',
                  width: 80,
                  render: (v) => <Tag color="error">{v}</Tag>,
                },
                { title: 'Vaqt', render: (_, r) => fmtTime(r.blocked_at), width: 130 },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />
    </>
  );
}
