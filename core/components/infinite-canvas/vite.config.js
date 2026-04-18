import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: { entry: './index.ts', fileName: 'infinite-canvas', formats: ['es'] },
    rollupOptions: { external: [/^lit-html/, /^@mihnea240\/ui-core/] }
  }
});
