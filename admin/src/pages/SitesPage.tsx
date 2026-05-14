import { Card, Table, Tag, Button, App, Modal, Form, Input, Popconfirm, Empty } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, GlobalOutlined } from '@ant-design/icons';
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
    onSuccess: () => {
      message.success("Faollashtirildi — monitor qayta yoqilganda yangi credential ishlatadi");
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
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
          <b> Faqat 1 ta sayt faol bo'la oladi</b>. Yangi credential qo'shganingizdan keyin
          uni "<b>Faollashtirish</b>" tugmasi bilan tanlang. Monitor qayta yoqilganda
          yangi credential bilan ishlay boshlaydi.
        </p>
        <Table<Site>
          rowKey="id"
          dataSource={data?.items ?? []}
          loading={isFetching}
          pagination={false}
          locale={{ emptyText: <Empty description="Hali sayt qo'shilmagan. 'Yangi sayt qo'shish' bilan boshlang." /> }}
          columns={[
            {
              title: 'Holat',
              dataIndex: 'is_active',
              width: 100,
              render: (v) =>
                v ? (
                  <Tag color="success" icon={<CheckCircleOutlined />}>FAOL</Tag>
                ) : (
                  <Tag>passiv</Tag>
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
                  {!r.is_active && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckCircleOutlined />}
                      onClick={() => activateMut.mutate(r.id)}
                      loading={activateMut.isPending}
                      style={{ marginRight: 8 }}
                    >
                      Faollashtirish
                    </Button>
                  )}
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

          <Form.Item name="note" label="Izoh (ixtiyoriy)">
            <Input.TextArea rows={2} placeholder="Masalan: Qashqadaryo aksaks hisobi" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
