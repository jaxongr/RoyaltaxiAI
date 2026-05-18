import { Card, Table, Tag, Select, Empty, Button, Tooltip, Segmented } from 'antd';
import { CrownOutlined, DownloadOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api, fmtNarx, fmtKm, type TopEarnerRow } from '../lib/api';

type BlockFilter = 'all' | 'active' | 'blocked';

export default function TopEarnersPage(): JSX.Element {
  const [days, setDays] = useState(7);
  const [blockFilter, setBlockFilter] = useState<BlockFilter>('all');
  const { data, isFetching } = useQuery<{ items: TopEarnerRow[] }>({
    queryKey: ['top-earners', days],
    queryFn: () => api.get('/top-earners', { params: { days } }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    if (blockFilter === 'active') return items.filter((d) => !d.is_blocked);
    if (blockFilter === 'blocked') return items.filter((d) => d.is_blocked);
    return items;
  }, [items, blockFilter]);
  const activeCount = items.filter((d) => !d.is_blocked).length;
  const blockedCount = items.filter((d) => d.is_blocked).length;

  const exportCsv = (): void => {
    const url = `/api/export/top-earners?days=${days}`;
    const token = localStorage.getItem('auth_token') ?? '';
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `top-earners-${days}d.csv`;
        a.click();
      });
  };

  return (
    <Card
      title={<span><CrownOutlined /> Top haydovchilar — daromad reytingi</span>}
      extra={
        <span>
          <Select
            value={days}
            onChange={setDays}
            style={{ width: 150, marginRight: 8 }}
            options={[
              { value: 1, label: 'Bugun' },
              { value: 7, label: 'Oxirgi 7 kun' },
              { value: 30, label: '30 kun' },
              { value: 90, label: '90 kun' },
            ]}
          />
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>CSV</Button>
        </span>
      }
    >
      <p style={{ color: '#6B7280', marginBottom: 12 }}>
        Eng ko'p daromad qilgan haydovchilar. Alertlar yoki bloklar ham ko'rsatiladi —
        agar daromadi baland va alertlari ko'p bo'lsa, bu fraud signali bo'lishi mumkin.
      </p>
      <Segmented
        value={blockFilter}
        onChange={(v) => setBlockFilter(v as BlockFilter)}
        options={[
          { value: 'all', label: `Hammasi (${items.length})` },
          { value: 'active', label: <span><CheckCircleOutlined /> Aktiv ({activeCount})</span> },
          { value: 'blocked', label: <span><StopOutlined /> Bloklangan ({blockedCount})</span> },
        ]}
        style={{ marginBottom: 12 }}
      />
      <Table<TopEarnerRow>
        rowClassName={(r) => (r.is_blocked ? 'row-blocked' : '')}
        size="middle"
        rowKey="callsign"
        loading={isFetching}
        dataSource={filtered}
        pagination={{ pageSize: 50 }}
        locale={{ emptyText: <Empty /> }}
        columns={[
          {
            title: '#',
            width: 60,
            render: (_, __, i) => <Tag color={i < 3 ? 'gold' : 'default'}>{i + 1}</Tag>,
          },
          { title: 'Belgi', dataIndex: 'callsign', width: 100, render: (v) => <Tag>{v}</Tag> },
          { title: 'Haydovchi', dataIndex: 'driver_name', ellipsis: true },
          { title: 'Hudud', dataIndex: 'region', width: 110 },
          {
            title: 'Jami zakaz',
            dataIndex: 'orders',
            width: 100,
            sorter: (a, b) => a.orders - b.orders,
          },
          {
            title: 'Bajarildi',
            dataIndex: 'completed',
            width: 100,
            render: (v) => <Tag color="success">{v}</Tag>,
          },
          {
            title: 'Bekor',
            dataIndex: 'cancelled',
            width: 80,
            render: (v) => (v > 0 ? <Tag color="warning">{v}</Tag> : '—'),
          },
          {
            title: 'O\'rt. chek',
            dataIndex: 'avg_check',
            width: 130,
            render: (v) => fmtNarx(Math.round(v)),
            sorter: (a, b) => a.avg_check - b.avg_check,
          },
          {
            title: 'Jami km',
            dataIndex: 'total_km',
            width: 110,
            render: (v) => fmtKm(v),
          },
          {
            title: 'Jami daromad',
            dataIndex: 'total_amount',
            width: 160,
            render: (v) => <b style={{ color: '#1677ff' }}>{fmtNarx(v)}</b>,
            sorter: (a, b) => a.total_amount - b.total_amount,
            defaultSortOrder: 'descend',
          },
          {
            title: 'Alert',
            dataIndex: 'alerts',
            width: 80,
            render: (v: number) =>
              v > 0 ? (
                <Tooltip title="Shubhali zakazlar soni">
                  <Tag color="error">{v}</Tag>
                </Tooltip>
              ) : (
                '—'
              ),
          },
          {
            title: 'BLOK Holati',
            dataIndex: 'is_blocked',
            width: 140,
            render: (v) =>
              v ? (
                <Tag color="error" icon={<StopOutlined />} style={{ fontWeight: 600 }}>
                  BLOKLANGAN
                </Tag>
              ) : (
                <Tag color="success" icon={<CheckCircleOutlined />}>aktiv</Tag>
              ),
            filters: [
              { text: 'Aktiv', value: 0 },
              { text: 'Bloklangan', value: 1 },
            ],
            onFilter: (val, r) => (val === 1 ? !!r.is_blocked : !r.is_blocked),
          },
        ]}
      />

      <style>{`
        .row-blocked td { background-color: #fff1f0 !important; }
      `}</style>
    </Card>
  );
}
