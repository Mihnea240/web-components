import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: { entry: './index.ts', fileName: 'template-generator', formats: ['es'] },
    rollupOptions: { external: [/^lit-html/, /^@mihnea240\/ui-core/] }
  }
});
