import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Log proxy requests for debugging
            console.log('[Proxy] Forwarding:', req.method, req.url);
            // Ensure cookies are forwarded
            if (req.headers.cookie) {
              console.log('[Proxy] Cookies:', req.headers.cookie);
            }
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // Log set-cookie headers
            if (proxyRes.headers['set-cookie']) {
              console.log('[Proxy] Set-Cookie received:', proxyRes.headers['set-cookie']);
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});