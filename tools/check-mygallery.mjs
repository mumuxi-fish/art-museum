// 自建展厅（🖼 导入本地照片）平面自检：不碰浏览器，直接跑生成器 + plan.js 编译。
//
// 查这些（都是几何上一算就知道的事，没必要靠截图抽查）：
//   - 两间房能编译，门洞只有一个、开在入口↔长厅之间
//   - spawn 站得住、看得见门
//   - 每幅画都在长厅墙面上，不越界、不压门洞
//   - 墙灯不悬在门洞里，射灯数不超过 artLight.max
//   - 张数从 1 到 80（含极端竖幅/横幅）都成立
//
// 用法：node tools/check-mygallery.mjs

import { buildMyGalleryPlan } from '../src/mygallery-plan.js';
import { buildPlan } from '../src/plan.js';

let checks = 0;
let failed = 0;
function ok(cond, label) {
  checks++;
  if (cond) return;
  failed++;
  console.log(`  ✗ ${label}`);
}

const gen = (n, ar = 1.5) => Array.from({ length: n }, (_, i) => {
  // 混一点极端比例：横幅 3:1、方图 1:1、竖幅 2:3 都见过
  const ratios = [ar, 1, 0.666, 0.8, 2.2];
  const r = ratios[i % ratios.length];
  return { image: `p${i + 1}.webp`, title: `照片 ${i + 1}`, w: Math.round(1600 * r), h: 1600 };
});

for (const n of [1, 2, 3, 5, 12, 24, 40, 80]) {
  console.log(`\n— ${n} 张照片 —`);
  const json = buildMyGalleryPlan(gen(n), { title: '测试文件夹' });
  const plan = buildPlan(json);
  const entrance = plan.byId.get('entrance');
  const gallery = plan.byId.get('gallery');

  ok(plan.rooms.length === 2, `房间数 ${plan.rooms.length} ≠ 2`);
  ok(entrance?.kind === 'entrance' && gallery?.kind === 'gallery', '缺少入口/长厅');
  ok(plan.openings.length === 1, `门洞数 ${plan.openings.length} ≠ 1`);
  const op = plan.openings[0];
  ok(op && op.rooms.includes('entrance') && op.rooms.includes('gallery'),
    '门洞没有连通入口和长厅');
  ok(op && Math.abs(op.width - 3.2) < 1e-6, `门洞宽 ${op?.width} ≠ 3.2`);

  // spawn：站在入口中心，房间判得出来，也不落在家具上
  const s = json.spawn;
  ok(plan.roomAt(s.x, s.z)?.id === 'entrance', 'spawn 不在入口里');
  ok(plan.canStand(s.x, s.z), 'spawn 被家具/墙挡住');
  ok(plan.canStand(s.x + 3, s.z), '从 spawn 向东走不过去（门洞没对上）');

  // 画
  const arts = gallery?.arts || [];
  ok(arts.length === n, `画数 ${arts.length} ≠ ${n}`);
  const ids = new Set(arts.map((a) => a.id));
  const imgs = new Set(arts.map((a) => a.image));
  ok(ids.size === n, '画 id 有重复');
  ok(imgs.size === n, '画 image 有重复');
  ok(arts.every((a) => ['north', 'south', 'east'].includes(a.wall)), '有画挂到了西墙/端墙以外的位置');
  ok(arts.filter((a) => a.wall === 'east').length === 1, '东墙主位不是恰好一张');

  const x0 = gallery.x0, x1 = gallery.x1, z0 = gallery.z0, z1 = gallery.z1;
  for (const a of arts) {
    const hw = a.size.width / 2;
    const hh = a.size.height / 2;
    if (!(a.position.y - hh > 0 && a.position.y + hh < gallery.height)) {
      ok(false, `「${a.title}」高度超出房间`);
    }
    if (a.wall === 'east') {
      // 宽度沿 z 展开、画心贴东墙脸 0.02m，朝向 -π/2（面向西，正对门洞）
      if (!(a.position.z - hw > z0 && a.position.z + hw < z1)) {
        ok(false, `「${a.title}」东墙横向越界（z=${a.position.z}）`);
      }
      if (Math.abs(a.position.x - (x1 - 0.17)) > 0.01 || Math.abs(a.rotation.y + Math.PI / 2) > 1e-6) {
        ok(false, `「${a.title}」没贴在东墙脸上 / 朝向不对`);
      }
      continue;
    }
    // 北/南墙上的画：宽沿 x 展开、高沿 y 展开，z 只是贴墙的薄薄一层
    if (!(a.position.x - hw > x0 && a.position.x + hw < x1)) {
      ok(false, `「${a.title}」横向越界（x=${a.position.x.toFixed(2)}, 长厅 ${x0}~${x1}）`);
    }
    const nearWall = a.wall === 'north'
      ? a.position.z > z0 && a.position.z < z0 + 0.25
      : a.position.z < z1 && a.position.z > z1 - 0.25;
    if (!nearWall) ok(false, `「${a.title}」没贴在 ${a.wall} 墙上（z=${a.position.z}）`);
    // 和 check-plan.mjs 同一条规则：画不能挂在门洞里
    if (op.axis === 'x') {
      const clash = a.position.x - hw < op.at + 0.3 && a.position.x + hw > op.at - 0.3;
      if (clash) ok(false, `「${a.title}」挂在门洞里`);
    }
  }

  // 东墙的两盏壁灯不能压在主位照片上（画心 z=3.5，最宽 3.2m → 边缘 1.9 / 5.1）
  const eastArt = arts.find((a) => a.wall === 'east');
  for (const l of gallery.lights.filter((x) => x.type === 'wall' && x.position.x > x0)) {
    const half = eastArt.size.width / 2 + 0.35;
    if (Math.abs(l.position.z - eastArt.position.z) < half) {
      ok(false, `壁灯 ${l.id} 压在东墙主位照片上`);
    }
  }

  // 墙灯不能压在门洞上（长厅西墙中段就是那 3.2m 的开口）
  for (const l of gallery.lights.filter((x) => x.type === 'wall')) {
    if (l.position.x <= x0 + 0.1 && l.position.z > op.from && l.position.z < op.to) {
      ok(false, `墙灯 ${l.id} 悬在门洞里（z=${l.position.z}）`);
    }
  }

  // 射灯上限：room.js 按 artLight.max 等间隔挑，这里复算一遍
  const max = gallery.artLight?.max;
  ok(Number.isFinite(max), '长厅缺 artLight.max（几幅画就几盏聚光灯，会拖垮 shader）');
  const step = Math.max(1, Math.ceil(n / max));
  const spots = arts.filter((_, i) => i % step === 0).length;
  ok(spots <= max, `射灯 ${spots} 盏 > 上限 ${max}`);

  const lights = gallery.lights.length;
  console.log(
    `  长厅 ${(x1 - x0).toFixed(1)}m × ${z1 - z0}m · 画 ${arts.length} · 灯 ${lights}`
    + `（射灯 ${spots}）· 门洞 ${op.axis}@${op.at}`,
  );
}

console.log(`\n${failed ? `✗ ${failed}/${checks} 项没过` : `✓ ${checks} 项全过`}`);
process.exit(failed ? 1 : 0);
