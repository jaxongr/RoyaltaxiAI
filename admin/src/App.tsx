import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';
import PageLoader from './components/PageLoader';
import LoginPage from './pages/LoginPage';

// Lazy-load: bundle hajmi 1.45MB → ~500KB initial.
// Har sahifa o'z chunk faylida — birinchi yuklash tezroq.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const RegionsPage = lazy(() => import('./pages/RegionsPage'));
const DriversPage = lazy(() => import('./pages/DriversPage'));
const DriversFullPage = lazy(() => import('./pages/DriversFullPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'));
const BlacklistPage = lazy(() => import('./pages/BlacklistPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const SitesPage = lazy(() => import('./pages/SitesPage'));
const ViolatorsPage = lazy(() => import('./pages/ViolatorsPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const BlocksPage = lazy(() => import('./pages/BlocksPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const TopEarnersPage = lazy(() => import('./pages/TopEarnersPage'));
const ClientBlacklistPage = lazy(() => import('./pages/ClientBlacklistPage'));
const RetentionPage = lazy(() => import('./pages/RetentionPage'));
const RoutesPage = lazy(() => import('./pages/RoutesPage'));
const CancelBreakdownPage = lazy(() => import('./pages/CancelBreakdownPage'));
const DriverActivityPage = lazy(() => import('./pages/DriverActivityPage'));
const TelegramUsersPage = lazy(() => import('./pages/TelegramUsersPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const MobileTunnelPage = lazy(() => import('./pages/MobileTunnelPage'));

function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
  const loc = useLocation();
  const token = localStorage.getItem('auth_token');
  if (!token) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  return children;
}

function LazyRoute({ Page }: { Page: React.ComponentType }): JSX.Element {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Page />
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<LazyRoute Page={DashboardPage} />} />
        <Route path="/regions" element={<LazyRoute Page={RegionsPage} />} />
        <Route path="/drivers" element={<LazyRoute Page={DriversPage} />} />
        <Route path="/drivers-full" element={<LazyRoute Page={DriversFullPage} />} />
        <Route path="/clients" element={<LazyRoute Page={ClientsPage} />} />
        <Route path="/clients/:phone" element={<LazyRoute Page={ClientDetailPage} />} />
        <Route path="/blacklist" element={<LazyRoute Page={BlacklistPage} />} />
        <Route path="/audit" element={<LazyRoute Page={AuditPage} />} />
        <Route path="/sites" element={<LazyRoute Page={SitesPage} />} />
        <Route path="/violators" element={<LazyRoute Page={ViolatorsPage} />} />
        <Route path="/alerts" element={<LazyRoute Page={AlertsPage} />} />
        <Route path="/blocks" element={<LazyRoute Page={BlocksPage} />} />
        <Route path="/orders" element={<LazyRoute Page={OrdersPage} />} />
        <Route path="/stats" element={<LazyRoute Page={StatsPage} />} />
        <Route path="/analytics" element={<LazyRoute Page={AnalyticsPage} />} />
        <Route path="/top-earners" element={<LazyRoute Page={TopEarnersPage} />} />
        <Route path="/client-blacklist" element={<LazyRoute Page={ClientBlacklistPage} />} />
        <Route path="/retention" element={<LazyRoute Page={RetentionPage} />} />
        <Route path="/routes" element={<LazyRoute Page={RoutesPage} />} />
        <Route path="/cancels" element={<LazyRoute Page={CancelBreakdownPage} />} />
        <Route path="/driver-activity" element={<LazyRoute Page={DriverActivityPage} />} />
        <Route path="/telegram-users" element={<LazyRoute Page={TelegramUsersPage} />} />
        <Route path="/reports" element={<LazyRoute Page={ReportsPage} />} />
        <Route path="/settings" element={<LazyRoute Page={SettingsPage} />} />
        <Route path="/mobile-tunnel" element={<LazyRoute Page={MobileTunnelPage} />} />
      </Route>
    </Routes>
  );
}
