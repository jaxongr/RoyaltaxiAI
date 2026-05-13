import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import DashboardPage from './pages/DashboardPage';
import RegionsPage from './pages/RegionsPage';
import DriversPage from './pages/DriversPage';
import DriversFullPage from './pages/DriversFullPage';
import ClientsPage from './pages/ClientsPage';
import BlacklistPage from './pages/BlacklistPage';
import AuditPage from './pages/AuditPage';
import AlertsPage from './pages/AlertsPage';
import BlocksPage from './pages/BlocksPage';
import OrdersPage from './pages/OrdersPage';
import StatsPage from './pages/StatsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/regions" element={<RegionsPage />} />
        <Route path="/drivers" element={<DriversPage />} />
        <Route path="/drivers-full" element={<DriversFullPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/blacklist" element={<BlacklistPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/blocks" element={<BlocksPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
