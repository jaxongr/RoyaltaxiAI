import { Card, Table, Tag, Empty, Tooltip } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, fmtTime, type BlockRow } from '../lib/api';
import DriverDrawer from '../components/DriverDrawer';

export default function BlocksPage(): JSX.Element {
  const [drvOpen, setDrvOpen] = useState<string | null>(null);
  const { data, isFetching } = useQuery<{ items: BlockRow[] }>({
    queryKey: ['blocks'],
    queryFn: () => api.get('/blocks', { params: { limit: 500 } }).then((r) => r.data),
    refetchInterval: 5000,
  });

  return (
    <>
      <Card title={`⛔ Blok tavsiya qilingan haydovchilar (${data?.items.length ?? 0} ta)`}>
        <p style={{ color: '#6B7280', marginBottom: 12 }}>
          Bu haydovchilar yetarlicha shubhali zakaz qilgani uchun tizim avtomatik <b>blok tavsiya qilgan</b>.
          Qatorga bossangiz, to'liq profili va zakazlarini ko'rasiz.
        </p>
        <Table<BlockRow>
          size="middle"
          rowKey="callsign"
          loading={isFetching}
          dataSource={data?.items ?? []}
          pagination={{ pageSize: 50 }}
          locale={{ emptyText: <Empty /> }}
          onRow={(r) => ({ onClick: () => setDrvOpen(r.callsign), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Belgi', dataIndex: 'callsign', width: 130, render: (v) => <Tag color="error">{v}</Tag> },
            { title: 'Haydovchi', dataIndex: 'driver_name' },
            { title: 'Alertlar', dataIndex: 'alert_count', width: 100, sorter: (a, b) => a.alert_count - b.alert_count },
            {
              title: 'Jami ball',
              dataIndex: 'total_score',
              width: 110,
              render: (v) => <Tag color="error">{v}</Tag>,
              sorter: (a, b) => a.total_score - b.total_score,
              defaultSortOrder: 'descend',
            },
            {
              title: 'Sabab',
              dataIndex: 'reason',
              width: 140,
              render: (v) => (
                <Tooltip title="Asosiy firibgarlik turi">
                  <Tag>{v}</Tag>
                </Tooltip>
              ),
            },
            { title: 'Belgilangan', render: (_, r) => fmtTime(r.blocked_at), width: 170 },
          ]}
        />
      </Card>
      <DriverDrawer callsign={drvOpen} open={!!drvOpen} onClose={() => setDrvOpen(null)} />
    </>
  );
}
