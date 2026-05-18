import { Card, Table, Tag, Button, App, Modal, Form, Input, Popconfirm, Empty, Switch, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, GlobalOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, fmtTime } from '../lib/api';

interface Site {
  id: number;
  name: string;
  base_url: string;
  username: string;
  password_mask: string;
  is_active: number;
  use_proxy: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface SiteForm {
  id?: number;
  name: string;
  base_url: string;
  username: string;
  password: string;
  note: string;
  use_proxy: boolean;
}

export default function SitesPage(): JSX.Element {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form] = Form.useForm<SiteForm>();

  const { data, isFetching } = useQuery<{ items: Site[] }>({
    queryKey: ['sites'],
    queryFn: () => api.get('/sites').then((r) => r.data),
    refetchInterval: 10_000,
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
      message.success('O\'chirildi');
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });

  const openAdd = (): void => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      base_url: 'https://hive-respublika-new.royaltaxi.uz',
      use_proxy: true,
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
    });
    setModalOpen(true);
  };

  const onSubmit = (values: SiteForm): void => {
    saveMut.mutate({ ...values, id: editing?.id });
  };

  return (
    <>
      <Card
        title={
          <span>
            <GlobalOutlined /> Saytlar va kirish ma'lumotlari
          </span>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Yangi sayt qo'shish
          </Button>
        }
      >
        <p style={{ color: '#6B7280', marginBottom: 12 }}>
          Bu yerda monitoring qiladigan saytlar va kirish ma'lumotlari saqlanadi.
          <b> 6 tagacha sayt birga (parallel) monitoring qilish mumkin</b>. Har FAOL sayt
          uchun alohida Chromium sessiya ochiladi va zakazlar bir-biriga aralashmasdan yig'iladi.
          Yoqish/o'chirish tugmasi bilan har bir saytni boshqaring — monitor 2 daqiqada
          o'zi yangi holatga keladi.
        </p>
        <Table<Site>
          rowKey="id"
          dataSource={data?.items ?? []}
          loading={isFetching}
          pagination={false}
          locale={{ emptyText: <Empty description="Hali sayt qo'shilmagan. 'Yangi sayt qo'shish' bilan boshlang." /> }}
          columns={[
            {
              title: 'Monitoring',
              dataIndex: 'is_active',
              width: 120,
              render: (v) =>
                v ? (
                  <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontWeight: 600 }}>YOQILGAN</Tag>
                ) : (
                  <Tag>o'chirilgan</Tag>
                ),
            },
            { title: 'Nom', dataIndex: 'name', width: 180 },
            {
              title: 'URL',
              dataIndex: 'base_url',
              render: (v) => <code style={{ fontSize: 12 }}>{v}</code>,
            },
            { title: 'Login', dataIndex: 'username', width: 130 },
            {
              title: 'Parol',
              dataIndex: 'password_mask',
              width: 80,
              render: () => <Tag>••••</Tag>,
            },
            {
              title: 'Tunel',
              dataIndex: 'use_proxy',
              width: 100,
              render: (v) => v === 0 ? (
                <Tooltip title="VPS to'g'ridan-to'g'ri ulanadi (10x tezroq)">
                  <Tag color="success" icon={<ThunderboltOutlined />}>TO'G'RIDAN</Tag>
                </Tooltip>
              ) : (
                <Tooltip title="Chisel tunnel orqali (uy PC dan)">
                  <Tag color="processing">TUNEL</Tag>
                </Tooltip>
              ),
            },
            { title: 'Izoh', dataIndex: 'note', ellipsis: true },
            {
              title: 'Yangilangan',
              dataIndex: 'updated_at',
              width: 150,
              render: (v) => <span style={{ fontSize: 12, color: '#9aa0aa' }}>{fmtTime(v)}</span>,
            },
            {
              title: 'Amallar',
              width: 280,
              render: (_, r) => (
                <span>
                  <Button
                    type={r.is_active ? 'default' : 'primary'}
                    size="small"
                    icon={<CheckCircleOutlined />}
                    onClick={() => activateMut.mutate(r.id)}
                    loading={activateMut.isPending}
                    style={{ marginRight: 8 }}
                    danger={!!r.is_active}
                  >
                    {r.is_active ? 'O\'chirish' : 'Yoqish'}
                  </Button>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ marginRight: 8 }}>
                    Tahrir
                  </Button>
                  <Popconfirm
                    title="O'chirilsinmi?"
                    onConfirm={() => deleteMut.mutate(r.id)}
                    okText="Ha"
                    cancelText="Yo'q"
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      O'chir
                    </Button>
                  </Popconfirm>
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? "Saytni tahrirlash" : "Yangi sayt qo'shish"}
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
        width={600}
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
            <Input placeholder="Royaltaxi Qashqadaryo" />
          </Form.Item>

          <Form.Item
            name="base_url"
            label="URL (sayt manzili)"
            rules={[
              { required: true, message: 'URL kerak' },
              { type: 'url', message: 'To\'g\'ri URL kiriting' },
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
            <Input.Password placeholder={editing ? 'Eski parolni saqlash uchun bo\'sh qoldiring' : 'Sayt paroli'} />
          </Form.Item>

          <Form.Item
            name="use_proxy"
            label={
              <span>
                <ThunderboltOutlined /> Tunel (chisel proxy) ishlatish
              </span>
            }
            valuePropName="checked"
            extra="Agar sayt VPS'dan to'g'ridan-to'g'ri ochilsa, tunelni o'chiring (10x tezroq). Aksincha o'chgan saytlar uchun yoqing."
          >
            <Switch checkedChildren="TUNEL (uy PC orqali)" unCheckedChildren="TO'G'RIDAN (tez)" />
          </Form.Item>

          <Form.Item name="note" label="Izoh (ixtiyoriy)">
            <Input.TextArea rows={2} placeholder="Masalan: Qashqadaryo aksaks hisobi" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
