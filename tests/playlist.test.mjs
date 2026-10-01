import { launch, BASE, sleep, shot } from './helpers.mjs';
const b = await launch();
const URL = BASE;
const out = {};

// ---------- 桌面 ----------
{
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__artMuseum?.audio, null, { timeout: 60000 });
  await sleep(3000);

  const btn = await p.evaluate(() => {
    const el = document.getElementById('playlistBtn');
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { visible: cs.display !== 'none' && r.width > 0, x: Math.round(r.x), right: Math.round(innerWidth - r.right) };
  });

  await p.click('#playlistBtn');
  await sleep(400);
  const opened = await p.evaluate(() => {
    const el = document.getElementById('playlist-panel');
    const r = el.getBoundingClientRect();
    return {
      visible: !el.classList.contains('hidden'),
      rows: el.querySelectorAll('.pl-item').length,
      active: el.querySelector('.pl-item.active .pl-title')?.textContent,
      state: el.querySelector('.pl-item.active .pl-state')?.textContent,
      fits: r.bottom <= innerHeight && r.right <= innerWidth,
      credit: !!el.querySelector('.pl-foot a[href*="creativecommons"]'),
      btnActive: document.getElementById('playlistBtn').classList.contains('active'),
      titles: [...el.querySelectorAll('.pl-title')].map(t => t.textContent),
    };
  });
  await p.screenshot({ path: shot('pl-panel.png') });

  // 点第 4 首（daybreak）
  await p.click('#playlist-items .pl-item:nth-child(4)');
  let switched = 'TIMEOUT';
  try {
    await p.waitForFunction(() => window.__artMuseum.audio.track === 'daybreak', null, { timeout: 45000 });
    await p.waitForFunction(() => !window.__artMuseum.audio.trackLoading, null, { timeout: 45000 });
    switched = await p.evaluate(() => window.__artMuseum.audio.track);
  } catch { /* 保持 TIMEOUT */ }
  await sleep(400);
  const after = await p.evaluate(() => ({
    track: window.__artMuseum.audio.track,
    active: document.querySelector('#playlist-items .pl-item.active .pl-title')?.textContent,
    state: document.querySelector('#playlist-items .pl-item.active .pl-state')?.textContent,
    loading: window.__artMuseum.audio.trackLoading,
    panelOpen: !document.getElementById('playlist-panel').classList.contains('hidden'),
  }));

  // 重复点当前曲
  await p.click('#playlist-items .pl-item.active');
  await sleep(400);
  const dupToast = await p.evaluate(() => document.getElementById('toast')?.textContent?.trim() || '');

  // ESC 关面板
  await p.keyboard.press('Escape');
  await sleep(300);
  const escClosed = await p.evaluate(() => document.getElementById('playlist-panel').classList.contains('hidden'));

  // 一次只开一个浮层：开列表 → 再开帮助
  await p.click('#playlistBtn');
  await sleep(250);
  await p.click('#helpBtn');
  await sleep(350);
  const onePanel = await p.evaluate(() => ({
    playlist: !document.getElementById('playlist-panel').classList.contains('hidden'),
    help: !document.getElementById('help-panel').classList.contains('hidden'),
    esc1: null,
  }));
  await p.keyboard.press('Escape');
  await sleep(250);
  onePanel.escClosesHelp = await p.evaluate(() => document.getElementById('help-panel').classList.contains('hidden'));

  // N 键仍然好使（列表关着）
  const beforeN = await p.evaluate(() => window.__artMuseum.audio.track);
  await p.keyboard.press('n');
  await sleep(500);
  const afterN = await p.evaluate(() => window.__artMuseum.audio.track);

  out.desktop = { 按钮: btn, 打开: opened, 切歌: switched, 切后: after, 重复提示: dupToast, ESC关闭: escClosed, 单浮层: onePanel, N键: { from: beforeN, to: afterN }, 报错: errs };
  await p.close();
}

// ---------- 手机 ----------
{
  const p = await b.newPage({ viewport: { width: 480, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__artMuseum?.audio, null, { timeout: 60000 });
  await sleep(2500);
  await p.evaluate(() => { document.getElementById('mobileControls').style.display = 'block'; });
  await p.keyboard.down('Shift'); await p.keyboard.up('Shift');
  await sleep(1500);

  const btns = await p.evaluate(() => {
    const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0; };
    return {
      桌面隐藏: !vis(document.getElementById('playlistBtn')),
      动作区数量: document.querySelectorAll('.action-btn.playlist-toggle').length,
      动作区可见: vis(document.querySelector('.action-btn.playlist-toggle')),
    };
  });
  await p.click('.action-btn.playlist-toggle');
  await sleep(400);
  const opened = await p.evaluate(() => {
    const el = document.getElementById('playlist-panel');
    const r = el.getBoundingClientRect();
    return { visible: !el.classList.contains('hidden'), rows: el.querySelectorAll('.pl-item').length, fits: r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
  });
  await p.click('#playlist-close');
  await sleep(250);
  const closed = await p.evaluate(() => document.getElementById('playlist-panel').classList.contains('hidden'));
  out.mobile = { 按钮: btns, 打开: opened, 关闭: closed, 报错: errs };
  await p.close();
}

await b.close();
console.log(JSON.stringify(out, null, 1));

const o = out;
const c = {
  d_btn: !!o.desktop.按钮.visible,
  d_open: !!o.desktop.打开.visible && o.desktop.打开.rows === 6 && o.desktop.打开.fits && o.desktop.打开.credit && o.desktop.打开.btnActive,
  d_active_is_first: o.desktop.打开.active === '合成氛围',
  d_switch: o.desktop.切歌 === 'daybreak' && o.desktop.切后.track === 'daybreak' && o.desktop.切后.active === 'Daybreak' && o.desktop.切后.state === '正在播放' && !o.desktop.切后.loading && o.desktop.切后.panelOpen,
  d_dup: o.desktop.重复提示.includes('已经在播'),
  d_esc: o.desktop.ESC关闭,
  d_one: !o.desktop.单浮层.playlist && o.desktop.单浮层.help && o.desktop.单浮层.escClosesHelp,
  d_n: o.desktop.N键.from !== o.desktop.N键.to,
  d_noerr: !o.desktop.报错.length,
  m_hide_desktop: !!o.mobile.按钮.桌面隐藏,
  m_btn: o.mobile.按钮.动作区数量 === 1 && o.mobile.按钮.动作区可见,
  m_open: !!o.mobile.打开.visible && o.mobile.打开.rows === 6 && o.mobile.打开.fits,
  m_close: !!o.mobile.关闭,
  m_noerr: !o.mobile.报错.length,
};
console.log(JSON.stringify(c, null, 1));
const bad = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
console.log(bad.length ? `FAIL: ${bad.join(', ')}` : 'ALL PASS');
process.exit(bad.length ? 1 : 0);
