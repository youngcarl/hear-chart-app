import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' 让打包产物用相对路径，部署到 Qoder Sites 的任意子路径都能打开
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' },
  // e2e 目录交给 Playwright，Vitest 只跑 src 下的单元测试
  test: { include: ['src/**/*.test.ts'] },
});
