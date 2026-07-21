import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2022',
  },
  {
    entry: { 'auto-register': 'src/auto-register.ts' },
    format: ['esm', 'iife'],
    globalName: 'Chatling',
    dts: true,
    sourcemap: true,
    minify: true,
    target: 'es2022',
  },
]);
