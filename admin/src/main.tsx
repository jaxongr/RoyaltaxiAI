import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntdApp } from 'antd';
import App from './App';
import { yandexTheme } from './theme';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000,
      gcTime: 60_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={yandexTheme}>
      <AntdApp>
        <QueryClientProvider client={qc}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
