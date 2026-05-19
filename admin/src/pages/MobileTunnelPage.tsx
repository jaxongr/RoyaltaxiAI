import { Card, Steps, Typography, Button, Tag, Space, Alert, Row, Col, message } from 'antd';
import {
  MobileOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  CopyOutlined,
  WifiOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const INSTALL_CMD = `curl -fsSL http://46.8.194.45/install-tunnel.sh | sh`;

function CopyBtn({ text }: { text: string }): JSX.Element {
  return (
    <Button
      icon={<CopyOutlined />}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => message.success('Nusxalandi'),
          () => message.error('Nusxalashda xato'),
        );
      }}
    >
      Nusxalash
    </Button>
  );
}

function CodeBox({ children, copy }: { children: string; copy?: boolean }): JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        background: '#0f172a',
        color: '#e2e8f0',
        padding: '14px 18px',
        borderRadius: 10,
        fontFamily: 'Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.6,
        marginBottom: 8,
        wordBreak: 'break-all',
      }}
    >
      <code style={{ color: '#a5f3fc' }}>{children}</code>
      {copy && (
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined style={{ color: '#94a3b8' }} />}
            onClick={() => {
              navigator.clipboard.writeText(children).then(
                () => message.success('Nusxalandi'),
              );
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function MobileTunnelPage(): JSX.Element {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <Card
        style={{ marginBottom: 16 }}
        bordered={false}
        styles={{
          body: {
            background: 'linear-gradient(135deg, #6B46C1 0%, #4F46E5 100%)',
            borderRadius: 12,
            color: '#fff',
          },
        }}
      >
        <Space align="start" size={16}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
            }}
          >
            📱
          </div>
          <div>
            <Title level={3} style={{ color: '#fff', margin: 0 }}>
              Telefon orqali doimiy monitoring
            </Title>
            <Paragraph style={{ color: 'rgba(255,255,255,0.85)', margin: '8px 0 0' }}>
              Kompyuter o'rniga eski Android telefon (masalan, A6) WiFi'da yoqib qo'ying.
              Tunel orqali server O'zbek IP'dan zakazlarni doim yig'ib turadi.
            </Paragraph>
          </div>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <WifiOutlined style={{ fontSize: 28, color: '#6B46C1' }} />
            <div style={{ marginTop: 8, fontWeight: 600 }}>WiFi'ga ulang</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Telefon doim WiFi'da bo'lsin
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <ThunderboltOutlined style={{ fontSize: 28, color: '#F59E0B' }} />
            <div style={{ marginTop: 8, fontWeight: 600 }}>Quvvatga ulang</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Zaryadlovchi doim ulangan
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <CheckCircleOutlined style={{ fontSize: 28, color: '#16A34A' }} />
            <div style={{ marginTop: 8, fontWeight: 600 }}>Avto-ishlash</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              O'chsa ham qayta yonadi
            </Text>
          </Card>
        </Col>
      </Row>

      <Card title={<><MobileOutlined /> O'rnatish qadamlari</>}>
        <Steps
          direction="vertical"
          current={-1}
          items={[
            {
              title: '1. F-Droid o\'rnating (Play Store emas)',
              icon: <DownloadOutlined />,
              description: (
                <div>
                  <Paragraph style={{ marginTop: 8 }}>
                    Telefonga <Text strong>F-Droid</Text> dasturini brauzer orqali yuklang:
                  </Paragraph>
                  <CodeBox copy>https://f-droid.org/F-Droid.apk</CodeBox>
                  <Alert
                    type="warning"
                    showIcon
                    message="Play Store'dagi Termux eski va ishlamaydi. Faqat F-Droid'dan o'rnating."
                  />
                </div>
              ),
            },
            {
              title: '2. F-Droid\'dan 3 ta dasturni o\'rnating',
              icon: <DownloadOutlined />,
              description: (
                <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
                  <Tag color="purple" style={{ fontSize: 13, padding: '4px 10px' }}>
                    Termux
                  </Tag>
                  <Tag color="purple" style={{ fontSize: 13, padding: '4px 10px' }}>
                    Termux:Boot &nbsp;— &nbsp; <em>(telefon yongan zahoti avto-start)</em>
                  </Tag>
                  <Tag color="purple" style={{ fontSize: 13, padding: '4px 10px' }}>
                    Termux:API &nbsp;— &nbsp; <em>(ekran o'chsa ham ishlash uchun)</em>
                  </Tag>
                </Space>
              ),
            },
            {
              title: '3. Termux\'ni oching va bitta buyruqni nusxalang',
              icon: <PlayCircleOutlined />,
              description: (
                <div style={{ marginTop: 8 }}>
                  <Paragraph>Telefondagi Termux ichida shu buyruqni yopishtiring va Enter bosing:</Paragraph>
                  <CodeBox copy>{INSTALL_CMD}</CodeBox>
                  <CopyBtn text={INSTALL_CMD} />
                  <Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12 }}>
                    Skript avtomatik: <br />
                    • chisel binary'ni yuklab oladi <br />
                    • Avto-start sozlaydi (telefon yondi → tunel qo'shildi) <br />
                    • Wakelock yoqadi (ekran o'chsa ham ishlaydi) <br />
                    • Tunelni darhol ishga tushiradi
                  </Paragraph>
                </div>
              ),
            },
            {
              title: '4. Termux:Boot dasturini bir marta oching',
              icon: <PlayCircleOutlined />,
              description: (
                <Paragraph style={{ marginTop: 8 }}>
                  <Text strong>Termux:Boot</Text> ikonkasini bir marta oching — autostart faollashadi.
                  Endi telefon o'chib-yonsa ham tunel o'zi qayta ishga tushadi.
                </Paragraph>
              ),
            },
            {
              title: '5. Telefon batareyani cheklamasin',
              icon: <ThunderboltOutlined />,
              description: (
                <div style={{ marginTop: 8 }}>
                  <Paragraph>Telefon Sozlamalar (Settings) → Batareya → ikkita dasturni "Cheksiz" rejimga qo'ying:</Paragraph>
                  <Space>
                    <Tag color="success">Termux</Tag>
                    <Tag color="success">Termux:API</Tag>
                  </Space>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Card title="✅ Tekshirish" style={{ marginTop: 16 }}>
        <Paragraph>
          Tunel ulanganini bilish uchun <Text code>/sites</Text> sahifasiga o'ting.
          Agar barcha saytlar <Tag color="success">ishlamoqda</Tag> bo'lsa — tunel ishlamoqda.
        </Paragraph>
        <Paragraph type="secondary">
          Telefon Termux'da: <Text code>tail -f ~/.royaltaxi/tunnel.log</Text> — jonli log ko'rish.
        </Paragraph>
      </Card>
    </div>
  );
}
