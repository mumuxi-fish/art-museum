import { launch, BASE, sleep, shot, fixturePhotos } from './helpers.mjs';
// 详情浮层的画家小像：真头像 / 剪影 / 自建展厅（无 portrait 字段）三种情况
const b = await launch();
const URL = BASE;
const ready = (p) => p.waitForFunction(() => window.__artMuseum?.stats, null, {timeout: 90000});
const p = await b.newPage({viewport:{width:1280,height:720}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const reqs=[]; p.on('response',r=>{ if(r.url().includes('/portraits/')) reqs.push(r.status()+' '+r.url().split('/').pop()); });
await p.goto(URL,{waitUntil:'domcontentloaded'}); await ready(p); await sleep(3000);
await p.click('#helpBtn'); await p.click('#help-close');

const open = async (pred) => p.evaluate((src)=>{
  const art = window.__artMuseum.artIndex.find(eval(src));
  if(!art) return {err:'没找到画'};
  window.__artMuseum.openArt(art);
  return {title:art.title, artist:art.artist, portrait:art.portrait};
}, pred);
const read = async () => p.evaluate(()=>{
  const im=document.getElementById('detail-portrait');
  return {hidden:im.classList.contains('hidden'), src:(im.getAttribute('src')||'').slice(0,60),
          w:im.naturalWidth, h:im.naturalHeight, alt:im.alt,
          title:document.getElementById('detail-title').textContent,
          artist:document.getElementById('detail-artist').textContent};
});
const out={};

out.真头像 = await open('a => a.portrait && a.portrait !== "silhouette"');
await sleep(900);
out.真头像读 = await read();
await p.screenshot({path:shot('detail-portrait-real.png')});
await p.evaluate(()=>document.getElementById('detail-close').click());
await sleep(300);

out.剪影 = await open('a => a.portrait === "silhouette"');
await sleep(900);
out.剪影读 = await read();
await p.screenshot({path:shot('detail-portrait-sil.png')});
await p.evaluate(()=>document.getElementById('detail-close').click());
await sleep(300);

// 真头像 404 兜底：把 src 换成不存在的文件，看 onerror 是否回落剪影
out.兜底 = await p.evaluate(async ()=>{
  const im=document.getElementById('detail-portrait');
  const art=window.__artMuseum.artIndex.find(a=>a.portrait && a.portrait!=='silhouette');
  window.__artMuseum.openArt(art);
  await new Promise(r=>setTimeout(r,600));
  const before=im.src;
  im.src='/art-museum/art/portraits/__nope__.webp';
  await new Promise(r=>setTimeout(r,900));
  return {before:before.slice(-40), after:(im.src||'').slice(0,30), w:im.naturalWidth};
});
await p.evaluate(()=>document.getElementById('detail-close').click());

// 自建展厅：没有 portrait 字段 → 应藏掉
const nav=p.waitForNavigation({waitUntil:'load',timeout:180000});
await p.setInputFiles('#photoInput', fixturePhotos()); await nav; await ready(p); await sleep(3500);
out.自建 = await p.evaluate(()=>{
  const art=window.__artMuseum.artIndex[0];
  window.__artMuseum.openArt(art);
  const im=document.getElementById('detail-portrait');
  return {portrait:art.portrait, hidden:im.classList.contains('hidden'), src:(im.getAttribute('src')||'').length};
});
out.真头像请求 = reqs;
out.pageerror = errs;
console.log(JSON.stringify(out,null,1));
const ok = out.真头像读.hidden===false && out.真头像读.w>0
  && out.剪影读.hidden===false && out.剪影读.w>0 && out.剪影读.src.startsWith('data:')
  && out.兜底.after.startsWith('data:') && out.兜底.w>0
  && out.自建.hidden===true && out.自建.src===0 && errs.length===0;
console.log(ok?'PASS':'FAIL');
await b.close();
process.exit(ok?0:1);
