import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/admin/exhibition': {
          target: env.EXHIBITION_PROXY_TARGET || 'http://127.0.0.1:5181',
          rewrite: (path) => path.replace(/^\/admin\/exhibition/, '') || '/',
        },
        '/api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
          // Preserve the browser's origin so the API can verify same-origin writes.
          changeOrigin: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
