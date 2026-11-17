import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 让打包产物用相对路径，部署到 Qoder Sites 的任意子路径都能打开
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' },
});
