import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { handleNodeRequest, ROUTES } from './server/nodeAdapter';

/**
 * 개발 서버에서 /api/* 를 Vercel 서버리스 함수와 동일한 핸들러로 처리.
 * 비밀 값은 .env.local 에서 읽되(접두사 없는 변수 포함) 브라우저 번들에는 주입하지 않는다.
 */
function localApi(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        // /api/account/* 는 함수 1개(/api/account)가 하위 경로를 나눠 처리한다 (Vercel 무료 함수 12개 한도 대비)
        const route = path.startsWith('/api/account/') ? '/api/account' : path;
        if (!(route in ROUTES)) return next();
        void handleNodeRequest(req, res, route, env);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), localApi(mode)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}));
