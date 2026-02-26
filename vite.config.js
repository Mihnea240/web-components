import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamically set the root to the correct demo folder if running with --name
const demoName = process.env.npm_config_name;
const root = demoName ? `demos/${demoName}` : undefined;

export default defineConfig({
	root,
	plugins: [tsconfigPaths()],
	esbuild: {
		target: 'esnext',
		supported: {
			'decorators': false
		},
		tsconfigRaw: {
			compilerOptions: {
				experimentalDecorators: false,
				useDefineForClassFields: true
			}
		}
	}
});