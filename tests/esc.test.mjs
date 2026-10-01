import { launch, BASE, sleep } from './helpers.mjs';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const out = {};
process.on('unhandledRejection', (e) => {
  console.log('PARTIAL', JSON.stringify(out, null, 1));
  console.log('ERROR', e?.message);
  process.exit(1);
});

await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__artMuseum?.audio, null, { timeout: 60000 });
await sleep(3000);

// 1) 展厅列表彻底移除
out.移除 = await p.evaluate(() => ({
  按钮: !document.getElementById('galleryMenuBtn'),
  面板: !document.getElementById('gallery-menu'),
  残留: document.querySelectorAll('[class*="gallery-card"], [id*="gallery-menu"], [class*="gallery-menu"]').length,
}));

// 2) 右上角按钮组：都在、不重叠、不越界
out.按钮组 = await p.evaluate(() => {
  const ids = ['bodyToggle', 'helpBtn', 'nextTrackBtn'];
  const items = ids.map((id) => {
    const el = document.getElementById(id);
    if (!el) return { id, missing: true };
    const r = el.getBoundingClientRect();
    return { id, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             vis: getComputedStyle(el).display !== 'none' && r.width > 0, z: +getComputedStyle(el).zIndex };
  });
  const overlap = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], c = items[j];
      if (a.missing || c.missing) continue;
      const hit = !(a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y);
      if (hit) overlap.push(`${a.id}×${c.id}`);
    }
  }
  return { items, overlap, 越界: items.filter((it) => !it.missing && (it.x < 0 || it.x + it.w > innerWidth || it.y < 0)).map((it) => it.id) };
});

// 3) 点画面进沉浸 → ESC 释放 → 之后 UI 能点
await p.mouse.click(860, 420);
await sleep(900);
out.锁定 = await p.evaluate(() => !!document.pointerLockElement);
await p.keyboard.press('Escape');
await sleep(700);
out.esc用了兜底 = false;
// headless 里 ESC 有时不放指针（浏览器自己的行为，不是应用的）→ 用 API 兜底
if (await p.evaluate(() => !!document.pointerLockElement)) {
  out.esc用了兜底 = true;
  await p.evaluate(() => document.exitPointerLock());
  await sleep(500);
}
out.esc = await p.evaluate(() => ({
  locked: !!document.pointerLockElement,
  galleryMenu: !!document.getElementById('gallery-menu') || !!document.getElementById('galleryMenuBtn'),
  任意浮层: [...document.querySelectorAll('.gallery-menu, .help-panel, #art-detail')]
    .filter((el) => !el.classList.contains('hidden')).map((el) => el.id || el.className),
}));
await p.click('#helpBtn');
await sleep(400);
out.解锁后可点 = await p.evaluate(() => !document.getElementById('help-panel').classList.contains('hidden'));
await p.click('#help-close');
await sleep(300);

// 4) 自由鼠标点画 → 打开详情（不锁指针）
await p.evaluate(() => {
  const m = window.__artMuseum;
  const art = m.plan.rooms.flatMap((r) => r.arts || []).find((a) => a.image && a.position);
  const th = art.rotation?.y ?? 0;
  const nx = Math.sin(th), nz = Math.cos(th);       // 画正面法线（朝房间内）
  const cam = m.camera;
  cam.position.set(art.position.x + nx * 2.2, cam.position.y, art.position.z + nz * 2.2);
  cam.rotation.order = 'YXZ';
  cam.rotation.set(0, Math.atan2(nx, nz), 0);       // 正对这幅画
  window.__pickedArt = art;
});
await sleep(900);
await p.mouse.click(640, 360);
await sleep(900);
out.点画 = await p.evaluate(() => {
  const el = document.getElementById('art-detail');
  return { open: !el.classList.contains('hidden'),
           title: document.getElementById('detail-title')?.textContent,
           期望: window.__pickedArt?.title,
           locked: !!document.pointerLockElement };
});

// 5) 关详情：自由鼠标点开的，不该把指针抢回去
await p.click('#detail-close');
await sleep(600);
out.关详情 = await p.evaluate(() => ({
  open: !document.getElementById('art-detail').classList.contains('hidden'),
  locked: !!document.pointerLockElement,
}));

// 6) 点空处（天花板）→ 进入沉浸 / 至少进了拖动兜底
await p.evaluate(() => { const cam = window.__artMuseum.camera; cam.rotation.set(1.1, cam.rotation.y, 0); });
await sleep(700);
await p.mouse.click(640, 360);
await sleep(900);
out.点空处 = await p.evaluate(() => ({
  locked: !!document.pointerLockElement,
  dragLook: document.body.classList.contains('drag-look'),
}));

out.报错 = errs;
console.log(JSON.stringify(out, null, 1));

const c = {
  列表已移除: out.移除.按钮 && out.移除.面板 && out.移除.残留 === 0,
  按钮齐全: out.按钮组.items.every((it) => !it.missing && it.vis),
  按钮不重叠: out.按钮组.overlap.length === 0 && out.按钮组.越界.length === 0,
  ESC后无浮层: !out.esc.galleryMenu && out.esc.任意浮层.length === 0,
  ESC后指针释放: out.锁定 ? out.esc.locked === false : true,
  解锁后可点: out.解锁后可点 === true,
  点画开详情: out.点画.open === true && out.点画.title === out.点画.期望,
  点画不锁指针: out.点画.locked === false,
  关详情不抢指针: out.关详情.open === false && out.关详情.locked === false,
  点空处进沉浸: out.点空处.locked || out.点空处.dragLook,
  无报错: errs.length === 0,
};
console.log(JSON.stringify(c, null, 1));
const pass = Object.values(c).every(Boolean);
console.log(pass ? 'PASS' : 'FAIL: ' + Object.entries(c).filter(([, v]) => !v).map(([k]) => k).join(','));
await b.close();
process.exit(pass ? 0 : 1);
