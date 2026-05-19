import { Card, Steps, Typography, Button, Tag, Space, Alert, Row, Col, message, Tabs } from 'antd';
import {
  MobileOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  CopyOutlined,
  WifiOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  WindowsOutlined,
  AndroidOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const SERVER_URL = `${window.location.protocol}//${window.location.host}`;
const APK_DOWNLOAD = `${SERVER_URL}/Royaltaxi-Tunnel.apk`;
const PC_DOWNLOAD = `${SERVER_URL}/Royaltaxi-Tunnel.bat`;

function CodeBox({ children, copy = false }: { children: string; copy?: boolean }): JSX.Element {
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

function PcTab(): JSX.Element {
  return (
    <div>
      <Alert
        type="success"
        showIcon
        style={{ marginBottom: 16 }}
        message="Eng oson yo'l — bitta fayl, bitta marta bosish"
        description="Royaltaxi-Tunnel.bat faylini yuklab, ikki marta bosing. Hammasi avtomatik o'rnatiladi. Reboot bo'lsa ham qayta yonadi."
      />

      <Card style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)', marginBottom: 16 }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <WindowsOutlined style={{ fontSize: 48, marginBottom: 12 }} />
          <Title level={4} style={{ color: '#fff' }}>1-bosqich: Faylni yuklab oling</Title>
          <Button
            type="primary"
            size="large"
            icon={<DownloadOutlined />}
            href={PC_DOWNLOAD}
            style={{ background: '#fff', color: '#4F46E5', fontWeight: 600, marginTop: 8 }}
          >
            Royaltaxi-Tunnel.bat yuklash
          </Button>
        </div>
      </Card>

      <Steps
        direction="vertical"
        current={-1}
        items={[
          {
            title: '2. Yuklab olingan faylga ikki marta bosing',
            icon: <PlayCircleOutlined />,
            description: (
              <Paragraph style={{ marginTop: 8 }}>
                Brauzer <Text code>Royaltaxi-Tunnel.bat</Text> faylini Yuklashlar (Downloads) papkasiga saqlaydi.
                Ustiga <Text strong>ikki marta</Text> bosing.
              </Paragraph>
            ),
          },
          {
            title: '3. Admin tasdiqlash oynasiga "Ha" bosing',
            icon: <PlayCircleOutlined />,
            description: (
              <Paragraph style={{ marginTop: 8 }}>
                Windows "Bu dasturga kompyuterda o'zgartirish kiritishga ruxsat berilsinmi?" deb so'raydi —
                <Text strong> "Ha" (Yes)</Text> bosing.
              </Paragraph>
            ),
          },
          {
            title: '4. Avtomatik o\'rnatish boshlanadi',
            icon: <ThunderboltOutlined />,
            description: (
              <Paragraph style={{ marginTop: 8 }}>
                Skript o'zi quyidagilarni qiladi:
                <ul style={{ marginTop: 8 }}>
                  <li>Chisel'ni yuklab oladi (5 MB)</li>
                  <li>Windows xizmati sifatida ro'yxatga oladi</li>
                  <li>Tunelni darhol ishga tushiradi</li>
                  <li>Reboot bo'lsa avto-tushadi (foydalanuvchi kirishi shart emas)</li>
                </ul>
              </Paragraph>
            ),
          },
          {
            title: '5. ✅ Tayyor — kompyuter doim ulanib turadi',
            icon: <CheckCircleOutlined />,
            description: (
              <Paragraph style={{ marginTop: 8 }}>
                Endi kompyuter yonig'lig'icha turishi kerak — uxlatib qo'ymang.
                Bossa-yotsa: <Text code>schtasks /Query /TN RoyaltaxiTunnel</Text>
              </Paragraph>
            ),
          },
        ]}
      />

      <Card title="Ilg'or foydalanuvchilar uchun" size="small" style={{ marginTop: 16 }}>
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          PowerShell'da admin sifatida ishlatish (.bat o'rniga):
        </Paragraph>
        <CodeBox copy>{`iwr ${SERVER_URL}/install-tunnel.ps1 -UseBasicParsing | iex`}</CodeBox>
      </Card>
    </div>
  );
}

function PhoneTab(): JSX.Element {
  return (
    <div>
      <Alert
        type="success"
        showIcon
        style={{ marginBottom: 16 }}
        message="Bitta APK — install qildi, ishladi"
        description="Hech qanday Termux, hech qanday sozlama yo'q. APK yuklab, install qiling, oching — tunel darhol ishga tushadi. Ekran o'chsa, telefon yangidan yonsa ham avto-davom etadi."
      />

      <Card style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)', marginBottom: 16 }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <AndroidOutlined style={{ fontSize: 48, marginBottom: 12 }} />
          <Title level={4} style={{ color: '#fff' }}>Royaltaxi Tunel — Android APK</Title>
          <Button
            type="primary"
            size="large"
            icon={<DownloadOutlined />}
            href={APK_DOWNLOAD}
            style={{ background: '#fff', color: '#4F46E5', fontWeight: 600, marginTop: 8 }}
          >
            Royaltaxi-Tunnel.apk yuklash (~10 MB)
          </Button>
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
            Yuklash uchun: <Text style={{ color: '#fff' }} copyable>{APK_DOWNLOAD}</Text>
          </div>
        </div>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <WifiOutlined style={{ fontSize: 28, color: '#6B46C1' }} />
            <div style={{ marginTop: 8, fontWeight: 600 }}>WiFi'ga ulang</div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <ThunderboltOutlined style={{ fontSize: 28, color: '#F59E0B' }} />
            <div style={{ marginTop: 8, fontWeight: 600 }}>Quvvatga ulang</div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <CheckCircleOutlined style={{ fontSize: 28, color: '#16A34A' }} />
            <div style={{ marginTop: 8, fontWeight: 600 }}>Avto-davom</div>
          </Card>
        </Col>
      </Row>

      <Steps
        direction="vertical"
        current={-1}
        items={[
          {
            title: '1. APK faylini yuklang',
            icon: <DownloadOutlined />,
            description: (
              <div style={{ marginTop: 8 }}>
                <Paragraph>
                  Yuqoridagi "Royaltaxi-Tunnel.apk yuklash" tugmasini bosing.
                  Yoki telefon brauzerida:
                </Paragraph>
                <CodeBox copy>{APK_DOWNLOAD}</CodeBox>
              </div>
            ),
          },
          {
            title: '2. "Noma\'lum manbalar" ruxsatini bering',
            icon: <PlayCircleOutlined />,
            description: (
              <Paragraph style={{ marginTop: 8 }}>
                Telefoni "Bu manbadan o'rnatishga ruxsat berilsinmi?" deb so'raydi —
                <Text strong> "Ruxsat ber"</Text> ni bosing. (Faqat brauzer uchun bir martalik ruxsat.)
              </Paragraph>
            ),
          },
          {
            title: '3. APK ni install qiling',
            icon: <PlayCircleOutlined />,
            description: (
              <Paragraph style={{ marginTop: 8 }}>
                "Install" → ko'k tugma. Bir necha soniya kuting. "Open" bosing.
              </Paragraph>
            ),
          },
          {
            title: '4. Ochilganda 2 ta tugmacha bosing',
            icon: <ThunderboltOutlined />,
            description: (
              <div style={{ marginTop: 8 }}>
                <Paragraph>App ochilganda:</Paragraph>
                <Space direction="vertical" size={6}>
                  <div><Tag color="purple">Batareya cheklovini olib tashlash</Tag> — bosing, "Allow"</div>
                  <div><Tag color="purple">Auto-start sozlamasini ochish</Tag> — agar Xiaomi/Oppo/Vivo bo'lsa yoqib qo'ying</div>
                  <div><Tag color="default">Yopish (tunel ishlaydi)</Tag> — appni yoping, xizmat fonda davom etadi</div>
                </Space>
              </div>
            ),
          },
          {
            title: '5. ✅ Tayyor! Bildirishnoma 🚖 doim turadi',
            icon: <CheckCircleOutlined />,
            description: (
              <Paragraph style={{ marginTop: 8 }}>
                Telefon yuqori panelida <Text strong>🚖 Royaltaxi Tunel — Ulangan</Text> bildirishnomasi doim turadi.
                {' '}<Text type="danger">Yopmang!</Text> — bu Android jarayonni o'ldirmasligi uchun.
                {' '}Telefon yongan zahoti tunel avto-tushadi.
              </Paragraph>
            ),
          },
        ]}
      />
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
            🔌
          </div>
          <div>
            <Title level={3} style={{ color: '#fff', margin: 0 }}>
              Tunelni o'rnatish — PC yoki Telefon
            </Title>
            <Paragraph style={{ color: 'rgba(255,255,255,0.85)', margin: '8px 0 0' }}>
              Server O'zbek IP'dan zakazlarni yig'ish uchun uy PC yoki Android telefon orqali tunel kerak.
              Ikkalasini ham o'rnatishingiz mumkin — biri o'chsa, ikkinchisi avtomatik ishga tushadi.
            </Paragraph>
          </div>
        </Space>
      </Card>

      <Card>
        <Tabs
          defaultActiveKey="pc"
          size="large"
          items={[
            {
              key: 'pc',
              label: <span><WindowsOutlined /> Kompyuter (Windows)</span>,
              children: <PcTab />,
            },
            {
              key: 'phone',
              label: <span><AndroidOutlined /> Telefon (Android)</span>,
              children: <PhoneTab />,
            },
          ]}
        />
      </Card>

      <Card title="✅ Tunel ishlamoqdami?" style={{ marginTop: 16 }}>
        <Paragraph>
          <MobileOutlined /> <Text code>/sites</Text> sahifasiga o'ting — agar barcha saytlar
          {' '}<Tag color="success">ishlamoqda</Tag> bo'lsa, tunel ulangan.
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Telefon Termux'da: <Text code>tail -f ~/.royaltaxi/tunnel.log</Text> — jonli log.<br />
          Windows'da: <Text code>schtasks /Query /TN RoyaltaxiTunnel</Text> — holat.
        </Paragraph>
      </Card>
    </div>
  );
}
