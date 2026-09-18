import { defineConfig } from 'vite';

// 构建 ID：给 public/ 下的资源做缓存失效用。
// public/ 里的文件（museum.json、art/*.webp）不会被 vite 加 hash，
// 换图或改数据后浏览器会一直用旧的缓存 —— 之前就出过这个事故：
// 旧的 museum.json 指向 .jpg，而 .jpg 已经换成 .webp，结果全部 404。
const BUILD_ID = Date.now().toString(36);

export default defineConfig({
  // GitHub Pages repo name
  base: '/art-museum/',
  root: '.',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    outDir: 'dist',
  },
  server: {
    open: true,
  },
});
