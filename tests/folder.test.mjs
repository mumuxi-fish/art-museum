import { launch, BASE, sleep, shot, fixturePhotos } from './helpers.mjs';
const b = await launch();
const URL = BASE;
const DIR = fixturePhotos();
const out = {};

const ready = (p) => p.waitForFunction(() => window.__artMuseum?.stats, null, { timeout: 60000 });
const state = (p) => p.evaluate(() => {
  const el = document.getElementById('photoBtn');
  const r = el.getBoundingClientRect();
  const gallery = window.__artMuseum.plan.rooms.find(x => x.kind === 'gallery');
  return {
    mine: window.__artMuseum.usingMyGallery(),
    rooms: window.__artMuseum.plan.rooms.length,
    arts: window.__artMuseum.artIndex.length,
    galleryName: gallery?.name,
    glyph: el.textContent,
    visible: getComputedStyle(el).display !== 'none' && r.width > 0,
    right: Math.round(innerWidth - r.right),
    progress: document.getElementById('art-progress')?.textContent,
    label: document.getElementById('galleryLabel')?.textContent,
    stats: window.__artMuseum.stats,
  };
});

const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await ready(p);
await sleep(2500);

// ---------- 导入前：默认展馆 ----------
out.导入前 = await state(p);
out.帮助行 = await p.evaluate(() =>
  [...document.querySelectorAll('#help-panel .help-list div')].map(d => d.textContent).find(t => t.includes('🖼')) || null);

// ---------- 选文件夹导入 ----------
const nav = p.waitForNavigation({ waitUntil: 'load', timeout: 180000 });
await p.setInputFiles('#photoInput', DIR);
await nav;
await ready(p);
await sleep(2500);
out.导入后 = await state(p);

// 等 6 张墙图全部流式加载完（进度条被更新过一次，最后隐藏）
let stream = 'TIMEOUT';
try {
  await p.waitForFunction(() => {
    const el = document.getElementById('art-progress');
    return el.classList.contains('hidden') && el.textContent.includes('载入画作');
  }, null, { timeout: 120000 });
  stream = 'ok';
} catch { /* TIMEOUT */ }
out.流式加载 = stream;
await sleep(1500);

await p.screenshot({ path: shot('mygallery-spawn.png') });

// 详情浮层：blob 大图要能加载出来
out.详情 = await p.evaluate(async () => {
  const art = window.__artMuseum.artIndex[0];
  window.__artMuseum.openArt(art);
  const img = document.getElementById('detail-img');
  const ok = await new Promise((res) => {
    if (img.complete && img.naturalWidth) return res(true);
    img.onload = () => res(true);
    img.onerror = () => res(false);
    setTimeout(() => res(false), 10000);
  });
  const r = {
    ok, src: img.src.slice(0, 12), title: document.getElementById('detail-title').textContent,
    artist: document.getElementById('detail-artist').textContent,
    linkHidden: document.getElementById('detail-link').classList.contains('hidden'),
  };
  document.getElementById('detail-close').click();
  return r;
});
await sleep(800);
await p.screenshot({ path: shot('mygallery-detail.png') });

// 走到长厅里拍一张（画廊视角）
await p.evaluate(() => {
  const g = window.__artMuseum.plan.rooms.find(x => x.kind === 'gallery');
  window.__artMuseum.setView(g.x0 + 6, g.cz, -Math.PI / 2, 0);
});
await sleep(3500);
await p.screenshot({ path: shot('mygallery-hall.png') });
out.厅内 = await state(p);

// ---------- 还原默认展馆 ----------
const nav2 = p.waitForNavigation({ waitUntil: 'load', timeout: 60000 });
await p.click('#photoBtn');
await nav2;
await ready(p);
await sleep(2500);
out.还原后 = await state(p);
await p.screenshot({ path: shot('mygallery-restored.png') });

out.报错 = errs;
await p.close();
await b.close();

console.log(JSON.stringify(out, null, 1));

const d = out;
const c = {
  导入前默认: d.导入前.mine === false && d.导入前.rooms === 11 && d.导入前.arts === 72,
  按钮初始: d.导入前.glyph === '🖼' && d.导入前.visible === true && d.导入前.right === 246,
  帮助有说明: !!d.帮助行 && d.帮助行.includes('本地文件夹'),
  导入生效: d.导入后.mine === true && d.导入后.rooms === 2 && d.导入后.arts === 5,
  厅名是文件夹名: d.导入后.galleryName === 'photos',
  按钮变还原: d.导入后.glyph === '↩' && d.导入后.visible === true,
  墙图加载完: d.流式加载 === 'ok',
  详情是blob: d.详情.ok === true && d.详情.src.startsWith('blob:'),
  详情文案: !!d.详情.title && !!d.详情.artist && d.详情.linkHidden === true,
  厅内标签: d.厅内.label === d.厅内.galleryName,
  厅内灯数: d.厅内.stats.总厅数 === 2 && d.厅内.stats.总灯数 < 40,
  还原生效: d.还原后.mine === false && d.还原后.rooms === 11 && d.还原后.arts === 72 && d.还原后.glyph === '🖼',
  无报错: d.报错.length === 0,
};
console.log(JSON.stringify(c, null, 1));
const bad = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
console.log(bad.length ? `FAIL: ${bad.join(', ')}` : 'ALL PASS');
process.exit(bad.length ? 1 : 0);
