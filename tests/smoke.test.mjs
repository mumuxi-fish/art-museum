import { launch, BASE, sleep, verdict } from './helpers.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [], bad = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${new URL(r.url()).pathname}`); });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__artMuseum?.stats, null, { timeout: 60000 });
await sleep(8000);
const initial = await page.evaluate(() => window.__artMuseum.stats);
console.log('stats', JSON.stringify(initial));
console.log('path', JSON.stringify(await page.evaluate(() => window.__artMuseum.previewPath(47.25, 28))));
console.log('culling', await page.evaluate(() => window.__artMuseum.roomCulling));
await page.evaluate(() => window.__artMuseum.setView(18.25, 9, Math.PI));
await sleep(2500);
const dawn = await page.evaluate(() => window.__artMuseum.stats);
console.log('dawn pos stats', JSON.stringify(dawn));
console.log('errors:', errs.length ? errs : '无');
console.log('failed requests:', bad.length ? bad : '无');
const bad2 = verdict({
  无报错: errs.length === 0,
  无失败请求: bad.length === 0,
  视点在馆内: initial['可见厅'] > 0,
  主墙有画: initial['绘制调用'] > 100 && dawn['绘制调用'] > 0,
});
await browser.close();
process.exit(bad2 ? 1 : 0);
