import { Card, Table, Tag, Button, App, Modal, Form, Input, Select, Popconfirm, Empty, Drawer, Descriptions, Tooltip } from 'antd';
import { StopOutlined, ExclamationCircleOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, fmtKm, fmtSek, fmtTime, fmtNarx, type ViolatorRow } from '../lib/api';

interface ViolationRow {
  id: number;
  order_id: number;
  fraud_type: string;
  fraud_score: number;
  details: string;
  created_at: string;
  action_taken: string | null;
  distance_km: number | null;
  duration_sec: number | null;
  amount: number | null;
  region: string | null;
  status: string;
  cancel_kind: string | null;
  date: string;
  time: string;
}

interface BlockForm {
  callsign: string;
  driver_id: string;
  office_id: string;
  driver_name: string;
  kind: string;
  reason: string;
}

export default function ViolatorsPage(): JSX.Element {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [days, setDays] = useState(7);
  const [drawerCallsign, setDrawerCallsign] = useState<string | null>(null);
  const [blockFor, setBlockFor] = useState<ViolatorRow | null>(null);
  const [form] = Form.useForm<BlockForm>();

  const { data, isFetching } = useQuery<{ items: ViolatorRow[] }>({
    queryKey: ['violators', days],
    queryFn: () => api.get('/violators', { params: { days } }).then((r) => r.data),
    refetchInterval: 15_000,
  });

  const blockMut = useMutation({
    mutationFn: (v: BlockForm) => api.post('/site-block', v),
    onSuccess: (r) => {
      if (r.data.ok) {
        message.success(`✅ ${r.data.driver} saytda bloklandi`);
        setBlockFor(null);
        qc.invalidateQueries({ queryKey: ['violators'] });
      } else {
        message.error('Xato: ' + (r.data.error ?? 'noma\'lum'));
      }
    },
    onError: (e: Error) => message.error(e.message),
  });

  const openBlock = (v: ViolatorRow): void => {
    setBlockFor(v);
    form.setFieldsValue({
      callsign: v.callsign,
      driver_id: v.driver_id ?? '',
      office_id: v.office_id ?? '',
      driver_name: v.driver_name,
      kind: 'moderation',
      reason: `Royaltaxi AI: ${v.alert_count} ta qoida buzish, ${v.total_score} ball. Turlari: ${v.fraud_types}`,
    });
  };

  return (
    <>
      <Card
        title={
          <span>
            <ExclamationCircleOutlined /> Qoida buzar haydovchilar — ENG SHUBHALI
          </span>
        }
        extra={
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
        }
      >
        <p style={{ color: '#6B7280', marginBottom: 12 }}>
          Tartibda <b>jami balli yuqori</b> haydovchilar. Yonidagi tugmalar:
          {' • '}<b>Ko'rish</b> — barcha qoida buzishlari ro'yxati
          {' • '}<b>Bloklash</b> — Royaltaxi saytida darhol bloklash (qo'lda tasdiq bilan).
        </p>
        <Table<ViolatorRow>
          size="middle"
          rowKey="callsign"
          loading={isFetching}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 50 }}
          locale={{ emptyText: <Empty /> }}
          columns={[
            { title: 'Belgi', dataIndex: 'callsign', width: 110, render: (v) => <Tag>{v}</Tag> },
            { title: 'Haydovchi', dataIndex: 'driver_name', ellipsis: true },
            { title: 'Hudud', dataIndex: 'region', width: 120 },
            {
              title: 'Jami zakaz',
              dataIndex: 'orders_count',
              width: 100,
              sorter: (a, b) => a.orders_count - b.orders_count,
            },
            {
              title: 'Bekor',
              dataIndex: 'cancelled_count',
              width: 90,
              render: (v) => (v > 0 ? <Tag color="warning">{v}</Tag> : '0'),
            },
            {
              title: 'Ogohlantirish',
              dataIndex: 'alert_count',
              width: 110,
              render: (v) => <Tag color="warning">{v}</Tag>,
              sorter: (a, b) => a.alert_count - b.alert_count,
            },
            {
              title: 'Ball',
              dataIndex: 'total_score',
              width: 100,
              render: (v) => <Tag color={v >= 500 ? 'error' : v >= 200 ? 'warning' : 'processing'}>{v}</Tag>,
              sorter: (a, b) => a.total_score - b.total_score,
              defaultSortOrder: 'descend',
            },
            {
              title: 'Qoidalar',
              dataIndex: 'fraud_types',
              ellipsis: true,
              render: (v) =>
                v ? (
                  <Tooltip title={v}>
                    <span style={{ color: '#6B7280', fontSize: 12 }}>{v.replace(/,/g, ', ')}</span>
                  </Tooltip>
                ) : '—',
            },
            {
              title: 'Holat',
              width: 130,
              render: (_, r) =>
                r.site_locked ? (
                  <Tag color="error">Sayt: {r.site_locked}</Tag>
                ) : r.our_blocked ? (
                  <Tag color="warning">Bizda blok</Tag>
                ) : (
                  <Tag>aktiv</Tag>
                ),
            },
            {
              title: 'Amallar',
              width: 230,
              render: (_, r) => (
                <span>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => setDrawerCallsign(r.callsign)}
                    style={{ marginRight: 8 }}
                  >
                    Ko'rish
                  </Button>
                  {!r.site_locked && (
                    <Button
                      size="small"
                      danger
                      icon={<StopOutlined />}
                      onClick={() => openBlock(r)}
                    >
                      Bloklash
                    </Button>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Card>

      {/* Violations drawer */}
      <ViolationsDrawer
        callsign={drawerCallsign}
        onClose={() => setDrawerCallsign(null)}
      />

      {/* Block modal */}
      <Modal
        title={
          <span>
            <StopOutlined /> Saytda bloklash: <b>{blockFor?.driver_name}</b>
          </span>
        }
        open={!!blockFor}
        onCancel={() => setBlockFor(null)}
        onOk={() => form.submit()}
        confirmLoading={blockMut.isPending}
        okText="⛔ Bloklash"
        cancelText="Bekor"
        okButtonProps={{ danger: true }}
        width={580}
      >
        <p style={{ color: '#6B7280' }}>
          Bu amal <b>Royaltaxi saytida</b> haydovchini bloklaydi (sayt admin tomonidan
          ko'rinadi). Sabab matni saytdagi sharhga yoziladi.
        </p>
        <Popconfirm
          title="Rostan bloklamoqchimisiz?"
          description="Bu amal Royaltaxi saytida bajariladi va u yerda ko'rinadi."
          onConfirm={() => form.submit()}
          okText="Ha, blokla"
          cancelText="Yo'q"
        />
        <Form form={form} layout="vertical" onFinish={(v) => blockMut.mutate(v)} requiredMark={false}>
          <Form.Item name="callsign" hidden><Input /></Form.Item>
          <Form.Item name="driver_id" hidden><Input /></Form.Item>
          <Form.Item name="office_id" hidden><Input /></Form.Item>
          <Form.Item name="driver_name" label="Haydovchi">
            <Input disabled />
          </Form.Item>
          <Form.Item name="kind" label="Blok turi (saytdagi kind)">
            <Select
              options={[
                { value: 'moderation', label: 'На модерации (modaratsiya)' },
                { value: 'low-balance', label: 'Hisob bo\'sh' },
                { value: 'expired-checkup', label: 'Texniko\'rik o\'tmagan' },
              ]}
            />
          </Form.Item>
          <Form.Item name="reason" label="Sabab (sayt'dagi izoh)" rules={[{ required: true, message: 'Sabab kerak' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function ViolationsDrawer({ callsign, onClose }: { callsign: string | null; onClose: () => void }): JSX.Element {
  const { data } = useQuery<{ items: ViolationRow[] }>({
    queryKey: ['violations', callsign],
    queryFn: () => api.get('/driver-violations', { params: { callsign } }).then((r) => r.data),
    enabled: !!callsign,
  });

  return (
    <Drawer
      title={`📋 Qoida buzishlar: ${callsign ?? ''}`}
      open={!!callsign}
      onClose={onClose}
      width={960}
    >
      <Descriptions size="small" column={1}>
        <Descriptions.Item label="Jami buzishlar">{data?.items.length ?? 0}</Descriptions.Item>
      </Descriptions>
      <Table
        size="small"
        rowKey="id"
        dataSource={data?.items ?? []}
        pagination={{ pageSize: 30 }}
        style={{ marginTop: 12 }}
        columns={[
          { title: 'Sana', render: (_, r: ViolationRow) => `${r.date} ${r.time}`, width: 140 },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 110,
            render: (v, r: ViolationRow) => (
              <Tag color={v === 'finish' ? 'success' : 'warning'}>
                {v === 'finish' ? 'Tugadi' : r.cancel_kind ?? v}
              </Tag>
            ),
          },
          { title: 'Tur', dataIndex: 'fraud_type', width: 180, render: (v) => <Tag>{v}</Tag> },
          { title: 'Masofa', render: (_, r: ViolationRow) => fmtKm(r.distance_km), width: 80 },
          { title: 'Sek', render: (_, r: ViolationRow) => fmtSek(r.duration_sec), width: 100 },
          { title: 'Narx', render: (_, r: ViolationRow) => fmtNarx(r.amount), width: 100 },
          {
            title: 'Ball',
            dataIndex: 'fraud_score',
            width: 70,
            render: (v) => <Tag color={v >= 150 ? 'error' : v >= 80 ? 'warning' : 'processing'}>{v}</Tag>,
          },
          { title: 'Sabab', dataIndex: 'details', ellipsis: true },
          { title: 'Vaqt', render: (_, r: ViolationRow) => fmtTime(r.created_at), width: 130 },
        ]}
      />
    </Drawer>
  );
}
