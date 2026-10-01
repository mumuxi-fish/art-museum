import { launch, BASE, sleep, shot } from './helpers.mjs';
const b = await launch();
const URL = BASE;
const out = {};

const dbg = (p) => p.evaluate(() => window.__artMuseum.audio.debug());
const ui = (p) => p.evaluate(() => ({
  paused: window.__artMuseum.audio.paused,
  track: window.__artMuseum.audio.track,
  glyph: document.getElementById('playBtn')?.textContent,
  title: document.getElementById('playBtn')?.title,
  toast: document.getElementById('toast')?.textContent?.trim() || '',
  rowState: document.querySelector('#playlist-items .pl-item.active .pl-state')?.textContent,
  rowTitle: document.querySelector('#playlist-items .pl-item.active .pl-title')?.textContent,
}));

// ---------- 桌面 ----------
{
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__artMuseum?.audio, null, { timeout: 60000 });
  await sleep(2500);

  out.按钮 = await p.evaluate(() => {
    const el = document.getElementById('playBtn');
    const r = el.getBoundingClientRect();
    return { glyph: el.textContent, visible: getComputedStyle(el).display !== 'none' && r.width > 0, right: Math.round(innerWidth - r.right), x: Math.round(r.x) };
  });

  // 切到一首文件曲，等载完
  await p.click('#playlistBtn');
  await p.click('#playlist-items .pl-item:nth-child(2)');
  await p.waitForFunction(() => !window.__artMuseum.audio.trackLoading, null, { timeout: 60000 });
  await sleep(2500);
  out.播放中 = { ...(await ui(p)), dbg: await dbg(p) };

  // 空格暂停
  await p.keyboard.press('Space');
  await sleep(700);
  out.空格暂停 = { ...(await ui(p)), dbg: await dbg(p) };

  // 暂停期间进度不动
  await sleep(1500);
  out.暂停1秒后 = { ...(await ui(p)), dbg: await dbg(p) };

  // 空格继续
  await p.keyboard.press('Space');
  await sleep(1200);
  out.空格继续 = { ...(await ui(p)), dbg: await dbg(p) };

  // 生成式：切回合成氛围再暂停
  await p.click('#playlist-items .pl-item:nth-child(1)');
  await p.waitForFunction(() => !window.__artMuseum.audio.trackLoading, null, { timeout: 30000 });
  await sleep(800);
  await p.keyboard.press('Space');
  await sleep(600);
  out.生成式暂停 = { ...(await ui(p)), dbg: await dbg(p) };
  await p.keyboard.press('Space');
  await sleep(800);
  out.生成式继续 = { ...(await ui(p)), dbg: await dbg(p) };

  // 暂停中按 B：只记状态，不该把 pad 拉起来
  await p.keyboard.press('Space');            // 暂停
  await sleep(400);
  const pausedBefore = await p.evaluate(() => window.__artMuseum.audio.paused);
  await p.keyboard.press('b');                // 关音乐
  await sleep(300);
  await p.keyboard.press('b');                // 开音乐
  await sleep(600);
  out.暂停中按B = { ...(await ui(p)), pausedBefore, dbg: await dbg(p) };
  await p.keyboard.press('Space');            // 恢复
  await sleep(600);

  // 暂停中直接点列表另一首 = 要听
  await p.keyboard.press('Space');            // 暂停
  await sleep(400);
  await p.click('#playlist-items .pl-item:nth-child(3)');
  let pickOk = 'TIMEOUT';
  try {
    await p.waitForFunction(() => window.__artMuseum.audio.track === 'bathed-in-the-light' && !window.__artMuseum.audio.trackLoading, null, { timeout: 60000 });
    pickOk = 'ok';
  } catch { /* TIMEOUT */ }
  await sleep(800);
  out.暂停中点曲目 = { ...(await ui(p)), pickOk, dbg: await dbg(p) };

  // 播放列表按钮（手机端那个 glyph 同步）+ 面板状态列
  out.报错 = errs;
  await p.screenshot({ path: shot('pp-desktop.png') });
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
  await sleep(1200);
  out.手机 = await p.evaluate(() => {
    const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0; };
    const m = document.querySelector('.action-btn.play-toggle');
    return { 桌面隐藏: !vis(document.getElementById('playBtn')), 动作区数量: document.querySelectorAll('.play-toggle').length, 动作区可见: vis(m), glyph: m?.textContent, paused: window.__artMuseum.audio.paused };
  });
  await p.click('.action-btn.play-toggle');
  await sleep(700);
  out.手机暂停 = await p.evaluate(() => ({ paused: window.__artMuseum.audio.paused, glyph: document.querySelector('.action-btn.play-toggle').textContent }));
  await p.click('.action-btn.play-toggle');
  await sleep(700);
  out.手机继续 = await p.evaluate(() => ({ paused: window.__artMuseum.audio.paused, glyph: document.querySelector('.action-btn.play-toggle').textContent }));
  out.手机报错 = errs;
  await p.close();
}

await b.close();
console.log(JSON.stringify(out, null, 1));

const d = out;
const c = {
  按钮: !!d.按钮.visible && d.按钮.glyph === '⏸' && d.按钮.right === 200,
  播放中: !!d.播放中 && d.播放中.paused === false && d.播放中.glyph === '⏸' && d.播放中.dbg.filePlaying === true && d.播放中.rowState === '正在播放',
  空格暂停: d.空格暂停.paused === true && d.空格暂停.glyph === '▶' && d.空格暂停.toast.includes('已暂停') && d.空格暂停.dbg.filePlaying === false && d.空格暂停.rowState === '已暂停' && d.空格暂停.dbg.fileOffset > 0.5,
  进度冻结: Math.abs(d.暂停1秒后.dbg.fileOffset - d.空格暂停.dbg.fileOffset) < 1e-6,
  空格继续: d.空格继续.paused === false && d.空格继续.glyph === '⏸' && d.空格继续.dbg.filePlaying === true && Math.abs(d.空格继续.dbg.fileOffset - d.空格暂停.dbg.fileOffset) < 1e-6,
  生成式暂停: d.生成式暂停.paused === true && d.生成式暂停.dbg.padTimer === false,
  生成式继续: d.生成式继续.paused === false && d.生成式继续.dbg.padTimer === true,
  暂停中按B: d.暂停中按B.pausedBefore === true && d.暂停中按B.paused === true && d.暂停中按B.dbg.padTimer === false && d.暂停中按B.dbg.musicOn === true,
  暂停中点曲目: d.暂停中点曲目.pickOk === 'ok' && d.暂停中点曲目.paused === false && d.暂停中点曲目.dbg.filePlaying === true,
  无报错: d.报错.length === 0,
  手机: d.手机.桌面隐藏 === true && d.手机.动作区数量 === 2 && d.手机.动作区可见 === true && d.手机.glyph === '⏸' && d.手机.paused === false,
  手机暂停: d.手机暂停.paused === true && d.手机暂停.glyph === '▶',
  手机继续: d.手机继续.paused === false && d.手机继续.glyph === '⏸',
  手机无报错: d.手机报错.length === 0,
};
console.log(JSON.stringify(c, null, 1));
const bad = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
console.log(bad.length ? `FAIL: ${bad.join(', ')}` : 'ALL PASS');
process.exit(bad.length ? 1 : 0);
