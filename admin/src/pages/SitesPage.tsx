import { Card, Table, Tag, Button, App, Modal, Form, Input, Popconfirm, Empty, Switch, Tooltip, Space, Badge } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined,
  ThunderboltOutlined, PauseCircleOutlined, PlayCircleOutlined, ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, fmtTime } from '../lib/api';
import styled from 'styled-components';

interface Site {
  id: number;
  name: string;
  base_url: string;
  username: string;
  password_mask: string;
  is_active: number;
  use_proxy: number;
  auto_select_all: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  running: boolean;
  seconds_since_tick: number | null;
  orders_today: number;
  alerts_today: number;
  site_total_today: number | null;
  our_count_today: number | null;
  tick_count: number | null;
}

interface SiteForm {
  id?: number;
  name: string;
  base_url: string;
  username: string;
  password: string;
  note: string;
  use_proxy: boolean;
  auto_select_all: boolean;
}

const Pulse = styled.span<{ $color: string }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  box-shadow: 0 0 8px ${(p) => p.$color};
  animation: pulse 2s infinite;
  margin-right: 8px;
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`;

function StatusCell({ s }: { s: Site }): JSX.Element {
  if (!s.is_active) return <Tag>o'chirilgan</Tag>;
  if (!s.running) {
    return (
      <Tag color="warning" icon={<SyncOutlined spin />}>
        Boshlanmoqda
      </Tag>
    );
  }
  const sec = s.seconds_since_tick ?? 999;
  if (sec > 300) {
    return (
      <Tooltip title={`${sec} sek tick yo'q`}>
        <Tag color="error"><Pulse $color="#ef4444" />Qotgan ({sec}s)</Tag>
      </Tooltip>
    );
  }
  if (sec > 60) {
    return (
      <Tooltip title={`${sec} sek tick yo'q`}>
        <Tag color="warning"><Pulse $color="#f59e0b" />Sekin ({sec}s)</Tag>
      </Tooltip>
    );
  }
  return <Tag color="success"><Pulse $color="#16a34a" />Ishlamoqda</Tag>;
}

function CoverageCell({ s }: { s: Site }): JSX.Element {
  const ours = s.orders_today ?? 0;
  const site = s.site_total_today ?? 0;
  if (site === 0) return <span style={{ color: '#9aa0aa' }}>{ours}</span>;
  const pct = Math.min(100, (ours / site) * 100);
  const color = pct >= 95 ? '#16a34a' : pct >= 80 ? '#f59e0b' : '#ef4444';
  return (
    <Tooltip title={`Bizda: ${ours} / Sayt: ${site}`}>
      <span>
        <b>{ours}</b> <span style={{ color: '#9aa0aa' }}>/{site}</span>
        {' '}
        <span style={{ color, fontSize: 12 }}>({pct.toFixed(0)}%)</span>
      </span>
    </Tooltip>
  );
}

export default function SitesPage(): JSX.Element {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form] = Form.useForm<SiteForm>();

  const { data, isFetching, refetch } = useQuery<{ items: Site[] }>({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data),
    refetchInterval: 5_000,
  });

  const saveMut = useMutation({
    mutationFn: (v: SiteForm) =>
      v.id ? api.post(`/sites/${v.id}`, v) : api.post('/sites', v),
    onSuccess: () => {
      message.success('Saqlandi');
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      message.error(e.response?.data?.error ?? 'Xato'),
  });

  const activateMut = useMutation({
    mutationFn: (id: number) => api.post(`/sites/${id}/activate`),
    onSuccess: (r: { data: { is_active?: number } }) => {
      message.success(
        r.data.is_active === 1
          ? "Yoqildi — monitor 2 daqiqada ushbu sayt uchun ishga tushadi"
          : "O'chirildi — monitor 2 daqiqada to'xtaydi",
      );
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      message.error(e.response?.data?.error ?? 'Xato'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/sites/${id}`),
    onSuccess: () => {
      message.success("O'chirildi");
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });

  const autoSelectMut = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) =>
      api.post(`/sites/${id}`, { auto_select_all: value }),
    onSuccess: () => {
      message.success('Подразделение auto-tanlash sozlandi');
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });

  const openAdd = (): void => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      base_url: 'https://hive-respublika-new.royaltaxi.uz',
      use_proxy: true,
      auto_select_all: true,
    });
    setModalOpen(true);
  };

  const openEdit = (s: Site): void => {
    setEditing(s);
    form.setFieldsValue({
      id: s.id,
      name: s.name,
      base_url: s.base_url,
      username: s.username,
      password: '',
      note: s.note ?? '',
      use_proxy: s.use_proxy !== 0,
      auto_select_all: s.auto_select_all !== 0,
    });
    setModalOpen(true);
  };

  const onSubmit = (values: SiteForm): void => {
    saveMut.mutate({ ...values, id: editing?.id });
  };

  const activeCount = (data?.items ?? []).filter((s) => s.is_active).length;

  return (
    <>
      <Card
        title={
          <Space>
            <GlobalOutlined /> Saytlar
            <Badge count={activeCount} color="#52c41a" />
            <span style={{ fontSize: 12, color: '#9aa0aa', fontWeight: 400 }}>
              {activeCount}/6 aktiv
            </span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              Yangi sayt
            </Button>
          </Space>
        }
      >
        <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#6B7280' }}>
          💡 <b>Maksimum 6 ta sayt parallel monitoring qiladi.</b> Har FAOL sayt
          uchun alohida Chromium sessiya ochiladi. Watchdog 2 daqiqada o'zi qayta
          tushiradi. <b>"Auto Подразделение"</b> har 1 soatda Подразделение filtrini
          tekshirib, yangi tumanlarni avtomatik belgilaydi (UI default ishlamasa, o'chiring).
        </div>
        <Table<Site>
          rowKey="id"
          dataSource={data?.items ?? []}
          loading={isFetching && !data}
          pagination={false}
          locale={{ emptyText: <Empty description="Hali sayt qo'shilmagan. 'Yangi sayt' bilan boshlang." /> }}
          size="middle"
          columns={[
            {
              title: 'Holat',
              width: 160,
              render: (_, s) => <StatusCell s={s} />,
            },
            {
              title: 'Nom / URL',
              render: (_, s) => (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    {s.name || <span style={{ color: '#9aa0aa' }}>(nom yo'q)</span>}
                  </div>
                  <code style={{ fontSize: 11, color: '#6B7280' }}>{s.base_url}</code>
                </div>
              ),
            },
            {
              title: 'Login',
              dataIndex: 'username',
              width: 130,
              render: (v) => <code style={{ fontSize: 12 }}>{v}</code>,
            },
            {
              title: 'Bugun',
              width: 170,
              render: (_, s) => <CoverageCell s={s} />,
            },
            {
              title: 'Alert',
              dataIndex: 'alerts_today',
              width: 80,
              render: (v) => v > 0 ? <Tag color="warning">{v}</Tag> : <span style={{ color: '#9aa0aa' }}>0</span>,
            },
            {
              title: 'Tick',
              dataIndex: 'tick_count',
              width: 80,
              render: (v) => <span style={{ fontSize: 12, color: '#6B7280' }}>{v ?? '—'}</span>,
            },
            {
              title: 'Tunel',
              dataIndex: 'use_proxy',
              width: 110,
              render: (v) => v === 0 ? (
                <Tooltip title="VPS to'g'ridan-to'g'ri ulanadi (tezroq)">
                  <Tag color="success" icon={<ThunderboltOutlined />}>TO'G'RIDAN</Tag>
                </Tooltip>
              ) : (
                <Tooltip title="Chisel tunnel orqali (uy PC)">
                  <Tag color="processing">TUNEL</Tag>
                </Tooltip>
              ),
            },
            {
              title: 'Auto Подразделение',
              dataIndex: 'auto_select_all',
              width: 130,
              render: (v, s) => (
                <Tooltip title="Har 1 soatda Подразделение filtrini avto-belgilash. Default ishlasa, o'chiring.">
                  <Switch
                    size="small"
                    checked={v !== 0}
                    loading={autoSelectMut.isPending}
                    onChange={(checked) => autoSelectMut.mutate({ id: s.id, value: checked })}
                  />
                </Tooltip>
              ),
            },
            {
              title: 'Yangilangan',
              dataIndex: 'updated_at',
              width: 140,
              render: (v) => <span style={{ fontSize: 12, color: '#9aa0aa' }}>{fmtTime(v)}</span>,
            },
            {
              title: 'Amallar',
              width: 180,
              fixed: 'right' as const,
              render: (_, r) => (
                <Space size="small">
                  <Tooltip title={r.is_active ? 'Monitoringni o\'chirish' : 'Monitoringni yoqish'}>
                    <Button
                      type={r.is_active ? 'default' : 'primary'}
                      size="small"
                      icon={r.is_active ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                      onClick={() => activateMut.mutate(r.id)}
                      loading={activateMut.isPending}
                      danger={!!r.is_active}
                    />
                  </Tooltip>
                  <Tooltip title="Tahrir">
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                  </Tooltip>
                  <Popconfirm
                    title="Saytni o'chirish?"
                    description="Bu amal qaytarib bo'lmaydi. Eski zakazlar saqlanib qoladi."
                    onConfirm={() => deleteMut.mutate(r.id)}
                    okText="Ha, o'chir"
                    cancelText="Bekor"
                    okButtonProps={{ danger: true }}
                  >
                    <Tooltip title="O'chirish">
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title={editing ? `Saytni tahrirlash: ${editing.name}` : "Yangi sayt qo'shish"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMut.isPending}
        okText="Saqlash"
        cancelText="Bekor qilish"
        width={620}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Sayt nomi"
            rules={[{ required: true, message: 'Nom kerak' }]}
          >
            <Input placeholder="Royaltaxi Qashqadaryo" autoFocus />
          </Form.Item>

          <Form.Item
            name="base_url"
            label="URL (sayt manzili)"
            rules={[
              { required: true, message: 'URL kerak' },
              { type: 'url', message: "To'g'ri URL kiriting" },
            ]}
          >
            <Input placeholder="https://hive-respublika-new.royaltaxi.uz" />
          </Form.Item>

          <Form.Item
            name="username"
            label="Login (foydalanuvchi)"
            rules={[{ required: true, message: 'Login kerak' }]}
          >
            <Input placeholder="jaxong1r" />
          </Form.Item>

          <Form.Item
            name="password"
            label={editing ? 'Yangi parol (bo\'sh qoldirsangiz eski parol qoladi)' : 'Parol'}
            rules={editing ? [] : [{ required: true, message: 'Parol kerak' }]}
          >
            <Input.Password placeholder={editing ? "Eski parolni saqlash uchun bo'sh qoldiring" : 'Sayt paroli'} />
          </Form.Item>

          <Form.Item
            name="use_proxy"
            label={<span><ThunderboltOutlined /> Tunel (chisel proxy) ishlatish</span>}
            valuePropName="checked"
            extra="Agar sayt VPS'dan to'g'ridan-to'g'ri ochilsa, tunelni o'chiring (10x tezroq). Aksincha o'chgan saytlar uchun yoqing."
          >
            <Switch checkedChildren="TUNEL (uy PC orqali)" unCheckedChildren="TO'G'RIDAN (tez)" />
          </Form.Item>

          <Form.Item
            name="auto_select_all"
            label="Auto Подразделение belgilash"
            valuePropName="checked"
            extra="Har 1 soatda Подразделение filtrini avto-belgilash. Default ishlasa (Qashqadaryo kabi) — o'chiring."
          >
            <Switch checkedChildren="YOQILGAN" unCheckedChildren="O'CHIRILGAN" />
          </Form.Item>

          <Form.Item name="note" label="Izoh (ixtiyoriy)">
            <Input.TextArea rows={2} placeholder="Masalan: Qashqadaryo asosiy hisob" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
