import { Card, Col, Row, Progress, Table, Tag, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, fraudTypeLabel } from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

interface StatsResp {
  hourly: Array<{ hour: string; c: number }>;
  daily: Array<{ date: string; c: number }>;
  fraudTypes: Array<{ label: string; c: number }>;
  topBadDrivers: Array<{ callsign: string; driver_name: string; cnt: number; total: number }>;
}

export default function StatsPage(): JSX.Element {
  const [drvOpen, setDrvOpen] = useState<string | null>(null);
  const { data } = useQuery<StatsResp>({
    queryKey: ['stats'],
    queryFn: () => api.get('/stats').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const hourly = data?.hourly ?? [];
  const daily = data?.daily ?? [];
  const ft = data?.fraudTypes ?? [];
  const topBad = data?.topBadDrivers ?? [];
  const hourMax = Math.max(...hourly.map((h) => h.c), 1);
  const dailyMax = Math.max(...daily.map((h) => h.c), 1);
  const ftMax = Math.max(...ft.map((h) => h.c), 1);

  return (
    <>
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="📊 Bugungi soatlik faollik">
            {hourly.length === 0 ? <Empty /> : hourly.map((h) => (
              <div key={h.hour} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <div style={{ width: 50, fontSize: 13 }}>{h.hour}:00</div>
                <Progress percent={(h.c / hourMax) * 100} showInfo={false} strokeColor="#FC3F1D" style={{ flex: 1 }} />
                <b style={{ width: 60, textAlign: 'right' }}>{h.c}</b>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="📅 Oxirgi 7 kun">
            {daily.length === 0 ? <Empty /> : daily.map((h) => (
              <div key={h.date} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <div style={{ width: 110, fontSize: 13 }}>{h.date}</div>
                <Progress percent={(h.c / dailyMax) * 100} showInfo={false} strokeColor="#0066FF" style={{ flex: 1 }} />
                <b style={{ width: 60, textAlign: 'right' }}>{h.c}</b>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="🎯 Firibgarlik turlari (oxirgi 7 kun)">
            {ft.length === 0 ? <Empty /> : ft.map((h) => (
              <div key={h.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <div style={{ width: 160, fontSize: 13 }}>{fraudTypeLabel(h.label)}</div>
                <Progress percent={(h.c / ftMax) * 100} showInfo={false} strokeColor="#F59E0B" style={{ flex: 1 }} />
                <b style={{ width: 60, textAlign: 'right' }}>{h.c}</b>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="🚖 Eng yomon 10 haydovchi (oxirgi 7 kun)">
            <Table
              size="small"
              rowKey="callsign"
              dataSource={topBad}
              pagination={false}
              onRow={(r) => ({ onClick: () => setDrvOpen(r.callsign), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Belgi', dataIndex: 'callsign', width: 110, render: (v) => <Tag>{v}</Tag> },
                { title: 'Haydovchi', dataIndex: 'driver_name' },
                { title: 'Alert', dataIndex: 'cnt', width: 70 },
                {
                  title: 'Ball',
                  dataIndex: 'total',
                  width: 90,
                  render: (v) => <Tag color={v >= 300 ? 'error' : 'warning'}>{v}</Tag>,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />
    </>
  );
}
