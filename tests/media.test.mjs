import { launch, BASE, sleep, shot, fixtureMedia } from './helpers.mjs';
// 影像装置 + 听音点的端到端验证：
//   选一个「2 张图 + 1 段视频 + 1 段音频」的文件夹 → 视频在墙上播、
//   听音点按 E 能播/停、详情浮层里是原始视频、超 300MB 的文件被跳过。
//   最后 ↩ 还原默认展馆。

const b = await launch();
const URL = BASE;
const DIR = fixtureMedia();
const out = {};

const ready = (p) => p.waitForFunction(() => window.__artMuseum?.stats, null, { timeout: 60000 });

const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await ready(p);
await sleep(2500);

// 一次用户手势：后面所有 play()（详情视频、听音点）都算在它头上
await p.click('#helpBtn');
await p.click('#help-close');

out.前置 = await p.evaluate(() => ({
  mine: window.__artMuseum.usingMyGallery(),
  rooms: window.__artMuseum.plan.rooms.length,
  arts: window.__artMuseum.artIndex.length,
}));

// ---- 超限文件：301MB 的文件必须被跳过（size 伪造，不会真去解码） ----
out.超限 = await p.evaluate(async () => {
  const huge = new File([new Uint8Array(16)], 'too-big.jpg', { type: 'image/jpeg' });
  Object.defineProperty(huge, 'size', { value: 301 * 1024 * 1024 });
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const good = new File([blob], 'fine.png', { type: 'image/png' });
  try {
    const r = await window.__artMuseum.importFiles([huge, good]);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, err: String(e?.message || e) };
  }
});

// ---- 选文件夹导入 ----
const nav = p.waitForNavigation({ waitUntil: 'load', timeout: 180000 });
await p.setInputFiles('#photoInput', DIR);
await nav;
await ready(p);
await sleep(3500);

out.导入后 = await p.evaluate(() => {
  const g = window.__artMuseum.plan.rooms.find((x) => x.kind === 'gallery');
  return {
    mine: window.__artMuseum.usingMyGallery(),
    rooms: window.__artMuseum.plan.rooms.length,
    arts: window.__artMuseum.artIndex.length,
    videoArts: window.__artMuseum.artIndex.filter((a) => a.video).length,
    stations: (g?.audioStations || []).length,
    stationKeys: (g?.audioStations || []).map((s) => s.key),
    name: g?.name,
    label: document.getElementById('galleryLabel')?.textContent,
    glyph: document.getElementById('photoBtn').textContent,
  };
});

// 走进长厅：门口的房间标签应该显示文件夹名
await p.evaluate(() => {
  const g = window.__artMuseum.plan.rooms.find((x) => x.kind === 'gallery');
  window.__artMuseum.setView(g.x0 + 3, g.cz, -Math.PI / 2, 0);
});
await sleep(700);
out.厅内标签 = (await p.textContent('#galleryLabel')) || '';

// ---- 影像装置在墙上真的在播（隔 1.2s currentTime 要往前走） ----
await p.waitForFunction(
  () => window.__artMuseum.media.videos().some((v) => v.swapped && !v.paused && v.readyState >= 2),
  null, { timeout: 25000 },
).catch(() => {});
out.影像A = await p.evaluate(() => window.__artMuseum.media.videos());
await sleep(1300);
out.影像B = await p.evaluate(() => window.__artMuseum.media.videos());
await p.screenshot({ path: shot('media-wall.png') });

// ---- 详情浮层：原始视频 + 带声播放，关掉要干净 ----
out.详情 = await p.evaluate(async () => {
  const art = window.__artMuseum.artIndex.find((a) => a.video);
  if (!art) return { err: '没有影像件' };
  window.__artMuseum.openArt(art);
  const v = document.getElementById('detail-video');
  const img = document.getElementById('detail-img');
  await new Promise((r) => setTimeout(r, 900));
  const opened = {
    videoShown: !v.classList.contains('hidden'),
    imgHidden: img.classList.contains('hidden'),
    src: (v.getAttribute('src') || '').slice(0, 5),
    paused: v.paused,
    title: document.getElementById('detail-title').textContent,
    technique: document.getElementById('detail-technique').textContent,
    dimensions: document.getElementById('detail-dimensions').textContent,
    desc: document.getElementById('detail-desc').textContent,
  };
  document.getElementById('detail-close').click();
  await new Promise((r) => setTimeout(r, 350));
  return {
    ...opened,
    closedSrc: v.getAttribute('src'),
    closedPaused: v.paused,
    closedHidden: v.classList.contains('hidden'),
  };
});

// ---- 听音点：站到牌子跟前按 E ----
out.站牌 = await p.evaluate(() => {
  const g = window.__artMuseum.plan.rooms.find((x) => x.kind === 'gallery');
  const s = (g?.audioStations || [])[0];
  if (!s) return null;
  // 站在牌子南边 2.1m、抬头朝北偏下一点，让视线正中落在牌面上
  window.__artMuseum.setView(s.position.x, s.position.z + 2.1, 0, -0.2);
  return { x: s.position.x, y: s.position.y, z: s.position.z, key: s.key, title: s.title, wall: s.wall };
});
// 等视线真的落到牌面上（拾取每帧算一次，给它几帧；慢机器上多等一会）
let aim = null;
for (let i = 0; i < 60 && (!aim || aim.kind !== 'audio'); i++) {
  await sleep(300);
  aim = await p.evaluate(() => window.__artMuseum.aim());
}
out.瞄准 = aim;
out.提示前 = (await p.textContent('#prompt')) || '';
await p.keyboard.press('KeyE');
// play() 的 promise 在 SwiftShader 下要 ~1s 才解析，提示条那时才换字：轮询等它
await p.waitForFunction(
  () => (document.getElementById('prompt')?.textContent || '').includes('暂停'),
  null, { timeout: 6000 },
).catch(() => {});
out.按下E = await p.evaluate(() => ({
  listen: window.__artMuseum.media.listen(),
  toast: document.getElementById('toast')?.textContent || '',
  prompt: document.getElementById('prompt')?.textContent || '',
}));
await p.screenshot({ path: shot('media-listen.png') });
await p.keyboard.press('KeyE');
await sleep(600);
out.再按E = await p.evaluate(() => window.__artMuseum.media.listen());

// ---- 还原默认展馆 ----
// 瞄偏时 E 会开画作浮层，它盖在按钮上：记下来、关掉，再点还原（让断言报原因而不是超时）
out.还原前浮层 = await p.evaluate(() => {
  const el = document.getElementById('art-detail');
  const open = !el.classList.contains('hidden');
  if (open) document.getElementById('detail-close').click();
  return open ? document.getElementById('detail-title')?.textContent : null;
});
await sleep(400);
const nav2 = p.waitForNavigation({ waitUntil: 'load', timeout: 60000 });
await p.click('#photoBtn');
await nav2;
await ready(p);
await sleep(2500);
out.还原 = await p.evaluate(() => ({
  mine: window.__artMuseum.usingMyGallery(),
  rooms: window.__artMuseum.plan.rooms.length,
  arts: window.__artMuseum.artIndex.length,
  glyph: document.getElementById('photoBtn').textContent,
  listen: window.__artMuseum.media.listen(),
  videos: window.__artMuseum.media.videos().length,
}));

out.报错 = errs;
const fs = await import('node:fs');
fs.writeFileSync(shot('media-check.json'), JSON.stringify(out, null, 1));
await p.close();
await b.close();

console.log(JSON.stringify(out, null, 1));

const d = out;
const c = {
  导入前是默认馆: d.前置.mine === false && d.前置.rooms === 11 && d.前置.arts === 72,
  超限被跳过: d.超限.ok === true && d.超限.oversize === 1 && d.超限.skipped === 1 && d.超限.images === 1,
  导入生效: d.导入后.mine === true && d.导入后.rooms === 2 && d.导入后.arts === 3,
  厅名是文件夹名: d.导入后.name === 'media-gallery' && d.厅内标签 === 'media-gallery',
  影像件识别: d.导入后.videoArts === 1,
  听音点立起来了: d.导入后.stations === 1 && d.导入后.stationKeys[0] === 'au1',
  按钮变还原: d.导入后.glyph === '↩',
  影像在播: d.影像A.length === 1 && d.影像A[0].dead === false && d.影像A[0].paused === false
    && d.影像A[0].readyState >= 2 && d.影像A[0].swapped === true,
  影像时间在走: d.影像B[0].time !== d.影像A[0].time,
  详情换成视频: d.详情.videoShown === true && d.详情.imgHidden === true && d.详情.src === 'blob:',
  详情视频在播: d.详情.paused === false,
  详情文案: d.详情.title === '03-clip' && d.详情.technique === '影像装置'
    && /^\d+×\d+$/.test(d.详情.dimensions || '') && (d.详情.desc || '').includes('循环播放'),
  详情关干净: d.详情.closedSrc === null && d.详情.closedPaused === true && d.详情.closedHidden === true,
  眼睛落在牌上: d.瞄准?.kind === 'audio' && d.瞄准?.key === 'au1',
  瞄准提示: d.提示前.includes('E') && d.提示前.includes('播放'),
  'E 播放了': d.按下E.listen.playing === true && d.按下E.listen.key === 'au1',
  提示换成暂停: d.按下E.prompt.includes('暂停'),
  'Toast 报了曲名': d.按下E.toast.includes('04-note'),
  '再按 E 停了': d.再按E.playing === false,
  没误开画作浮层: d.还原前浮层 === null,
  还原生效: d.还原.mine === false && d.还原.rooms === 11 && d.还原.arts === 72
    && d.还原.glyph === '🖼' && d.还原.listen.playing === false && d.还原.videos === 0,
  无报错: d.报错.length === 0,
};
console.log(JSON.stringify(c, null, 1));
const bad = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
console.log(bad.length ? `FAIL: ${bad.join(', ')}` : 'ALL PASS');
process.exit(bad.length ? 1 : 0);
