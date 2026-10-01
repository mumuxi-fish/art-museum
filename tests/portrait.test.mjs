import { launch, BASE, shot, verdict } from './helpers.mjs';
// 名牌旁边的画家小像：真头像 / 剪影兜底 各截一张，顺带盯请求有没有 404。

const shots = [
  { id: 'dawn-art-07', x: 14.57, z: 5.85, yaw: Math.PI / 2, pitch: -0.17 },
  { id: 'dawn-art-01', x: 14.817, z: 4.07, yaw: 0, pitch: -0.17 },
  { id: 'sun-art-08', x: 31.07, z: 11.715, yaw: Math.PI / 2, pitch: -0.1 },
];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const portraitReqs = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => {
  if (r.url().includes('/art/portraits/')) portraitReqs.push(`${r.status()} ${r.url().split('/').pop()}`);
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__artMuseum?.stats, null, { timeout: 60000 });
await page.waitForTimeout(3000);

const summary = await page.evaluate(() => {
  const m = window.__artMuseum;
  const arts = (m.artIndex || []).filter((a) => a.portrait)
    .map((a) => ({ id: a.id, portrait: a.portrait }));
  return { stats: m.stats, arts };
});
console.log('museum 里带 portrait 的画:', summary.arts.length,
  '真头像:', summary.arts.filter((a) => a.portrait.startsWith('portraits/')).length);

for (const s of shots) {
  await page.evaluate(([x, z, yaw, pitch]) => window.__artMuseum.setView(x, z, yaw, pitch),
    [s.x, s.z, s.yaw, s.pitch]);
  await page.waitForTimeout(4200);
  await page.screenshot({ path: shot(`portrait-${s.id}.png`) });
}

await page.waitForTimeout(1500);
console.log('portrait 请求:', portraitReqs.length ? portraitReqs : '(无)');
console.log('pageerror:', errors.length ? errors : '(无)');

const bad = verdict({
  七十二幅带小像: summary.arts.length === 72,
  真头像二十六: summary.arts.filter((a) => a.portrait.startsWith('portraits/')).length === 26,
  真头像都200: portraitReqs.length > 0 && portraitReqs.every((r) => r.startsWith('200 ')),
  无报错: errors.length === 0,
});
await browser.close();
process.exit(bad ? 1 : 0);
