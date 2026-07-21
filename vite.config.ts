import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      // HMR websocket port is derived from the app's own PORT (offset so it never collides with
      // the main HTTP port) so multiple concurrent dev instances on different ports don't fight
      // over Vite's fixed default HMR port (24678).
      hmr: process.env.DISABLE_HMR !== 'true'
        ? { port: (Number(process.env.PORT) || 3000) + 10000 }
        : false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
