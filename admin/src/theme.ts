import type { ThemeConfig } from 'antd';

// Yandex-uslubidagi yumshoq, ko'zga moslik premium ranglar
export const yandexTheme: ThemeConfig = {
  token: {
    colorPrimary: '#FC3F1D',
    colorInfo: '#0066FF',
    colorSuccess: '#16A34A',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    borderRadius: 10,
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    colorBgLayout: '#F5F6F8',
    colorBgContainer: '#FFFFFF',
    colorBorder: '#E5E7EB',
    colorText: '#1A1A2E',
    colorTextSecondary: '#6B7280',
  },
  components: {
    Layout: { headerBg: '#FFFFFF', siderBg: '#FFFFFF', bodyBg: '#F5F6F8' },
    Menu: { itemSelectedBg: '#FFF1ED', itemSelectedColor: '#FC3F1D' },
    Table: { headerBg: '#FAFAFB', headerColor: '#6B7280', rowHoverBg: '#FAFAFB' },
    Card: { boxShadowTertiary: '0 1px 3px rgba(0,0,0,0.04)' },
  },
};
