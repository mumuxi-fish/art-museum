import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const ROOT = dirname(fileURLToPath(import.meta.url));

// public/ 下的文件（museum.json、art/*.webp）vite 不会给它们加 hash，
// 换图或改数据后浏览器会一直用旧的缓存 —— 之前就出过这个事故：
// 旧的 museum.json 指向 .jpg，而 .jpg 已经换成 .webp，结果全部 404。
//
// 所以自己按内容算一个 8 位 hash 当版本号。按文件算，不按构建时间算：
// 之前用的是 Date.now()，只要重新 build 一次，URL 全变，7.8MB 缓存全部作废。
// 现在只有内容真的变了的那个文件会换 URL，别的照常吃缓存。
function shortHash(buf) {
  return createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // 目录还不存在（比如 art/640 没生成）
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const ASSET_VERSIONS = {};
for (const file of walk(join(ROOT, 'public'), [])) {
  const key = relative(join(ROOT, 'public'), file).split('\\').join('/');
  if (!/\.(webp|jpe?g|png|json|glb)$/.test(key)) continue;
  ASSET_VERSIONS[key] = shortHash(readFileSync(file));
}

// museum.json 单独留一个短名，方便 fetch 里写 ?v=
const BUILD_ID = ASSET_VERSIONS['data/museum.json'] ?? 'dev';

export default defineConfig({
  // GitHub Pages repo name
  base: '/art-museum/',
  root: '.',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __ASSET_VERSIONS__: JSON.stringify(ASSET_VERSIONS),
  },
  build: {
    outDir: 'dist',
  },
  server: {
    open: true,
  },
});
