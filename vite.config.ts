import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        diagnosis: resolve(__dirname, 'diagnosis/index.html'),
        method: resolve(__dirname, 'method/index.html'),
      },
    },
  },
});
