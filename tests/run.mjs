// npm test 入口：保证 dist 和预览服务就绪 → 逐个跑 tests/*.test.mjs → 汇总退出码。
//   node tests/run.mjs            跑全部（默认先 build）
//   node tests/run.mjs smoke media 只跑名字含这几个词的用例
//   node tests/run.mjs --no-build  跳过构建
//   node tests/run.mjs --list      只列用例
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, ensureFixtures } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const noBuild = argv.includes('--no-build');
const list = argv.includes('--list');
const filters = argv.filter((a) => !a.startsWith('-'));

const all = fs.readdirSync(HERE).filter((f) => f.endsWith('.test.mjs')).sort();
const picked = filters.length ? all.filter((f) => filters.some((k) => f.includes(k))) : all;

if (list) { console.log(picked.join('\n')); process.exit(0); }
if (!picked.length) { console.error('没有匹配的用例:', filters.join(' ')); process.exit(2); }

if (!noBuild || !fs.existsSync(path.join(ROOT, 'dist/index.html'))) {
  const r = spawnSync('node', ['node_modules/vite/bin/vite.js', 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status) process.exit(r.status ?? 1);
}

let preview = null;
async function serverUp() {
  try {
    const res = await fetch(BASE, { method: 'HEAD' });
    return res.ok;
  } catch { return false; }
}
if (!(await serverUp())) {
  console.log('启动预览服务 …');
  preview = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--strictPort', '--port', '4173'],
    { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await serverUp()) break;
  }
  if (!(await serverUp())) { console.error('预览服务起不来'); process.exit(1); }
  process.on('exit', () => preview?.kill());
}

ensureFixtures();

console.log(`\n=== ${picked.length} 个用例 ===\n`);
const results = [];
for (const file of picked) {
  const t = Date.now();
  console.log(`--- ${file} ---`);
  const r = spawnSync(process.execPath, [path.join(HERE, file)], { cwd: ROOT, stdio: 'inherit' });
  results.push({ file, ok: r.status === 0, ms: Date.now() - t });
}

console.log('\n=== 汇总 ===');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.file}  ${(r.ms / 1000).toFixed(1)}s`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
