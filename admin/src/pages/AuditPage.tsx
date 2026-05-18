import { Card, Table, Tag, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api, fmtTime, type AuditRow } from '../lib/api';

const actionColors: Record<string, string> = {
  mark_false_positive: 'warning',
  whitelist_add: 'success',
  whitelist_remove: 'default',
  block_driver: 'error',
};

const actionLabels: Record<string, string> = {
  mark_false_positive: 'Yolg\'on alarm deb belgilandi',
  whitelist_add: 'Whitelist\'ga qo\'shildi',
  whitelist_remove: 'Whitelist\'dan olindi',
  block_driver: 'Blok qilindi',
};

export default function AuditPage(): JSX.Element {
  const { data, isFetching } = useQuery<{ items: AuditRow[] }>({
    queryKey: ['audit-log'],
    queryFn: () => api.get('/audit-log', { params: { limit: 500 } }).then((r) => r.data),
    refetchInterval: 10_000,
  });

  return (
    <Card title={`📜 Audit log (${data?.items.length ?? 0})`}>
      <p style={{ color: '#6B7280', marginBottom: 12 }}>
        Tizimda qilingan barcha amallar (yolg'on alarm belgilash, whitelist, bloklash) shu yerda saqlanadi.
      </p>
      <Table<AuditRow>
        size="middle"
        rowKey="id"
        loading={isFetching && !data}
        dataSource={data?.items ?? []}
        pagination={{
          pageSize: 50,
          showSizeChanger: true,
          showTotal: (t, [a, b]) => `${a}-${b} / ${t}`,
        }}
        locale={{ emptyText: <Empty description="Hech qanday amal yo'q" /> }}
        scroll={{ x: 1100 }}
        columns={[
          { title: 'Vaqt', dataIndex: 'created_at', width: 170, fixed: 'left' as const, render: (v) => fmtTime(v) },
          {
            title: 'Amal',
            dataIndex: 'action',
            width: 240,
            render: (v) => <Tag color={actionColors[v] ?? 'default'} style={{ margin: 0 }}>{actionLabels[v] ?? v}</Tag>,
          },
          { title: 'Maqsad', render: (_, r) => `${r.target_type ?? ''}: ${r.target_id ?? ''}`, width: 220, ellipsis: true },
          { title: 'Kim', dataIndex: 'actor', width: 110 },
          { title: 'Tafsilot', dataIndex: 'details', ellipsis: true },
        ]}
      />
    </Card>
  );
}
