// 平面自检：直接跑 plan.js 的编译，列出会生成哪些门洞，并检查
// 有没有画正好挂在门洞里。
//
// 为什么要这个脚本：headless 浏览器查这些动不动就被 SIGTERM，
// 而且"画在门里"这种问题在几何上一算就知道，没必要靠截图抽查。
// 改完平面布局（尤其加房间）之后跑一下。
//
// 用法：node tools/check-plan.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPlan } from '../src/plan.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'public/data/museum.json'), 'utf8'));

const plan = buildPlan(data);
const kindOf = (id) => plan.rooms.find((r) => r.id === id)?.kind || '?';
const nameOf = (id) => plan.rooms.find((r) => r.id === id)?.name || id;

const byKind = {};
const list = [];
for (const o of plan.openings) {
  const [a, b] = o.rooms;
  const key = [kindOf(a), kindOf(b)].sort().join(' + ');
  byKind[key] = (byKind[key] || 0) + 1;
  list.push(`${nameOf(a)} ↔ ${nameOf(b)}   ${o.axis}@${o.at.toFixed(1)}  ${o.from.toFixed(1)}~${o.to.toFixed(1)}`);
}

console.log(`房间 ${plan.rooms.length} 个，门洞 ${plan.openings.length} 个`);
console.log('按类型：', byKind);
console.log();
for (const l of list) console.log('  ' + l);

// 展厅之间不该直接连通 —— 逛展动线是「展厅 → 走廊/门厅 → 展厅」，
// 而且展厅的侧墙是挂画的地方，开了门就会把画堵在门里。
const between = byKind['gallery + gallery'] || 0;
console.log();
console.log(between ? `✗ 有 ${between} 个门洞开在展厅之间` : '✓ 没有展厅之间的门洞');

// 逐幅检查画和门洞是否重叠
let bad = 0;
for (const room of plan.rooms) {
  for (const a of room.arts || []) {
    const x0 = a.position.x - a.size.width / 2;
    const x1 = a.position.x + a.size.width / 2;
    const z0 = a.position.z - a.size.height / 2;
    const z1 = a.position.z + a.size.height / 2;
    for (const o of plan.openings) {
      const inX = o.axis === 'x'
        ? Math.abs(a.position.x - o.at) < 0.6
        : (x0 < o.to && x1 > o.from);
      const inZ = o.axis === 'x'
        ? (z0 < o.to && z1 > o.from)
        : Math.abs(a.position.z - o.at) < 0.6;
      if (inX && inZ) {
        bad++;
        console.log(`✗ ${room.name} 「${a.title}」挂在 ${o.axis}@${o.at} 的门洞里`);
      }
    }
  }
}
console.log(bad === 0 ? '✓ 没有画挂在门洞里' : `✗ 共 ${bad} 处画/门洞冲突`);

// ---- 画 / 独立展墙 ----
// 展厅里的 partitions 是从墙边伸出来的半截墙，高度 3.6 正好盖住挂画带。
// 它的 z（或 x）只要落进某幅画的展幅，那幅画就被人站在正面看不全 ——
// 展厅四的 Nocturne: Palaces 就是这么被隔断从画心穿过去的。
// 按画的朝向算它在地面上的投影，再和隔断矩形相交。
function artFootprint(a) {
  const w = a.size.width;
  const p = a.position;
  const vertical = Math.abs(Math.abs(a.rotation?.y || 0) - Math.PI / 2) < 0.01; // 东西墙
  return vertical
    ? { x0: p.x - 0.3, x1: p.x + 0.1, z0: p.z - w / 2, z1: p.z + w / 2 }
    : { x0: p.x - w / 2, x1: p.x + w / 2, z0: p.z - 0.3, z1: p.z + 0.1 };
}

let blocked = 0;
for (const room of plan.rooms) {
  for (const p of room.partitions || []) {
    for (const a of room.arts || []) {
      const f = artFootprint(a);
      if (f.x0 < p.x1 && f.x1 > p.x0 && f.z0 < p.z1 && f.z1 > p.z0) {
        blocked++;
        console.log(`✗ ${room.name} 「${a.title}」被独立展墙压住（隔断 x${p.x0}~${p.x1} z${p.z0}~${p.z1}）`);
      }
    }
  }
}
console.log(blocked === 0 ? '✓ 没有画被独立展墙挡住' : `✗ 共 ${blocked} 处画/隔断冲突`);

process.exit(bad === 0 && between === 0 && blocked === 0 ? 0 : 1);
