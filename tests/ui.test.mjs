import { launch, BASE, sleep } from './helpers.mjs';
const b = await launch();
const out = {};

for (const vp of [{ width: 960, height: 540, name: 'desktop' }, { width: 480, height: 800, name: 'mobile' }]) {
  const p = await b.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__artMuseum?.audio, null, { timeout: 60000 });
  await sleep(2000);

  // 帮助面板：加了署名以后不能超出视口
  await p.click('#helpBtn');
  await sleep(400);
  const help = await p.evaluate(() => {
    const el = document.getElementById('help-panel');
    const r = el.getBoundingClientRect();
    return { fits: r.bottom <= innerHeight && r.right <= innerWidth && r.top >= 0, h: Math.round(r.height), bottom: Math.round(r.bottom), vh: innerHeight,
             credits: !!el.querySelector('.help-credits') };
  });
  await p.click('#help-close');

  // 桌面 ⏭ 可见性 / 手机 ⏭ 走动作区
  const btns = await p.evaluate(() => {
    const d = document.getElementById('nextTrackBtn');
    const m = [...document.querySelectorAll('.next-track-btn')].find(x => x !== d);
    const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0; };
    const info = (el) => el ? { display: getComputedStyle(el).display, w: Math.round(el.getBoundingClientRect().width), vis: vis(el) } : null;
    return { desktop可见: vis(d), mobile按钮存在: !!m, mobile可见: vis(m), d: info(d), m: info(m),
             cnt: document.querySelectorAll('.next-track-btn').length, url: location.pathname };
  });

  // 点手机端 ⏭ 切歌（显示出来点）
  let mobileSwitch = null;
  if (vp.name === 'mobile') {
    await p.evaluate(() => { document.getElementById('mobileControls').style.display = 'block'; });
    await p.keyboard.down('Shift'); await p.keyboard.up('Shift');
    await sleep(4000);
    const before = await p.evaluate(() => __artMuseum.audio.track);
    await p.click('.action-btn.next-track-btn');
    try {
      await p.waitForFunction((x) => window.__artMuseum.audio.track !== x, before, { timeout: 30000 });
      await p.waitForFunction(() => !window.__artMuseum.audio.trackLoading, null, { timeout: 45000 });
      mobileSwitch = await p.evaluate(() => __artMuseum.audio.track);
    } catch { mobileSwitch = 'TIMEOUT'; }
  }
  out[vp.name] = { 帮助面板: help, 按钮: btns, 手机切歌: mobileSwitch, 报错: errs };
  await p.close();
}
console.log(JSON.stringify(out, null, 1));
const o = out;
const conds = {
  d_fits: !!o.desktop.帮助面板.fits, d_credits: !!o.desktop.帮助面板.credits, d_btn: !!o.desktop.按钮.desktop可见,
  m_fits: !!o.mobile.帮助面板.fits, m_btnExists: !!o.mobile.按钮.mobile按钮存在, m_btnVis: !!o.mobile.按钮.mobile可见,
  m_desktopHidden: !o.mobile.按钮.desktop可见, m_switch: !!o.mobile.手机切歌 && o.mobile.手机切歌 !== 'TIMEOUT',
  d_noerr: !o.desktop.报错.length, m_noerr: !o.mobile.报错.length,
};
console.log(JSON.stringify(conds, null, 1));
const pass = Object.values(conds).every(Boolean);
console.log(pass ? 'PASS' : 'FAIL: ' + Object.entries(conds).filter(([, v]) => !v).map(([k]) => k).join(','));
await b.close();
process.exit(pass ? 0 : 1);
