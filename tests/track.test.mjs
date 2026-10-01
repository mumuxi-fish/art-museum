import { launch, BASE, sleep } from './helpers.mjs';
const ORDER = (process.env.ORDER || 'friday-morning,bathed-in-the-light,daybreak,gymnopedie-no-1,dreamer,generative').split(',');
const TARGET = process.env.TARGET || 'friday-morning';
const CLICK_TARGET = process.env.CLICK_TARGET || 'bathed-in-the-light';

const b = await launch();
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [], bad = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });

await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__artMuseum?.audio, null, { timeout: 60000 });
await sleep(3000);

const rms = () => p.evaluate(() => window.__artMuseum.audio.rms());
const info = () => p.evaluate(() => ({ t: window.__artMuseum.audio.track, title: window.__artMuseum.audio.trackTitle, load: window.__artMuseum.audio.trackLoading, on: window.__artMuseum.audio.musicOn }));
const toast = () => p.evaluate(() => document.getElementById('toast')?.textContent ?? '');
const avg = async (ms, n = 4) => { const v = []; for (let i = 0; i < n; i++) { v.push(await rms()); await sleep(ms / n); } return v.reduce((a, c) => a + c, 0) / v.length; };
const waitTrack = (id) => p.waitForFunction((x) => { const a = window.__artMuseum.audio; return a.track === x && !a.trackLoading; }, id, { timeout: 45000 });

await p.keyboard.down('Shift'); await p.keyboard.up('Shift');
await sleep(6000);

const steps = [];
const rmsList = [];
for (const id of ORDER) {
  if ((await info()).t !== id) { await p.keyboard.press('KeyN'); await waitTrack(id); }
  await sleep(3500);
  const s = await info();
  const r = await avg(1600);
  steps.push({ 期望: id, 实际: s.t, rms: +r.toFixed(5), toast: (await toast()).slice(0, 26) });
  rmsList.push(r);
}

// B 开关（当前是生成式）
await p.keyboard.press('KeyB'); await sleep(2500);
const genOff = await avg(1600);
await p.keyboard.press('KeyB'); await sleep(4000);
const genOn = await avg(1600);

// 切到文件曲，B 也必须能关掉它
for (let i = 0; i < 7 && (await info()).t !== TARGET; i++) { await p.keyboard.press('KeyN'); await p.waitForFunction(() => !window.__artMuseum.audio.trackLoading, null, { timeout: 45000 }); }
await waitTrack(TARGET);
await sleep(3000);
const fileOn = await avg(1600);
await p.keyboard.press('KeyB'); await sleep(2500);
const fileOff = await avg(1600);
await p.keyboard.press('KeyB'); await sleep(3500);
const fileOn2 = await avg(1600);

// 桌面 ⏭ 按钮
for (let i = 0; i < 7 && (await info()).t !== TARGET; i++) { await p.keyboard.press('KeyN'); await p.waitForFunction(() => !window.__artMuseum.audio.trackLoading, null, { timeout: 45000 }); }
await waitTrack(TARGET);
await p.click('#nextTrackBtn');
await waitTrack(CLICK_TARGET);
await sleep(2500);
const btnTrack = (await info()).t;

// 帮助面板：N 键 + 署名
const help = await p.evaluate(() => {
  document.getElementById('helpBtn')?.click();
  const el = document.getElementById('help-panel');
  const txt = el?.innerText ?? '';
  return { N: txt.includes('切换下一首'), ccby: txt.includes('CC BY 4.0'), km: txt.includes('Kevin MacLeod'), visible: !el.classList.contains('hidden') };
});

const out = { 步骤: steps, 生成式B关: +genOff.toFixed(5), 生成式B开: +genOn.toFixed(5), 文件曲开: +fileOn.toFixed(5), 文件曲关: +fileOff.toFixed(5), 文件曲再开: +fileOn2.toFixed(5), 按钮切到: btnTrack, 帮助面板: help, 报错: errs, 失败请求: bad };
console.log(JSON.stringify(out, null, 1));

const pass = steps.every(s => s.实际 === s.期望)
  && rmsList.every(r => r > 0.003)
  && genOff < genOn * 0.6 && fileOff < fileOn * 0.6 && fileOn2 > fileOff
  && btnTrack === CLICK_TARGET
  && help.N && help.ccby && help.km && help.visible
  && errs.length === 0 && bad.length === 0;
console.log(pass ? 'PASS' : 'FAIL');
await b.close();
process.exit(pass ? 0 : 1);
