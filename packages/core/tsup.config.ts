import { defineConfig } from 'tsup';
import { cpSync } from 'node:fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ['@huggingface/transformers'],
  onSuccess: async () => {
    cpSync('src/migrations', 'dist/migrations', { recursive: true });
  },
});
