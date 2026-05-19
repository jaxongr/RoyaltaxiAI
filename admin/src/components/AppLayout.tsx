import { useState } from 'react';
import { Layout, Menu, Badge, Tooltip, theme, Button, Dropdown, App as AntdApp } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  EnvironmentOutlined,
  CarOutlined,
  TeamOutlined,
  WarningOutlined,
  StopOutlined,
  UnorderedListOutlined,
  BarChartOutlined,
  FileTextOutlined,
  SettingOutlined,
  PhoneOutlined,
  AuditOutlined,
  UserOutlined,
  GlobalOutlined,
  ExclamationCircleOutlined,
  LineChartOutlined,
  CrownOutlined,
  UserDeleteOutlined,
  UserSwitchOutlined,
  CompassOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  RobotOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  ReloadOutlined,
  MobileOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type Overview } from '../lib/api';
import styled from 'styled-components';

const { Header, Sider, Content } = Layout;

// Menyu — toifalarga ajratilgan (foydalanish oson)
const menuItems: MenuProps['items'] = [
  { key: '/', icon: <DashboardOutlined />, label: 'Asosiy' },

  {
    key: 'grp-orders',
    type: 'group',
    label: 'ZAKAZLAR',
    children: [
      { key: '/orders', icon: <UnorderedListOutlined />, label: 'Zakazlar' },
      { key: '/regions', icon: <EnvironmentOutlined />, label: 'Hududlar' },
      { key: '/routes', icon: <CompassOutlined />, label: "Yo'nalishlar" },
      { key: '/cancels', icon: <CloseCircleOutlined />, label: 'Bekor sabablari' },
    ],
  },

  {
    key: 'grp-drivers',
    type: 'group',
    label: 'HAYDOVCHILAR',
    children: [
      { key: '/drivers', icon: <CarOutlined />, label: 'Haydovchilar' },
      { key: '/drivers-full', icon: <UserOutlined />, label: "To'liq ro'yxat" },
      { key: '/driver-activity', icon: <CheckCircleOutlined />, label: 'Aktivlik' },
      { key: '/top-earners', icon: <CrownOutlined />, label: 'Top daromad' },
    ],
  },

  {
    key: 'grp-fraud',
    type: 'group',
    label: 'XAVFSIZLIK',
    children: [
      { key: '/alerts', icon: <WarningOutlined />, label: 'Ogohlantirishlar' },
      { key: '/violators', icon: <ExclamationCircleOutlined />, label: 'Qoida buzarlar' },
      { key: '/blocks', icon: <StopOutlined />, label: 'Bloklar' },
      { key: '/blacklist', icon: <PhoneOutlined />, label: "Qora ro'yxat" },
      { key: '/client-blacklist', icon: <UserDeleteOutlined />, label: "Mijoz qora ro'yxati" },
    ],
  },

  {
    key: 'grp-clients',
    type: 'group',
    label: 'MIJOZLAR',
    children: [
      { key: '/clients', icon: <TeamOutlined />, label: 'Mijozlar' },
      { key: '/retention', icon: <UserSwitchOutlined />, label: 'Retention' },
    ],
  },

  {
    key: 'grp-analytics',
    type: 'group',
    label: 'ANALITIKA',
    children: [
      { key: '/stats', icon: <BarChartOutlined />, label: 'Statistika' },
      { key: '/analytics', icon: <LineChartOutlined />, label: 'Analitika' },
      { key: '/reports', icon: <FileTextOutlined />, label: 'Hisobotlar' },
    ],
  },

  {
    key: 'grp-admin',
    type: 'group',
    label: 'ADMIN',
    children: [
      { key: '/sites', icon: <GlobalOutlined />, label: 'Saytlar' },
      { key: '/mobile-tunnel', icon: <MobileOutlined />, label: 'Mobil tunel' },
      { key: '/telegram-users', icon: <RobotOutlined />, label: 'Bot foydalanuvchilar' },
      { key: '/audit', icon: <AuditOutlined />, label: 'Audit log' },
      { key: '/settings', icon: <SettingOutlined />, label: 'Sozlamalar' },
    ],
  },
];

// Flat ro'yxat — page title topish uchun
const flatItems: Array<{ key: string; label: string }> = [];
for (const item of menuItems ?? []) {
  if (!item) continue;
  const it = item as { type?: string; children?: Array<{ key: string; label: string }>; key?: string; label?: string };
  if (it.type === 'group' && it.children) {
    for (const child of it.children) flatItems.push(child);
  } else if (it.key && it.label) {
    flatItems.push({ key: it.key, label: it.label });
  }
}

const Brand = styled.div<{ $collapsed: boolean }>`
  height: 64px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: ${(p) => (p.$collapsed ? '0' : '0 20px')};
  justify-content: ${(p) => (p.$collapsed ? 'center' : 'flex-start')};
  font-weight: 700;
  font-size: 17px;
  color: #1a1a2e;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
  overflow: hidden;
`;

const StatusBar = styled.div`
  display: flex;
  gap: 14px;
  align-items: center;
  font-size: 13px;
  color: #6b7280;
  flex-wrap: wrap;

  .item b { color: #1a1a2e; }
  .pulse {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #16a34a;
    box-shadow: 0 0 8px #16a34a;
    animation: p 2s infinite;
    &.warn { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
    &.dead { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
  }
  @keyframes p { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`;

export default function AppLayout(): JSX.Element {
  const nav = useNavigate();
  const loc = useLocation();
  const { token } = theme.useToken();
  const { message } = AntdApp.useApp();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sider_collapsed') === '1';
  });

  const toggleCollapsed = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sider_collapsed', next ? '1' : '0');
  };

  const { data } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () => api.get<Overview>('/overview').then((r) => r.data),
    refetchInterval: 5000,
  });

  interface TunnelStatus {
    connected: boolean;
    clients: Array<{ ip: string; port: number }>;
    clientCount: number;
    proxyMs: number;
  }
  const { data: tunnel } = useQuery<TunnelStatus>({
    queryKey: ['tunnel-status'],
    queryFn: () => api.get<TunnelStatus>('/tunnel-status').then((r) => r.data),
    refetchInterval: 10000,
    retry: false,
  });

  const cov = data?.coveragePct ?? null;
  const tickAgo = data?.secondsSinceLastTick ?? null;
  const pulseClass = tickAgo === null
    ? 'dead'
    : tickAgo > 120
      ? 'dead'
      : tickAgo > 60 || (cov !== null && cov < 95)
        ? 'warn'
        : '';

  const currentKey = loc.pathname === '/' ? '/' : `/${loc.pathname.split('/')[1]}`;
  const currentTitle = flatItems.find((i) => i.key === currentKey)?.label ?? 'Boshqaruv';
  const username = localStorage.getItem('username') ?? 'admin';

  const onLogout = (): void => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('username');
    delete api.defaults.headers.common['Authorization'];
    message.success('Tizimdan chiqildi');
    nav('/login', { replace: true });
  };

  const userMenu: MenuProps['items'] = [
    {
      key: 'reload',
      icon: <ReloadOutlined />,
      label: 'Sahifani yangilash',
      onClick: () => window.location.reload(),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Chiqish',
      danger: true,
      onClick: onLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={240}
        collapsedWidth={64}
        collapsed={collapsed}
        style={{
          borderRight: `1px solid ${token.colorBorder}`,
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
        }}
      >
        <Brand $collapsed={collapsed}>
          <span style={{ fontSize: 22 }}>🚖</span>
          {!collapsed && <span>Royaltaxi AI</span>}
        </Brand>
        <Menu
          mode="inline"
          selectedKeys={[currentKey]}
          items={menuItems}
          onClick={({ key }) => nav(key)}
          style={{ borderRight: 0, padding: '8px 0' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 16px',
            borderBottom: `1px solid ${token.colorBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: token.colorBgContainer,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleCollapsed}
            />
            <div style={{ fontSize: 17, fontWeight: 600 }}>{currentTitle}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <StatusBar>
              <Tooltip title="Saytdan olingan zakaz va bizning ma'lumotlar foizi">
                <div className="item">
                  <span className={`pulse ${pulseClass}`} /> Qamrov: <b>{cov === null ? '—' : `${cov.toFixed(1)}%`}</b>
                </div>
              </Tooltip>
              <div className="item">Tick: <b>{data?.tickCount ?? 0}</b></div>
              <div className="item">Oxirgi: <b>{tickAgo === null ? '—' : `${tickAgo} sek`}</b></div>
              <Tooltip title={tunnel
                ? (tunnel.connected
                    ? `Tunel ulangan (${tunnel.proxyMs}ms) — ${tunnel.clientCount} ta ulanish\n${tunnel.clients.map((c) => `• ${c.ip}`).join('\n') || '—'}`
                    : 'Tunel uzilgan — telefon yoki PC ulanishi kerak')
                : 'Tunel holati noma\'lum'}>
                <div className="item" style={{ cursor: 'pointer' }}
                  onClick={() => nav('/mobile-tunnel')}>
                  <span className={`pulse ${tunnel?.connected ? '' : 'dead'}`} />
                  {' '}Tunel: <b>{tunnel
                    ? (tunnel.connected
                        ? (tunnel.clientCount > 0 ? '🔌 Ulangan' : '⚠️ Yo\'q')
                        : '❌ Uzilgan')
                    : '...'}</b>
                </div>
              </Tooltip>
              <Tooltip title="Oxirgi 1 soatda kelgan ogohlantirishlar">
                <Badge count={data?.alertsLastHour ?? 0} showZero={false} color="#F59E0B" />
              </Tooltip>
            </StatusBar>
            <Dropdown menu={{ items: userMenu }} placement="bottomRight">
              <Button type="text" icon={<UserOutlined />}>
                {username}
              </Button>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ padding: 24, background: token.colorBgLayout }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
