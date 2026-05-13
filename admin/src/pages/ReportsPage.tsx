import { Card, Row, Col, Statistic, DatePicker, Space, Tag, Table, Empty, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { api, fmtKm, fmtNarx, fmtTime, type AlertRow } from '../lib/api';

interface ReportResp {
  summary: {
    totalOrders: number;
    completed: number;
    cancelled: number;
    alerts: number;
    blocks: number;
    suspectClients: number;
  };
  byRegion: Array<{ region: string; orders: number; alerts: number }>;
  topDrivers: Array<{ callsign: string; driver_name: string; alerts: number; total: number }>;
  recentAlerts: AlertRow[];
}

export default function ReportsPage(): JSX.Element {
  const [from, setFrom] = useState<Dayjs>(dayjs().subtract(6, 'day'));
  const [to, setTo] = useState<Dayjs>(dayjs());

  const { data } = useQuery<ReportResp>({
    queryKey: ['report', from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD')],
    queryFn: () =>
      api
        .get('/report', { params: { from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD') } })
        .then((r) => r.data),
  });

  const exportCsv = (): void => {
    if (!data) return;
    const rows = [
      ['Hudud', 'Zakaz', 'Alert'],
      ...data.byRegion.map((r) => [r.region, r.orders, r.alerts]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `royaltaxi-report-${from.format('YYYY-MM-DD')}-${to.format('YYYY-MM-DD')}.csv`;
    a.click();
  };

  return (
    <Card
      title="📑 Davr bo'yicha hisobot"
      extra={
        <Space>
          <DatePicker value={from} onChange={(d) => d && setFrom(d)} placeholder="Boshlanish" />
          <DatePicker value={to} onChange={(d) => d && setTo(d)} placeholder="Tugash" />
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>CSV yuklab olish</Button>
        </Space>
      }
    >
      <Row gutter={[12, 12]}>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Zakaz" value={data?.summary.totalOrders ?? 0} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Bajarildi" value={data?.summary.completed ?? 0} valueStyle={{ color: '#16A34A' }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Bekor" value={data?.summary.cancelled ?? 0} valueStyle={{ color: '#F59E0B' }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Alert" value={data?.summary.alerts ?? 0} valueStyle={{ color: '#EF4444' }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Blok" value={data?.summary.blocks ?? 0} valueStyle={{ color: '#EF4444' }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Shubhali mijoz" value={data?.summary.suspectClients ?? 0} valueStyle={{ color: '#F59E0B' }} /></Card></Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} md={12}>
          <Card size="small" title="🗺 Hududlar bo'yicha">
            <Table
              size="small"
              rowKey="region"
              dataSource={data?.byRegion ?? []}
              pagination={false}
              locale={{ emptyText: <Empty /> }}
              columns={[
                { title: 'Hudud', dataIndex: 'region' },
                { title: 'Zakaz', dataIndex: 'orders', width: 90 },
                { title: 'Alert', dataIndex: 'alerts', width: 90, render: (v) => v ? <Tag color="warning">{v}</Tag> : '0' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title="🚖 Top shubhali haydovchilar">
            <Table
              size="small"
              rowKey="callsign"
              dataSource={data?.topDrivers ?? []}
              pagination={false}
              locale={{ emptyText: <Empty /> }}
              columns={[
                { title: 'Belgi', dataIndex: 'callsign', width: 110, render: (v) => <Tag>{v}</Tag> },
                { title: 'Haydovchi', dataIndex: 'driver_name' },
                { title: 'Alert', dataIndex: 'alerts', width: 80 },
                { title: 'Ball', dataIndex: 'total', width: 90, render: (v) => <Tag color="error">{v}</Tag> },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="🚨 So'nggi 20 alert" style={{ marginTop: 12 }}>
        <Table<AlertRow>
          size="small"
          rowKey="id"
          dataSource={data?.recentAlerts ?? []}
          pagination={false}
          locale={{ emptyText: <Empty /> }}
          columns={[
            { title: 'Vaqt', render: (_, r) => fmtTime(r.created_at), width: 150 },
            { title: 'Haydovchi', render: (_, r) => <span><Tag>{r.callsign}</Tag> {r.driver_name}</span> },
            { title: 'Masofa', render: (_, r) => fmtKm(r.distance_km), width: 90 },
            { title: 'Narx', render: (_, r) => fmtNarx(r.amount), width: 110 },
            { title: 'Ball', dataIndex: 'fraud_score', width: 80, render: (v) => <Tag color={v >= 150 ? 'error' : 'warning'}>{v}</Tag> },
          ]}
        />
      </Card>
    </Card>
  );
}
