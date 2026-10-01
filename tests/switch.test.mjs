import { launch, BASE, sleep } from './helpers.mjs';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });

const errs = [];
const failed = [];
const toasts = [];
p.on('pageerror', e => errs.push(e.message));
p.on('requestfailed', r => failed.push(r.url()));
// 把 mp3 请求拖慢 3 秒，保证「载入中」的窗口稳定存在
await p.route('**/music/*.mp3', async (route) => {
  await sleep(3000);
  await route.continue();
});
p.on('response', async () => {});

await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__artMuseum?.audio, null, { timeout: 60000 });
await sleep(2500);

// 持续收集 toast 文案
await p.exposeFunction('__pushToast', (t) => { if (t) toasts.push(t); });
await p.evaluate(() => {
  const el = document.getElementById('toast');
  const obs = new MutationObserver(() => { window.__pushToast(el.textContent); });
  obs.observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
});

const snap = () => p.evaluate(() => ({
  track: window.__artMuseum.audio.track,
  loading: window.__artMuseum.audio.trackLoading,
  toast: document.getElementById('toast').textContent?.trim() || '',
  active: document.querySelector('#playlist-items .pl-item.active .pl-title')?.textContent,
  activeState: document.querySelector('#playlist-items .pl-item.active .pl-state')?.textContent,
  panelOpen: !document.getElementById('playlist-panel').classList.contains('hidden'),
  dbg: window.__artMuseum.audio.debug(),
}));

const out = {};
await p.click('#playlistBtn');
await p.click('#playlist-items .pl-item:nth-child(2)');       // Friday Morning
await p.waitForFunction(() => window.__artMuseum.audio.trackLoading, null, { timeout: 8000 });
out.点第一首 = await snap();

// 载入中按 N —— 不该被挡住，trackIdx 同步就变
await p.keyboard.press('n');
await sleep(300);
out.载入中按N = await snap();

// 载入中再点列表里另一首 —— 同样不该被挡住
await p.click('#playlist-items .pl-item:nth-child(6)');       // Dreamer
await sleep(300);
out.载入中点第六首 = await snap();

// 等最后一次切换落地
let final = 'TIMEOUT';
try {
  await p.waitForFunction(() => window.__artMuseum.audio.track === 'dreamer' && !window.__artMuseum.audio.trackLoading, null, { timeout: 60000 });
  final = 'ok';
} catch { /* TIMEOUT */ }
await sleep(800);
out.最终 = await snap();
out.音频图 = await p.evaluate(() => {
  const d = window.__artMuseum.audio.debug();
  return { filePlaying: d.filePlaying, padTimer: d.padTimer, trackIdx: d.trackIdx, buffers: d.buffers, musicOn: d.musicOn };
});
out.最终结果 = final;
out.拦截到的toast = toasts;
out.失败请求 = failed;
out.报错 = errs;

await b.close();
console.log(JSON.stringify(out, null, 1));

const c = {
  firstLoading: !!out.点第一首.loading && out.点第一首.track === 'friday-morning' && out.点第一首.activeState === '载入中…',
  nNotBlocked: out.载入中按N.track === 'bathed-in-the-light' && !out.载入中按N.toast.includes('还在载入'),
  nToast: out.载入中按N.toast.includes('切换中'),
  pickNotBlocked: out.载入中点第六首.track === 'dreamer' && out.载入中点第六首.active === 'Dreamer' && out.载入中点第六首.activeState === '载入中…',
  settled: out.最终结果 === 'ok' && out.最终.track === 'dreamer' && !out.最终.loading && out.最终.active === 'Dreamer' && out.最终.activeState === '正在播放',
  filePlaying: out.音频图.filePlaying === true && out.音频图.padTimer === false && out.音频图.trackIdx === 5,
  noBlockedToast: !out.拦截到的toast.some(t => t.includes('还在载入')),
  noFailedReq: out.失败请求.length === 0,
  noErr: out.报错.length === 0,
};
console.log(JSON.stringify(c, null, 1));
const bad = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
console.log(bad.length ? `FAIL: ${bad.join(', ')}` : 'ALL PASS');
process.exit(bad.length ? 1 : 0);
