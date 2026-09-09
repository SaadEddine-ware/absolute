import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  // SDKs + keytar are wrapped behind dynamic imports so they are resolved
  // lazily at runtime from the consumer's node_modules, never bundled here.
  external: ['@anthropic-ai/sdk', 'openai', 'keytar'],
});