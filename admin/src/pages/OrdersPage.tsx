import { Card, Table, Tag, Select, Space, Input, DatePicker, Empty, Modal, Descriptions } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { api, fmtKm, fmtNarx, fmtSek, statusLabel, type OrderRow, type RegionRow } from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

export default function OrdersPage(): JSX.Element {
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('');
  const [driver, setDriver] = useState('');
  const [orderModal, setOrderModal] = useState<number | null>(null);
  const [drvOpen, setDrvOpen] = useState<string | null>(null);

  const { data: regions } = useQuery<{ items: RegionRow[] }>({
    queryKey: ['regions'],
    queryFn: () => api.get('/regions').then((r) => r.data),
  });
  const { data, isFetching } = useQuery<{ total: number; items: OrderRow[] }>({
    queryKey: ['orders', date.format('YYYY-MM-DD'), region, status, driver],
    queryFn: () =>
      api.get('/orders', { params: { date: date.format('YYYY-MM-DD'), region, status, driver, limit: 1000 } }).then((r) => r.data),
  });

  return (
    <>
      <Card
        title={`📦 Zakazlar (${data?.total ?? 0})`}
        extra={
          <Space wrap>
            <DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} />
            <Select
              value={region}
              onChange={setRegion}
              style={{ width: 180 }}
              options={[
                { value: '', label: 'Barcha hududlar' },
                ...(regions?.items.map((r) => ({ value: r.region, label: r.region })) ?? []),
              ]}
            />
            <Select
              value={status}
              onChange={setStatus}
              style={{ width: 160 }}
              options={[
                { value: '', label: 'Barcha statuslar' },
                { value: 'finish', label: 'Bajarildi' },
                { value: 'order_cancelled', label: 'Bekor' },
              ]}
            />
            <Input
              placeholder="Haydovchi (ism yoki belgi)"
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              allowClear
              style={{ width: 200 }}
            />
          </Space>
        }
      >
        <Table<OrderRow>
          size="small"
          rowKey="order_id"
          loading={isFetching}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 50, showSizeChanger: true }}
          locale={{ emptyText: <Empty /> }}
          onRow={(r) => ({ onClick: () => setOrderModal(r.order_id), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Vaqt', dataIndex: 'time', width: 70 },
            {
              title: 'Belgi',
              dataIndex: 'callsign',
              width: 110,
              render: (v) => (
                <a onClick={(e) => { e.stopPropagation(); setDrvOpen(v); }}>
                  <Tag>{v || '—'}</Tag>
                </a>
              ),
            },
            { title: 'Haydovchi', dataIndex: 'driver_name', ellipsis: true },
            { title: 'Hudud', dataIndex: 'region', width: 110 },
            { title: 'Masofa', render: (_, r) => fmtKm(r.distance_km), width: 80 },
            { title: 'Narx', render: (_, r) => fmtNarx(r.amount), width: 110 },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 130,
              render: (v) => <Tag color={v === 'finish' ? 'success' : 'warning'}>{statusLabel(v)}</Tag>,
            },
            {
              title: 'Ball',
              dataIndex: 'fraud_score',
              width: 70,
              render: (v) =>
                v ? <Tag color={v >= 150 ? 'error' : v >= 80 ? 'warning' : 'processing'}>{v}</Tag> : '—',
            },
          ]}
        />
      </Card>

      <OrderModal id={orderModal} onClose={() => setOrderModal(null)} />
      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />
    </>
  );
}

function OrderModal({ id, onClose }: { id: number | null; onClose: () => void }): JSX.Element {
  const { data } = useQuery<{ order: OrderRow | null }>({
    queryKey: ['order', id],
    queryFn: () => api.get('/order', { params: { id } }).then((r) => r.data),
    enabled: !!id,
  });
  const o = data?.order;
  return (
    <Modal open={!!id} onCancel={onClose} footer={null} width={780} title={`📦 Zakaz #${id ?? ''}`}>
      {o && (
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Sana">{o.date}</Descriptions.Item>
          <Descriptions.Item label="Vaqt">{o.time}</Descriptions.Item>
          <Descriptions.Item label="Hudud">{o.region}</Descriptions.Item>
          <Descriptions.Item label="Tarif">{o.tariff}</Descriptions.Item>
          <Descriptions.Item label="Haydovchi">{o.driver_name} ({o.callsign})</Descriptions.Item>
          <Descriptions.Item label="Mashina">{o.car}</Descriptions.Item>
          <Descriptions.Item label="Mijoz">{o.client_phone || '—'}</Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={o.status === 'finish' ? 'success' : 'warning'}>{statusLabel(o.status)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Masofa">{fmtKm(o.distance_km)}</Descriptions.Item>
          <Descriptions.Item label="Davomiylik">{fmtSek(o.duration_sec)}</Descriptions.Item>
          <Descriptions.Item label="To'lov">{fmtNarx(o.amount)}</Descriptions.Item>
          <Descriptions.Item label="Shubha balli">
            {o.fraud_score ? <Tag color={o.fraud_score >= 150 ? 'error' : 'warning'}>{o.fraud_score}</Tag> : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Manzil" span={2}>{o.address}</Descriptions.Item>
          {o.fraud_reasons && (
            <Descriptions.Item label="Sabablar" span={2}>{o.fraud_reasons}</Descriptions.Item>
          )}
        </Descriptions>
      )}
    </Modal>
  );
}
