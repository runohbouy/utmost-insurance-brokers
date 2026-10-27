import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// The website is a static front end: all server work happens in the ERP
// backend (../ERP), reached at /api/site/*.
//
//  - Development: Vite proxies /api to the ERP (default http://localhost:3100,
//    override with ERP_URL), so the browser sees one origin and no CORS setup.
//  - Production: build with VITE_API_URL=<the ERP's public origin>, and add this
//    site's origin to the ERP's ALLOWED_ORIGIN.
export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: process.env.ERP_URL || 'http://localhost:3100',
          changeOrigin: true,
        },
      },
    },
  };
});
