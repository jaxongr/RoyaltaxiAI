import { Card, Table, Tag, Select, Space, Empty, Tooltip } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, fmtKm, fmtNarx, fmtSek, fmtTime, type AlertRow, type RegionRow } from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

export default function AlertsPage(): JSX.Element {
  const [days, setDays] = useState(7);
  const [region, setRegion] = useState('');
  const [min, setMin] = useState(50);
  const [drvOpen, setDrvOpen] = useState<string | null>(null);

  const { data: regions } = useQuery<{ items: RegionRow[] }>({
    queryKey: ['regions'],
    queryFn: () => api.get('/regions').then((r) => r.data),
  });
  const { data, isFetching } = useQuery<{ items: AlertRow[] }>({
    queryKey: ['alerts', days, region, min],
    queryFn: () => api.get('/alerts', { params: { days, region, minScore: min, limit: 500 } }).then((r) => r.data),
    refetchInterval: 5000,
  });

  return (
    <>
      <Card
        title={`⚠️ Ogohlantirishlar (${data?.items.length ?? 0})`}
        extra={
          <Space>
            <Select
              value={days}
              onChange={setDays}
              style={{ width: 150 }}
              options={[
                { value: 1, label: 'Bugun' },
                { value: 7, label: 'Oxirgi 7 kun' },
                { value: 30, label: '30 kun' },
                { value: 999, label: 'Hammasi' },
              ]}
            />
            <Select
              value={region}
              onChange={setRegion}
              style={{ width: 180 }}
              placeholder="Hudud"
              allowClear
              options={[
                { value: '', label: 'Barcha hududlar' },
                ...(regions?.items.map((r) => ({ value: r.region, label: r.region })) ?? []),
              ]}
            />
            <Select
              value={min}
              onChange={setMin}
              style={{ width: 150 }}
              options={[
                { value: 50, label: 'Ball ≥ 50' },
                { value: 80, label: 'Ball ≥ 80' },
                { value: 100, label: 'Ball ≥ 100' },
                { value: 150, label: 'Ball ≥ 150' },
              ]}
            />
          </Space>
        }
      >
        <Table<AlertRow>
          size="middle"
          rowKey="id"
          loading={isFetching}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 30, showSizeChanger: true }}
          locale={{ emptyText: <Empty /> }}
          onRow={(r) => ({ onClick: () => setDrvOpen(r.callsign), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Vaqt', render: (_, r) => fmtTime(r.created_at), width: 150 },
            { title: 'Belgi', dataIndex: 'callsign', width: 110, render: (v) => <Tag>{v || '—'}</Tag> },
            { title: 'Haydovchi', dataIndex: 'driver_name', ellipsis: true },
            { title: 'Hudud', dataIndex: 'region', width: 110 },
            { title: 'Masofa', render: (_, r) => fmtKm(r.distance_km), width: 90 },
            { title: 'Davomi', render: (_, r) => fmtSek(r.duration_sec), width: 100 },
            { title: 'Narx', render: (_, r) => fmtNarx(r.amount), width: 110 },
            {
              title: 'Sabab',
              dataIndex: 'details',
              ellipsis: true,
              render: (v) => (
                <Tooltip title={v} placement="topLeft">
                  <span style={{ color: '#6B7280', fontSize: 12 }}>{v}</span>
                </Tooltip>
              ),
            },
            {
              title: 'Ball',
              dataIndex: 'fraud_score',
              width: 80,
              render: (v) => <Tag color={v >= 150 ? 'error' : v >= 80 ? 'warning' : 'processing'}>{v}</Tag>,
            },
          ]}
        />
      </Card>
      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />
    </>
  );
}
