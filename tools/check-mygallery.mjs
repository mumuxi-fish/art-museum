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

// ---- 影像装置（视频当画挂）+ 听音点（纯音频的墙牌）----
console.log('\n— 影像装置 + 听音点 —');

const mediaPieces = [
  { image: 'p1.webp', title: '照片 A', w: 1600, h: 1067 },
  { image: 'p2.webp', title: '短片 B', w: 1920, h: 1080, video: true, duration: 204 },
  { image: 'p3.webp', title: '照片 C', w: 1200, h: 1600 },
  { image: 'p4.webp', title: '短片 D', w: 1280, h: 720, video: true, duration: 9.6 },
];
const audios = [
  { key: 'au1', title: '环境声', duration: 204 },
  { key: 'au2', title: '导览词', duration: 63.4 },
  { key: 'au3', title: '现场录音', duration: 5.2 },
];
{
  const json = buildMyGalleryPlan(mediaPieces, { title: '影像文件夹', audios });
  const plan = buildPlan(json);
  const gal = plan.byId.get('gallery');
  const arts = gal.arts || [];
  const st = gal.audioStations || [];
  const op = plan.openings[0];
  const x0 = gal.x0, x1 = gal.x1, z0 = gal.z0, z1 = gal.z1;

  ok(arts.length === mediaPieces.length, `混排画数 ${arts.length} ≠ ${mediaPieces.length}`);
  const vids = arts.filter((a) => a.video);
  ok(vids.length === 2, `影像件 ${vids.length} ≠ 2`);
  ok(arts[0].wall === 'east' && arts[0].title === '照片 A', '东墙主位不是排在最前的那件');
  ok(vids.every((a) => a.technique === '影像装置'), '影像件没标「影像装置」');
  ok(vids.every((a) => /^\d+×\d+$/.test(a.dimensions)), '影像件缺原始像素尺寸');
  ok(vids.every((a) => /循环播放/.test(a.description)), '影像件描述里没有循环播放');
  ok(arts.filter((a) => !a.video).every((a) => a.technique === ''), '照片不该标成影像装置');

  ok(st.length === audios.length, `站牌数 ${st.length} ≠ ${audios.length}`);
  ok(new Set(st.map((s) => s.key)).size === st.length, '站牌 key 有重复');
  ok(st.every((s) => ['north', 'south'].includes(s.wall)), '站牌挂到了照片以外的墙上');
  ok(st.every((s) => Math.abs(s.size.width - 0.95) < 1e-9 && Math.abs(s.size.height - 0.62) < 1e-9),
    '站牌尺寸不对');
  ok(st.every((s) => s.rotation.y === (s.wall === 'north' ? 0 : Math.PI)), '站牌朝向不对');
  ok(st.every((s) => s.position.y > 0.6 && s.position.y < 2.2), '站牌中心高度不合理');
  ok(st.every((s) => s.position.x - s.size.width / 2 > x0 && s.position.x + s.size.width / 2 < x1),
    '站牌横向越界');
  ok(st.every((s) => s.position.z > z0 && s.position.z < z1), '站牌不在长厅深度里');
  const inDoor = (x, z) => Math.abs(x - x0) < 0.4 && z > op.from && z < op.to;
  ok(st.every((s) => !inDoor(s.position.x, s.position.z)), '有站牌挂在门洞里');
  const fmt = (k) => st.find((s) => s.key === k)?.duration;
  ok(fmt('au1') === '3:24', `时长格式 ${fmt('au1')} ≠ 3:24`);
  ok(fmt('au2') === '1:03', `时长格式 ${fmt('au2')} ≠ 1:03`);
  ok(fmt('au3') === '0:05', `时长格式 ${fmt('au3')} ≠ 0:05`);

  // 同一面墙上，画和站牌是一条排下来的：任何两件都不能叠在一起
  for (const wall of ['north', 'south']) {
    const boxes = [
      ...arts.filter((a) => a.wall === wall)
        .map((a) => [a.position.x - a.size.width / 2, a.position.x + a.size.width / 2, `画「${a.title}」`]),
      ...st.filter((s) => s.wall === wall)
        .map((s) => [s.position.x - s.size.width / 2, s.position.x + s.size.width / 2, `站牌「${s.title}」`]),
    ].sort((p, q) => p[0] - q[0]);
    for (let i = 1; i < boxes.length; i++) {
      if (boxes[i][0] < boxes[i - 1][1] - 1e-6) {
        ok(false, `${wall} 墙上 ${boxes[i][2]} 压住了 ${boxes[i - 1][2]}`);
      }
    }
  }
  console.log(`  混排：画 ${arts.length}（影像 ${vids.length}）· 站牌 ${st.length} · 长厅 ${(x1 - x0).toFixed(1)}m`);
}

// 纯音频文件夹：一件画都没有，第一块牌子顶替东墙主位
{
  const onlyAudios = [
    { key: 'au1', title: '其一', duration: 12.3 },
    { key: 'au2', title: '其二', duration: 71 },
    { key: 'au3', title: '其三', duration: 300 },
  ];
  const json = buildMyGalleryPlan([], { title: '纯音频', audios: onlyAudios });
  const plan = buildPlan(json);
  const gal = plan.byId.get('gallery');
  const arts = gal.arts || [];
  const st = gal.audioStations || [];
  ok(arts.length === 0, `纯音频不该有画，实际 ${arts.length}`);
  ok(st.length === onlyAudios.length, `纯音频站牌数 ${st.length} ≠ ${onlyAudios.length}`);
  const hero = st.find((s) => s.wall === 'east');
  ok(Boolean(hero), '纯音频时东墙没有主位站牌');
  if (hero) {
    ok(Math.abs(hero.position.y - 1.6) < 1e-9, `主位站牌高度 ${hero.position.y} ≠ 1.6`);
    ok(Math.abs(hero.rotation.y + Math.PI / 2) < 1e-6, '主位站牌朝向不是正对门洞');
    ok(Math.abs(hero.position.x - (gal.x1 - 0.17)) < 0.01, '主位站牌没贴东墙脸');
    ok(Math.abs(hero.position.z - gal.cz) < 0.01, '主位站牌不在东墙中间');
  }
  ok(st.filter((s) => s.wall !== 'east').length === 2, '北/南墙的站牌数不对');
  console.log(`  纯音频：站牌 ${st.length}（东墙主位 1）· 长厅 ${(gal.x1 - gal.x0).toFixed(1)}m`);
}

// 全是视频：东墙主位也得是影像装置（深框、能被射线点开）
{
  const onlyVids = [1, 2].map((i) => ({
    image: `v${i}.webp`, title: `短片 ${i}`, w: 1920, h: 1080, video: true, duration: 30 + i,
  }));
  const plan = buildPlan(buildMyGalleryPlan(onlyVids, { title: '全是视频' }));
  const gal = plan.byId.get('gallery');
  const arts = gal.arts || [];
  ok(arts.length === 2, `视频件数 ${arts.length} ≠ 2`);
  ok(arts[0].wall === 'east' && arts[0].video === true, '东墙主位不是影像装置');
  ok((gal.audioStations || []).length === 0, '没有音频却生成了站牌');
  console.log(`  全视频：画 ${arts.length} · 站牌 0 · 长厅 ${(gal.x1 - gal.x0).toFixed(1)}m`);
}

// 什么都没有必须报错（老行为是「没有照片」，现在还多了「没有媒体」这一档）
let threw = false;
try { buildMyGalleryPlan([], { title: '空文件夹' }); } catch { threw = true; }
ok(threw, '空文件夹没有报错');

console.log(`\n${failed ? `✗ ${failed}/${checks} 项没过` : `✓ ${checks} 项全过`}`);
process.exit(failed ? 1 : 0);
