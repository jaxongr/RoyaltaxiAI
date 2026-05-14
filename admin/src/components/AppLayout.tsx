import { Layout, Menu, Badge, Tooltip, theme } from 'antd';
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
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type Overview } from '../lib/api';
import styled from 'styled-components';

const { Header, Sider, Content } = Layout;

const items = [
  { key: '/', icon: <DashboardOutlined />, label: 'Asosiy' },
  { key: '/regions', icon: <EnvironmentOutlined />, label: 'Hududlar' },
  { key: '/drivers', icon: <CarOutlined />, label: 'Haydovchilar' },
  { key: '/drivers-full', icon: <UserOutlined />, label: 'Haydovchilar (to\'liq)' },
  { key: '/clients', icon: <TeamOutlined />, label: 'Mijozlar' },
  { key: '/alerts', icon: <WarningOutlined />, label: 'Ogohlantirishlar' },
  { key: '/violators', icon: <ExclamationCircleOutlined />, label: 'Qoida buzarlar' },
  { key: '/blocks', icon: <StopOutlined />, label: 'Bloklar' },
  { key: '/blacklist', icon: <PhoneOutlined />, label: 'Qora ro\'yxat' },
  { key: '/orders', icon: <UnorderedListOutlined />, label: 'Zakazlar' },
  { key: '/stats', icon: <BarChartOutlined />, label: 'Statistika' },
  { key: '/reports', icon: <FileTextOutlined />, label: 'Hisobotlar' },
  { key: '/audit', icon: <AuditOutlined />, label: 'Audit log' },
  { key: '/sites', icon: <GlobalOutlined />, label: 'Saytlar' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Sozlamalar' },
];

const Brand = styled.div`
  height: 64px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  font-weight: 700;
  font-size: 17px;
  color: #1a1a2e;
  border-bottom: 1px solid #e5e7eb;
`;

const StatusBar = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 13px;
  color: #6b7280;

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
  const { data } = useQuery<Overview>({
    queryKey: ['overview'],
    queryFn: () => api.get<Overview>('/overview').then((r) => r.data),
    refetchInterval: 2000,
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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={240} style={{ borderRight: `1px solid ${token.colorBorder}` }}>
        <Brand>
          <span style={{ fontSize: 22 }}>🚖</span>
          <span>Royaltaxi AI</span>
        </Brand>
        <Menu
          mode="inline"
          selectedKeys={[loc.pathname === '/' ? '/' : `/${loc.pathname.split('/')[1]}`]}
          items={items}
          onClick={({ key }) => nav(key)}
          style={{ borderRight: 0, padding: '12px 8px' }}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', borderBottom: `1px solid ${token.colorBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>
            {items.find((i) => i.key === (loc.pathname === '/' ? '/' : `/${loc.pathname.split('/')[1]}`))?.label ?? 'Boshqaruv'}
          </div>
          <StatusBar>
            <Tooltip title="Saytdan olingan zakaz va bizning ma'lumotlar foizi">
              <div className="item">
                <span className={`pulse ${pulseClass}`} /> Qamrov: <b>{cov === null ? '—' : `${cov.toFixed(1)}%`}</b>
              </div>
            </Tooltip>
            <div className="item">Tick: <b>{data?.tickCount ?? 0}</b></div>
            <div className="item">Oxirgi: <b>{tickAgo === null ? '—' : `${tickAgo} sek`}</b></div>
            <Badge count={data?.alertsLastHour ?? 0} showZero={false} color="#F59E0B" />
          </StatusBar>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
