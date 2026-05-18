import { Card, Table, Tag, Progress, Empty, Modal, Descriptions, Statistic, Row, Col, Button, Popconfirm, message } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type RegionRow } from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

export default function RegionsPage(): JSX.Element {
  const [open, setOpen] = useState<string | null>(null);
  const [drvOpen, setDrvOpen] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data } = useQuery<{ items: RegionRow[] }>({
    queryKey: ['regions'],
    queryFn: () => api.get('/regions').then((r) => r.data),
    refetchInterval: 10_000,
  });
  const items = data?.items ?? [];
  const max = Math.max(...items.map((r) => r.orders), 1);

  const blockMut = useMutation({
    mutationFn: (name: string) => api.post('/region/blacklist', { name }),
    onSuccess: (r, name) => {
      const updated = (r.data as { updatedOrders?: number })?.updatedOrders ?? 0;
      message.success(`"${name}" bloklandi (${updated} ta zakaz tozalandi)`);
      qc.invalidateQueries({ queryKey: ['regions'] });
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      message.error(e.response?.data?.error ?? 'Xato'),
  });

  return (
    <>
      <Card title={`🗺 Hududlar (${items.length} ta)`}>
        <Table<RegionRow>
          size="middle"
          rowKey="region"
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty /> }}
          onRow={(r) => ({
            onClick: (e) => {
              // Agar Blok tugmasi yoki Popconfirm ichidan kelgan bo'lsa — modal ochmaslik
              const target = e.target as HTMLElement;
              if (target.closest('.region-block-action, .ant-popover, .ant-modal')) return;
              setOpen(r.region);
            },
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              title: 'Hudud',
              dataIndex: 'region',
              render: (v) => <b>{v || '(noma\'lum)'}</b>,
              width: 200,
            },
            {
              title: 'Zakazlar',
              dataIndex: 'orders',
              width: 200,
              render: (v) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Progress percent={(v / max) * 100} showInfo={false} strokeColor="#FC3F1D" style={{ flex: 1 }} />
                  <b style={{ minWidth: 50, textAlign: 'right' }}>{v}</b>
                </div>
              ),
              sorter: (a, b) => a.orders - b.orders,
              defaultSortOrder: 'descend',
            },
            {
              title: 'Bajarildi',
              dataIndex: 'completed',
              width: 100,
              render: (v) => <Tag color="success">{v}</Tag>,
            },
            { title: 'Bekor', dataIndex: 'cancelled', width: 90, render: (v) => <Tag color="warning">{v}</Tag> },
            {
              title: 'Bekor %',
              width: 90,
              render: (_, r) => (r.orders ? `${((r.cancelled / r.orders) * 100).toFixed(1)}%` : '—'),
            },
            {
              title: 'Alert',
              dataIndex: 'alerts',
              width: 90,
              render: (v) => (v ? <Tag color="warning">{v}</Tag> : '0'),
            },
            { title: 'Top haydovchi', dataIndex: 'topDriver', ellipsis: true },
            {
              title: 'Amal',
              width: 100,
              render: (_, r) => (
                <span className="region-block-action" onClick={(e) => e.stopPropagation()}>
                  <Popconfirm
                    title="Bu hududni bloklash"
                    description={`"${r.region}" hududini ro'yxatdan o'chirilsinmi?`}
                    okText="Ha, blokla"
                    cancelText="Yo'q"
                    onConfirm={() => blockMut.mutate(r.region)}
                  >
                    <Button danger size="small" icon={<StopOutlined />} loading={blockMut.isPending}>
                      Blok
                    </Button>
                  </Popconfirm>
                </span>
              ),
            },
          ]}
        />
      </Card>

      <RegionModal name={open} onClose={() => setOpen(null)} onDriver={setDrvOpen} />
      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />
    </>
  );
}

interface RegionDetail {
  stats: { today: number; completed: number; cancelled: number; alerts: number };
  drivers: Array<{ callsign: string; driver_name: string; orders: number; completed: number; cancelled: number; alerts: number }>;
}

function RegionModal({
  name,
  onClose,
  onDriver,
}: {
  name: string | null;
  onClose: () => void;
  onDriver: (s: string) => void;
}): JSX.Element {
  const { data } = useQuery<RegionDetail>({
    queryKey: ['region', name],
    queryFn: () => api.get('/region', { params: { name } }).then((r) => r.data),
    enabled: !!name,
  });

  return (
    <Modal open={!!name} onCancel={onClose} footer={null} width={900} title={`🗺 ${name ?? ''}`}>
      {data && (
        <>
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={6}><Statistic title="Bugun zakaz" value={data.stats.today} /></Col>
            <Col span={6}><Statistic title="Bajarildi" value={data.stats.completed} valueStyle={{ color: '#16A34A' }} /></Col>
            <Col span={6}><Statistic title="Bekor" value={data.stats.cancelled} valueStyle={{ color: '#F59E0B' }} /></Col>
            <Col span={6}><Statistic title="Alert" value={data.stats.alerts} valueStyle={{ color: '#EF4444' }} /></Col>
          </Row>
          <Descriptions title="Bugungi haydovchilar" />
          <Table
            size="small"
            rowKey="callsign"
            dataSource={data.drivers}
            pagination={false}
            onRow={(r) => ({ onClick: () => onDriver(r.callsign), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Belgi', dataIndex: 'callsign', render: (v) => <Tag>{v}</Tag>, width: 100 },
              { title: 'Haydovchi', dataIndex: 'driver_name' },
              { title: 'Zakaz', dataIndex: 'orders', width: 80 },
              { title: 'Bajarildi', dataIndex: 'completed', width: 100 },
              { title: 'Bekor', dataIndex: 'cancelled', width: 80 },
              { title: 'Alert', dataIndex: 'alerts', width: 80, render: (v) => (v ? <Tag color="warning">{v}</Tag> : '0') },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
