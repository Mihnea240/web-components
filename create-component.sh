#!/bin/bash

NAME=$1
[ -z "$NAME" ] && {
	echo "Usage: $0 <name>"
	exit 1
}

PACKAGE_DIR="packages/$NAME"
DEMO_DIR="demos/$NAME"

mkdir -p "$PACKAGE_DIR" "$DEMO_DIR"

# Corrected Exports Syntax
cat >"$PACKAGE_DIR/package.json" <<EOF
{
  "name": "@mihnea240/$NAME",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./index.ts",
    "./*": "./*"
  }
}
EOF

touch "$PACKAGE_DIR/index.ts"
touch "$DEMO_DIR/index.html"
touch "$DEMO_DIR/main.ts"

# Add the Vite Library Config
cat >"$PACKAGE_DIR/vite.config.js" <<EOF
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: { entry: './index.ts', fileName: '$NAME', formats: ['es'] },
    rollupOptions: { external: [/^lit-html/, /^@mihnea240\/ui-core/] }
  }
});
EOF

echo "✅ Distribution config added to $PACKAGE_DIR"

echo "✅ Created @mihnea240/$NAME"
