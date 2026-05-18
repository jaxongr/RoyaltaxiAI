import {
  Card, Table, Tag, Button, App, Modal, Form, Input, Select, Switch,
  Popconfirm, Empty, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined,
  RobotOutlined, CrownOutlined, EnvironmentOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api, type TelegramUser, type RegionListItem } from '../lib/api';

interface UserForm {
  id?: number;
  chat_id: string;
  full_name: string;
  username: string;
  role: 'admin' | 'dispatcher' | 'viewer';
  regions: string[];
  receive_alerts: boolean;
  receive_daily_report: boolean;
  receive_no_orders_alert: boolean;
  is_active: boolean;
  note: string;
}

export default function TelegramUsersPage(): JSX.Element {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TelegramUser | null>(null);
  const [form] = Form.useForm<UserForm>();

  const { data, isFetching } = useQuery<{ items: TelegramUser[] }>({
    queryKey: ['telegram-users'],
    queryFn: () => api.get('/telegram-users').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: regionData } = useQuery<{ items: RegionListItem[] }>({
    queryKey: ['region-list'],
    queryFn: () => api.get('/region-list').then((r) => r.data),
  });

  const regionOptions = useMemo(
    () => (regionData?.items ?? []).map((r) => ({ value: r.region, label: `${r.region} (${r.cnt.toLocaleString('ru-RU')})` })),
    [regionData],
  );

  const saveMut = useMutation({
    mutationFn: (v: UserForm) => {
      const payload = {
        chat_id: v.chat_id,
        full_name: v.full_name,
        username: v.username,
        role: v.role,
        regions: v.role === 'admin' ? null : v.regions,
        receive_alerts: v.receive_alerts,
        receive_daily_report: v.receive_daily_report,
        receive_no_orders_alert: v.receive_no_orders_alert,
        is_active: v.is_active,
        note: v.note,
      };
      return v.id ? api.post(`/telegram-users/${v.id}`, payload) : api.post('/telegram-users', payload);
    },
    onSuccess: () => {
      message.success('Saqlandi');
      setModalOpen(false);
      form.resetFields();
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['telegram-users'] });
    },
    onError: (e: { response?: { data?: { error?: string } } }) =>
      message.error(e.response?.data?.error ?? 'Xato'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/telegram-users/${id}`),
    onSuccess: () => {
      message.success('O\'chirildi');
      qc.invalidateQueries({ queryKey: ['telegram-users'] });
    },
  });

  const testMut = useMutation({
    mutationFn: (id: number) => api.post(`/telegram-users/${id}/test`),
    onSuccess: (r: { data: { ok: boolean } }) =>
      r.data.ok ? message.success('✅ Test xabari yuborildi') : message.error('Xato — chat_id noto\'g\'rimi?'),
    onError: () => message.error('Yuborilmadi'),
  });

  const openAdd = (): void => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      role: 'viewer',
      regions: [],
      receive_alerts: true,
      receive_daily_report: true,
      receive_no_orders_alert: false,
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (u: TelegramUser): void => {
    setEditing(u);
    let regions: string[] = [];
    try {
      regions = u.regions ? JSON.parse(u.regions) : [];
    } catch { regions = []; }
    form.setFieldsValue({
      id: u.id,
      chat_id: u.chat_id,
      full_name: u.full_name ?? '',
      username: u.username ?? '',
      role: u.role,
      regions,
      receive_alerts: !!u.receive_alerts,
      receive_daily_report: !!u.receive_daily_report,
      receive_no_orders_alert: !!u.receive_no_orders_alert,
      is_active: !!u.is_active,
      note: u.note ?? '',
    });
    setModalOpen(true);
  };

  return (
    <>
      <Card
        title={<span><RobotOutlined /> Telegram bot foydalanuvchilari</span>}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Yangi foydalanuvchi
          </Button>
        }
      >
        <p style={{ color: '#6B7280', marginBottom: 12 }}>
          Bu yerda Telegram bot orqali ogohlantirish oladigan odamlar belgilanadi.
          Har bir foydalanuvchi qaysi <b>hudud</b>lardan alert olishni tanlay oladi.
          <br />
          <b>Admin</b> — barcha hududlardan oladi. <b>Dispetcher / Viewer</b> — faqat tanlangan hududlar.
          <br />
          <i>Chat ID olish:</i> Telegram'da <code>@userinfobot</code> ga yozing — sizga raqamingizni qaytaradi.
        </p>
        <Table<TelegramUser>
          rowKey="id"
          dataSource={data?.items ?? []}
          loading={isFetching && !data}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showTotal: (t, [a, b]) => `${a}-${b} / ${t}`,
          }}
          locale={{ emptyText: <Empty description="Hali foydalanuvchi qo'shilmagan" /> }}
          scroll={{ x: 1200 }}
          columns={[
            {
              title: 'Holat',
              dataIndex: 'is_active',
              width: 100,
              fixed: 'left' as const,
              render: (v) => v ? <Tag color="success">aktiv</Tag> : <Tag>passiv</Tag>,
            },
            {
              title: 'Foydalanuvchi',
              width: 220,
              render: (_, r) => (
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.full_name ?? '(ismsiz)'}
                    {r.username && <span style={{ color: '#6B7280', fontWeight: 400 }}> @{r.username}</span>}
                  </div>
                  <small style={{ color: '#9CA3AF' }}>chat_id: <code>{r.chat_id}</code></small>
                </div>
              ),
            },
            {
              title: 'Roli',
              dataIndex: 'role',
              width: 130,
              render: (v) => {
                if (v === 'admin') return <Tag color="gold" icon={<CrownOutlined />}>ADMIN</Tag>;
                if (v === 'dispatcher') return <Tag color="blue">Dispetcher</Tag>;
                return <Tag>Ko'ruvchi</Tag>;
              },
            },
            {
              title: 'Hududlar (obuna)',
              dataIndex: 'regions',
              ellipsis: true,
              render: (v, r) => {
                if (r.role === 'admin') {
                  return <Tag color="gold">🌍 Hammasi</Tag>;
                }
                if (!v) return <Tag>—</Tag>;
                let arr: string[] = [];
                try { arr = JSON.parse(v); } catch { /* ignore */ }
                if (arr.length === 0) return <Tag color="gold">🌍 Hammasi</Tag>;
                return (
                  <Tooltip title={arr.join(', ')}>
                    <span>
                      {arr.slice(0, 4).map((rg) => <Tag key={rg} color="blue" style={{ marginBottom: 2 }}>{rg}</Tag>)}
                      {arr.length > 4 && <Tag>+{arr.length - 4}</Tag>}
                    </span>
                  </Tooltip>
                );
              },
            },
            {
              title: 'Xabar turlari',
              width: 240,
              render: (_, r) => (
                <span style={{ fontSize: 12 }}>
                  {r.receive_alerts ? <Tag color="error">⚠️ Alert</Tag> : null}
                  {r.receive_daily_report ? <Tag color="processing">📊 Kunlik</Tag> : null}
                  {r.receive_no_orders_alert ? <Tag color="warning">🟡 Sayt</Tag> : null}
                </span>
              ),
            },
            { title: 'Izoh', dataIndex: 'note', ellipsis: true, width: 180 },
            {
              title: 'Amallar',
              width: 170,
              fixed: 'right' as const,
              render: (_, r) => (
                <span>
                  <Tooltip title="Test xabari yuborish">
                    <Button
                      size="small"
                      icon={<SendOutlined />}
                      onClick={() => testMut.mutate(r.id)}
                      loading={testMut.isPending && testMut.variables === r.id}
                      style={{ marginRight: 6 }}
                    />
                  </Tooltip>
                  <Tooltip title="Tahrir">
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ marginRight: 6 }} />
                  </Tooltip>
                  <Popconfirm
                    title="Foydalanuvchini o'chirish?"
                    onConfirm={() => deleteMut.mutate(r.id)}
                    okText="Ha"
                    cancelText="Yo'q"
                  >
                    <Tooltip title="O'chirish">
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? "Foydalanuvchini tahrirlash" : "Yangi Telegram foydalanuvchi"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMut.isPending}
        okText="Saqlash"
        cancelText="Bekor"
        width={680}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => saveMut.mutate({ ...v, id: editing?.id })}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item name="chat_id" label="Chat ID (Telegram)" rules={[{ required: true, message: 'chat_id kerak' }]}>
            <Input placeholder="masalan: 5475915736" disabled={!!editing} />
          </Form.Item>

          <Form.Item name="full_name" label="To'liq ism">
            <Input placeholder="Jaxongir Toxtashboyev" />
          </Form.Item>

          <Form.Item name="username" label="Telegram username (ixtiyoriy)">
            <Input placeholder="jaxongir" prefix="@" />
          </Form.Item>

          <Form.Item name="role" label="Roli">
            <Select
              options={[
                { value: 'admin', label: '👑 Admin — hamma hududlardan, hammasini oladi' },
                { value: 'dispatcher', label: '🎯 Dispetcher — tanlangan hududlar' },
                { value: 'viewer', label: '👁 Ko\'ruvchi — tanlangan hududlar' },
              ]}
            />
          </Form.Item>

          <Form.Item shouldUpdate={(prev, cur) => prev.role !== cur.role} noStyle>
            {({ getFieldValue }) => {
              const role = getFieldValue('role');
              if (role === 'admin') {
                return (
                  <Form.Item label="Obuna hududlari">
                    <Tag color="gold">Admin — barcha hududlardan oladi</Tag>
                  </Form.Item>
                );
              }
              return (
                <Form.Item
                  name="regions"
                  label={<span><EnvironmentOutlined /> Obuna hududlari (bo'sh = hammasi)</span>}
                >
                  <Select
                    mode="multiple"
                    placeholder="Hududlarni tanlang yoki bo'sh qoldiring (hammasi)"
                    options={regionOptions}
                    showSearch
                    optionFilterProp="label"
                    allowClear
                  />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item label="Qanday xabarlarni oladi?">
            <Form.Item name="receive_alerts" valuePropName="checked" style={{ display: 'inline-block', marginRight: 16 }}>
              <Switch checkedChildren="⚠️ Fraud Alert" unCheckedChildren="⚠️ Alert" />
            </Form.Item>
            <Form.Item name="receive_daily_report" valuePropName="checked" style={{ display: 'inline-block', marginRight: 16 }}>
              <Switch checkedChildren="📊 Kunlik" unCheckedChildren="📊 Kunlik" />
            </Form.Item>
            <Form.Item name="receive_no_orders_alert" valuePropName="checked" style={{ display: 'inline-block' }}>
              <Switch checkedChildren="🟡 Sayt nosozlik" unCheckedChildren="🟡 Sayt" />
            </Form.Item>
          </Form.Item>

          <Form.Item name="is_active" valuePropName="checked">
            <Switch checkedChildren="AKTIV" unCheckedChildren="o'chirilgan" />
          </Form.Item>

          <Form.Item name="note" label="Izoh (ixtiyoriy)">
            <Input.TextArea rows={2} placeholder="Masalan: Qashqadaryo dispetcheri" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
