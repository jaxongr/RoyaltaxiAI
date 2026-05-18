import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist-admin',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor split — keshlanadi, sahifalar yangilanganda qayta yuklanmaydi
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'antd-core': ['antd', '@ant-design/icons'],
          'query': ['@tanstack/react-query', 'axios'],
        },
      },
    },
  },
});
