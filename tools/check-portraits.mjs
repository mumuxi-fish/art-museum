// 头像自检：tools/portraits.json ↔ public/art/portraits/ ↔ museum.json 三者对得上，
// 并且每条真头像都有来源和授权。抓图那步会张冠李戴（"after Frans Hals"、
// 名刺、风景版画都被当成过头像），光看文件在不在不够，来源字段也得在。
//
// 用法：node tools/check-portraits.mjs

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const artworks = readJson('tools/artworks.json');
const portraits = readJson('tools/portraits.json');
const museum = readJson('public/data/museum.json');

const artists = [...new Set(Object.values(artworks).flat().map((a) => a.artist))].sort();
const byArtist = portraits.artists || {};
const real = [];
const silhouette = [];
let failed = 0;

const ok = (msg) => console.log(`✓ ${msg}`);
const bad = (msg) => {
  failed += 1;
  console.log(`✗ ${msg}`);
};

// 1. 覆盖面：每位画家都得有条目（真头像或剪影兜底，二选一）
const missing = artists.filter((a) => !byArtist[a]);
if (missing.length) bad(`portraits.json 缺画家：${missing.join('、')}`);
else ok(`35 位画家全覆盖（${artists.length} 位）`);

// 2. 每条真头像：文件在、是 WebP、体积正常、来源授权齐全
for (const [name, info] of Object.entries(byArtist)) {
  if (!info.file) {
    if (info.kind !== 'silhouette') bad(`${name}: 没有 file 却不是 silhouette`);
    silhouette.push(name);
    continue;
  }
  real.push(name);
  const abs = join(root, 'public/art', info.file);
  if (!existsSync(abs)) {
    bad(`${name}: 图片不存在 ${info.file}`);
    continue;
  }
  const buf = readFileSync(abs);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    bad(`${name}: 不是 WebP（${info.file}）`);
  }
  if (buf.length > 40 * 1024) bad(`${name}: 太大 ${(buf.length / 1024) | 0}KB > 40KB`);
  if (info.size !== buf.length) bad(`${name}: size 记的 ${info.size} ≠ 实际 ${buf.length}`);
  if (basename(info.file, '.webp') !== (info.raw || '').replace(/\.[^.]+$/, '')) {
    // 原图文件名和成品同名，方便回溯；不一致只提醒
    console.log(`  · ${name}: raw=${info.raw} 与 file 不同名`);
  }
  for (const field of ['title', 'creator', 'provider', 'license', 'source']) {
    if (!info[field]) bad(`${name}: 缺 ${field}（CC0 来源必须可追溯）`);
  }
}
if (real.length) ok(`${real.length} 张真头像（文件 + 来源 + 授权齐全），${silhouette.length} 位走剪影`);

// 3. museum.json：每幅画都挂了头像，真头像指向存在的文件
let withReal = 0;
let withSil = 0;
let without = 0;
for (const room of museum.rooms) {
  for (const art of room.arts || []) {
    const p = art.portrait;
    if (!p) {
      without += 1;
      continue;
    }
    if (p === 'silhouette') {
      withSil += 1;
      if (byArtist[art.artist]?.file) bad(`${art.id}: ${art.artist} 有真头像却挂了剪影`);
      continue;
    }
    withReal += 1;
    if (!existsSync(join(root, 'public/art', p))) bad(`${art.id}: ${p} 不存在`);
    if (byArtist[art.artist] !== p && byArtist[art.artist]?.file !== p) {
      bad(`${art.id}: ${art.artist} 的 portrait 和 portraits.json 对不上`);
    }
  }
}
const total = withReal + withSil + without;
if (without) bad(`${without} 幅画没有 portrait 字段`);
else ok(`museum.json：${withReal} 幅挂真头像、${withSil} 幅挂剪影，共 ${total} 幅`);
if (!withReal) bad('一幅真头像都没挂上');

// 4. CREDITS.md 里能查到每张真头像的出处
const credits = readFileSync(join(root, 'CREDITS.md'), 'utf8');
const notCredited = real.filter((name) => !credits.includes(name));
if (notCredited.length) bad(`CREDITS.md 漏了：${notCredited.join('、')}`);
else if (real.length) ok('CREDITS.md 列出了全部真头像出处');

console.log(failed ? `\n✗ ${failed} 项没过` : '\n✓ 头像自检全过');
process.exit(failed ? 1 : 0);
