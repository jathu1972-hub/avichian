import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** GitHub Pages project site needs base `/avichian-student-app/`. Netlify uses `/`. */
const pagesBase = process.env.VITE_BASE || (process.env.GITHUB_PAGES === 'true' ? '/avichian-student-app/' : '/');

export default defineConfig({
  base: pagesBase,
  plugins: [react(), tailwindcss()] as PluginOption[],
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-socket': ['socket.io-client'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
        // Large video uploads must not be cut off by proxy timeouts
        timeout: 0,
        proxyTimeout: 0,
        cookieDomainRewrite: '',
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const cookies = proxyRes.headers['set-cookie'];
            if (!cookies) return;
            proxyRes.headers['set-cookie'] = cookies.map((cookie) =>
              cookie
                .replace(/; secure/gi, '')
                .replace(/; domain=[^;]+/gi, ''),
            );
          });
          proxy.on('error', (err, _req, res) => {
            console.error('[vite proxy → API]', err.message);
            if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  success: false,
                  error:
                    'Cannot reach API at http://127.0.0.1:4000. Start the backend (npm run dev -w backend).',
                  code: 'API_UNREACHABLE',
                }),
              );
            }
          });
        },
      },
      '/socket.io': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        ws: true,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
});
