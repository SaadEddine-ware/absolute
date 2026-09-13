import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  // Workspace library: consumers (cli) resolve these from their own node_modules.
  external: ['@absolute/core', 'ink', 'react'],
});