import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  onSuccess: async () => {
    copyFileSync('src/schema.sql', 'dist/schema.sql');
  },
});
