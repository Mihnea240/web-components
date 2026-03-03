import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: { entry: './index.ts', fileName: 'list-window', formats: ['es'] },
    rollupOptions: { external: [/^lit-html/, /^@mihnea240\/ui-core/] }
  }
});
