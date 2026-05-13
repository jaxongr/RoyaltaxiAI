import { Card, Row, Col, Descriptions, Tag, Button, App, Statistic, Alert } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';

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

interface AnalysisResult {
  ok: boolean;
  duration_ms: number;
  alerts_before: number;
  alerts_after: number;
  blocks_before: number;
  blocks_after: number;
  top_drivers: Array<{ callsign: string; driver_name: string; cnt: number; total: number }>;
}

export default function SettingsPage(): JSX.Element {
  const { message } = App.useApp();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { data } = useQuery<SystemResp>({
    queryKey: ['system'],
    queryFn: () => api.get('/system').then((r) => r.data),
    refetchInterval: 5000,
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

  const runAnalysis = async (): Promise<void> => {
    setRunning(true);
    setResult(null);
    try {
      const r = await api.post<AnalysisResult>('/system/run-analysis');
      setResult(r.data);
      message.success(`Tahlil tugadi — ${r.data.alerts_after - r.data.alerts_before} yangi alert topildi`);
    } catch (e) {
      message.error('Tahlilda xato: ' + (e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Row gutter={[12, 12]}>
      <Col span={24}>
        <Card
          title="⚡ Tahlilni qaytadan ishga tushirish"
          extra={
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={running}
              onClick={runAnalysis}
              size="large"
            >
              {running ? 'Ishlamoqda...' : 'TAHLIL ISHGA TUSHIR'}
            </Button>
          }
        >
          <p style={{ color: '#6B7280', margin: 0 }}>
            Barcha mavjud zakazlarni qoidalar dvigateli orqali <b>qaytadan baholash</b>.
            Yangi qoidalar yoki o'zgartirilgan chegaralar bilan firibgarliklarni qaytadan topadi.
            <br />
            <b>Vaqti:</b> ~10-30 sekund (ma'lumotning miqdoriga qarab).
          </p>
          {result && (
            <Alert
              style={{ marginTop: 12 }}
              type="success"
              showIcon
              message={`✅ Tahlil yakunlandi (${(result.duration_ms / 1000).toFixed(1)} sekund)`}
              description={
                <div>
                  <p style={{ margin: '4px 0' }}>
                    Alertlar: <b>{result.alerts_before}</b> → <b>{result.alerts_after}</b>
                    {' '}({result.alerts_after > result.alerts_before ? '+' : ''}
                    {result.alerts_after - result.alerts_before})
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    Bloklar: <b>{result.blocks_before}</b> → <b>{result.blocks_after}</b>
                    {' '}({result.blocks_after > result.blocks_before ? '+' : ''}
                    {result.blocks_after - result.blocks_before})
                  </p>
                  {result.top_drivers.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <b>Top 5 shubhali haydovchilar:</b>
                      <ol style={{ margin: '4px 0', paddingLeft: 24 }}>
                        {result.top_drivers.slice(0, 5).map((d) => (
                          <li key={d.callsign}>
                            <Tag>{d.callsign}</Tag> {d.driver_name} — <b>{d.cnt}</b> alert, {d.total} ball
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              }
            />
          )}
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
