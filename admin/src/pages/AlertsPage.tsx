import { Card, Table, Tag, Select, Space, Empty, Tooltip, Button, Modal, Input, App } from 'antd';
import { CheckOutlined, FlagOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, fmtKm, fmtNarx, fmtSek, fmtTime, type AlertRow, type RegionRow } from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

const ACTION_LABELS: Record<string, string> = {
  blocked: 'Bloklandi',
  warned: 'Ogohlantirildi',
  reviewed: 'Ko\'rib chiqildi',
  false_positive: 'Yolg\'on alarm',
};
const ACTION_COLORS: Record<string, string> = {
  blocked: 'error',
  warned: 'warning',
  reviewed: 'success',
  false_positive: 'default',
};

export default function AlertsPage(): JSX.Element {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [days, setDays] = useState(7);
  const [region, setRegion] = useState('');
  const [min, setMin] = useState(50);
  const [drvOpen, setDrvOpen] = useState<string | null>(null);
  const [actionFor, setActionFor] = useState<AlertRow | null>(null);
  const [actionType, setActionType] = useState<string>('reviewed');
  const [actionNote, setActionNote] = useState('');

  const actionMut = useMutation({
    mutationFn: (v: { alertId: number; action: string; note: string }) =>
      api.post('/alert/action', v),
    onSuccess: () => {
      message.success('Chora yozildi');
      setActionFor(null);
      setActionNote('');
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

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
            {
              title: 'Chora',
              width: 180,
              render: (_, r) =>
                r.action_taken ? (
                  <Tooltip title={`${r.action_by} • ${r.action_note || ''} • ${r.action_at}`}>
                    <Tag color={ACTION_COLORS[r.action_taken] ?? 'default'}>
                      ✓ {ACTION_LABELS[r.action_taken] ?? r.action_taken}
                    </Tag>
                  </Tooltip>
                ) : (
                  <Button
                    size="small"
                    icon={<FlagOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionFor(r);
                    }}
                  >
                    Chora ko'rish
                  </Button>
                ),
            },
          ]}
        />
      </Card>
      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />

      <Modal
        title={`Alert #${actionFor?.id} — chora belgilash`}
        open={!!actionFor}
        onCancel={() => setActionFor(null)}
        onOk={() => actionFor && actionMut.mutate({ alertId: actionFor.id, action: actionType, note: actionNote })}
        confirmLoading={actionMut.isPending}
        okText="Saqlash"
        cancelText="Bekor"
        okButtonProps={{ icon: <CheckOutlined /> }}
      >
        <p>
          <b>{actionFor?.driver_name}</b> <Tag>{actionFor?.callsign}</Tag>
        </p>
        <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>
          {actionFor?.details}
        </p>
        <Select
          value={actionType}
          onChange={setActionType}
          style={{ width: '100%', marginBottom: 12 }}
          options={[
            { value: 'reviewed', label: '✓ Ko\'rib chiqildi (normal)' },
            { value: 'warned', label: '⚠️ Ogohlantirildi' },
            { value: 'blocked', label: '⛔ Bloklandi' },
            { value: 'false_positive', label: '❌ Yolg\'on alarm' },
          ]}
        />
        <Input.TextArea
          rows={3}
          placeholder="Izoh — nima chora ko'rildi (ixtiyoriy)"
          value={actionNote}
          onChange={(e) => setActionNote(e.target.value)}
        />
      </Modal>
    </>
  );
}
