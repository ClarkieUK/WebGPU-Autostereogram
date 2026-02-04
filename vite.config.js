import { defineConfig } from 'vite';

export default defineConfig({
  base: '/WebGPU-Autostereogram/',
  plugins: [
    {
      name: 'wgsl-hot-reload',
      handleHotUpdate({ file, server }) {
        if (file.endsWith('.wgsl')) {
          server.ws.send({
            type: 'full-reload',
            path: '*',
          });
        }
      },
    },
  ],
});