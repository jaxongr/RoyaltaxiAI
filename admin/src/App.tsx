import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RegionsPage from './pages/RegionsPage';
import DriversPage from './pages/DriversPage';
import DriversFullPage from './pages/DriversFullPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import BlacklistPage from './pages/BlacklistPage';
import AuditPage from './pages/AuditPage';
import SitesPage from './pages/SitesPage';
import ViolatorsPage from './pages/ViolatorsPage';
import AlertsPage from './pages/AlertsPage';
import BlocksPage from './pages/BlocksPage';
import OrdersPage from './pages/OrdersPage';
import StatsPage from './pages/StatsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import TopEarnersPage from './pages/TopEarnersPage';
import ClientBlacklistPage from './pages/ClientBlacklistPage';
import RetentionPage from './pages/RetentionPage';
import RoutesPage from './pages/RoutesPage';
import CancelBreakdownPage from './pages/CancelBreakdownPage';
import DriverActivityPage from './pages/DriverActivityPage';
import TelegramUsersPage from './pages/TelegramUsersPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
  const loc = useLocation();
  const token = localStorage.getItem('auth_token');
  if (!token) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  return children;
}

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="/regions" element={<RegionsPage />} />
        <Route path="/drivers" element={<DriversPage />} />
        <Route path="/drivers-full" element={<DriversFullPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:phone" element={<ClientDetailPage />} />
        <Route path="/blacklist" element={<BlacklistPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/sites" element={<SitesPage />} />
        <Route path="/violators" element={<ViolatorsPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/blocks" element={<BlocksPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/top-earners" element={<TopEarnersPage />} />
        <Route path="/client-blacklist" element={<ClientBlacklistPage />} />
        <Route path="/retention" element={<RetentionPage />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/cancels" element={<CancelBreakdownPage />} />
        <Route path="/driver-activity" element={<DriverActivityPage />} />
        <Route path="/telegram-users" element={<TelegramUsersPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
