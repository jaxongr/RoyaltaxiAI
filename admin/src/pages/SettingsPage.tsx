import { Card, Row, Col, Descriptions, Tag, Button, App, Statistic, Alert, Space } from 'antd';
import { ThunderboltOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface MonitorStatus {
  running: boolean;
  pid: number | null;
  uptimeSec: number | null;
  lastLogLines: string[];
}

interface SystemResp {
  monitor: {
    last_tick_at: string | null;
    tick_count: number;
    site_total_today: number;
    our_count_today: number;
    consecutive_errors: number;
    last_error: string | null;
  };
  telegram: { configured: boolean };
  thresholds: { ALERT: number; STRONG: number; AUTO_BLOCK: number; WEEKLY_TOTAL_BLOCK: number; WEEKLY_COUNT_BLOCK: number };
  db: { path: string; orders: number; alerts: number; blocks: number };
}

export default function SettingsPage(): JSX.Element {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data } = useQuery<SystemResp>({
    queryKey: ['system'],
    queryFn: () => api.get('/system').then((r) => r.data),
    refetchInterval: 5000,
  });

  const { data: monitor } = useQuery<MonitorStatus>({
    queryKey: ['monitor-status'],
    queryFn: () => api.get('/monitor/status').then((r) => r.data),
    refetchInterval: 2000,
  });

  const startMutation = useMutation({
    mutationFn: () => api.post('/monitor/start'),
    onSuccess: (r) => {
      if (r.data.ok) message.success(`Monitor ishga tushdi (PID: ${r.data.pid})`);
      else message.error(r.data.error ?? 'Xato');
      qc.invalidateQueries({ queryKey: ['monitor-status'] });
    },
    onError: (e: Error) => message.error('Xato: ' + e.message),
  });

  const stopMutation = useMutation({
    mutationFn: () => api.post('/monitor/stop'),
    onSuccess: () => {
      message.success('Monitor to\'xtatildi');
      qc.invalidateQueries({ queryKey: ['monitor-status'] });
    },
    onError: (e: Error) => message.error('Xato: ' + e.message),
  });

  const sendTest = async (): Promise<void> => {
    try {
      const r = await api.post('/system/test-telegram');
      if (r.data.ok) message.success('Telegramga test xabari yuborildi ✅');
      else message.error('Yuborilmadi: ' + (r.data.error || 'noma\'lum xato'));
    } catch (e) {
      message.error('Xato: ' + (e as Error).message);
    }
  };

  const openAnalysis = (): void => {
    window.open('/alerts', '_blank');
  };

  const tail = monitor?.lastLogLines.slice(-30) ?? [];
  const logText = tail.join('\n');

  return (
    <Row gutter={[12, 12]}>
      <Col span={24}>
        <Card
          title={
            <Space>
              <span>🎛 Monitor boshqaruvi</span>
              {monitor?.running ? (
                <Tag color="success" style={{ marginLeft: 8 }}>● ISHLAMOQDA (PID {monitor.pid})</Tag>
              ) : (
                <Tag style={{ marginLeft: 8 }}>● TO'XTAGAN</Tag>
              )}
            </Space>
          }
          extra={
            <Space>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => startMutation.mutate()}
                loading={startMutation.isPending}
                disabled={monitor?.running}
                size="large"
              >
                🚀 MONITORNI ISHGA TUSHIR
              </Button>
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => stopMutation.mutate()}
                loading={stopMutation.isPending}
                disabled={!monitor?.running}
                size="large"
              >
                ⏹ TO'XTATISH
              </Button>
              <Button
                icon={<ThunderboltOutlined />}
                onClick={openAnalysis}
                size="large"
              >
                Tahlil oynasi
              </Button>
            </Space>
          }
        >
          <p style={{ color: '#6B7280', marginBottom: 12 }}>
            Bu tugmalar <b>shu kompyuter</b>da monitor jarayonini boshqaradi (UZ PC).
            Ishga tushirgandan keyin har 5 sekundda sayt tekshiriladi, shubhali zakazlar
            Telegramga yuboriladi.
          </p>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 4 }}>
              📜 <b>Jonli log (oxirgi 30 satr):</b>
            </div>
            <pre
              style={{
                background: '#0f1115',
                color: '#a3e635',
                padding: 12,
                borderRadius: 6,
                fontSize: 11,
                maxHeight: 280,
                overflow: 'auto',
                margin: 0,
                fontFamily: 'Consolas, Menlo, monospace',
              }}
            >
              {logText || 'Log bo\'sh — monitor hali yoqilmagan.'}
            </pre>
          </div>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="🔄 Monitor holati">
          <Row gutter={12}>
            <Col span={12}><Statistic title="Tick soni" value={data?.monitor.tick_count ?? 0} /></Col>
            <Col span={12}>
              <Statistic
                title="Xatolar"
                value={data?.monitor.consecutive_errors ?? 0}
                valueStyle={{ color: (data?.monitor.consecutive_errors ?? 0) > 0 ? '#EF4444' : '#16A34A' }}
              />
            </Col>
          </Row>
          {data?.monitor.last_error && (
            <Alert type="error" message={data.monitor.last_error} style={{ marginTop: 12 }} />
          )}
          <Descriptions size="small" column={1} bordered style={{ marginTop: 12 }}>
            <Descriptions.Item label="Oxirgi tick">{data?.monitor.last_tick_at ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Sayt bugun">{data?.monitor.site_total_today ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="DB bugun">{data?.monitor.our_count_today ?? '—'}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="📱 Telegram bot">
          {data?.telegram.configured ? (
            <>
              <Tag color="success">Sozlangan ✓</Tag>
              <p style={{ marginTop: 12, color: '#6B7280' }}>
                Bot ishlamoqda. Buyruqlar: <code>/stats</code>, <code>/top</code>, <code>/blocks</code>, <code>/help</code>
              </p>
              <Button type="primary" onClick={sendTest} style={{ marginTop: 12 }}>
                Test xabar yuborish
              </Button>
            </>
          ) : (
            <Alert type="warning" message="Telegram sozlanmagan — .env faylda TELEGRAM_BOT_TOKEN va TELEGRAM_CHAT_ID kerak" />
          )}
        </Card>
      </Col>
      <Col span={24}>
        <Card title="⚖️ Firibgarlik chegaralari">
          <p style={{ color: '#6B7280', marginBottom: 12 }}>
            Bu qiymatlar <code>src/fraud/rules.ts</code> faylida belgilangan. O'zgartirish uchun kodni tahrir qiling va monitorni qayta yoqing.
          </p>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Alert chegarasi">{data?.thresholds.ALERT}</Descriptions.Item>
            <Descriptions.Item label="Kuchli shubha">{data?.thresholds.STRONG}</Descriptions.Item>
            <Descriptions.Item label="Bitta zakaz uchun blok">{data?.thresholds.AUTO_BLOCK}</Descriptions.Item>
            <Descriptions.Item label="7 kunlik blok ball">{data?.thresholds.WEEKLY_TOTAL_BLOCK}</Descriptions.Item>
            <Descriptions.Item label="7 kunlik blok alert soni">{data?.thresholds.WEEKLY_COUNT_BLOCK}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
      <Col span={24}>
        <Card title="🗄 Ma'lumotlar bazasi">
          <Row gutter={12}>
            <Col span={8}><Statistic title="Jami zakaz" value={data?.db.orders ?? 0} /></Col>
            <Col span={8}><Statistic title="Jami alert" value={data?.db.alerts ?? 0} /></Col>
            <Col span={8}><Statistic title="Bloklar" value={data?.db.blocks ?? 0} /></Col>
          </Row>
          <p style={{ color: '#6B7280', marginTop: 12, fontSize: 12 }}>
            Joylashuv: <code>{data?.db.path}</code>
          </p>
        </Card>
      </Col>
    </Row>
  );
}
