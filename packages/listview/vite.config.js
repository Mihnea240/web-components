import { defineConfig } from 'vite';
export default defineConfig({
	build: {
		lib: { entry: './index.js', fileName: 'listview', formats: ['es'] },
		rollupOptions: { external: [/^lit-html/, /^@mihnea240\/ui-core/] }
	}
});
