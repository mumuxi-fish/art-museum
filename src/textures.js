// 纹理生成与画作纹理加载
import * as THREE from 'three';
import { renderer, textureLoader } from './scene.js';

export const paintingTextureCache = new Map();

// 确定性伪随机(mulberry32) —— 同一 seed 永远得到同一串数
// 用它取代 Math.random(),否则同一幅画每次刷新都会长得不一样
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 把任意字符串散列成 32 位种子(FNV-1a)
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rngFrom(...parts) {
  return mulberry32(hashSeed(parts.join('|')));
}

// 地板纹理(checker / stripes / wood / solid)
export function makeFloorTexture(darkHex, lightHex, roomHalf, type = 'checker') {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const dark = new THREE.Color(darkHex);
  const light = new THREE.Color(lightHex);
  const rnd = rngFrom('floor', darkHex, lightHex, type);

  if (type === 'solid') {
    ctx.fillStyle = `#${dark.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
  } else if (type === 'stripes') {
    const stripeH = size / 16;
    for (let y = 0; y < 16; y++) {
      ctx.fillStyle = (y % 2 === 0) ? `#${dark.getHexString()}` : `#${light.getHexString()}`;
      ctx.fillRect(0, y * stripeH, size, stripeH);
    }
  } else if (type === 'wood') {
    const plankW = size / 5;
    ctx.fillStyle = `#${dark.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5; i++) {
      const baseX = i * plankW;
      const shade = new THREE.Color(darkHex).lerp(new THREE.Color(lightHex), 0.15 + rnd() * 0.35);
      ctx.fillStyle = `#${shade.getHexString()}`;
      ctx.fillRect(baseX + 1, 0, plankW - 2, size);
      for (let y = 0; y < size; y += 12 + rnd() * 20) {
        ctx.strokeStyle = `rgba(0,0,0,${0.03 + rnd() * 0.06})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(baseX + 2, y);
        for (let x = baseX + 2; x < baseX + plankW - 2; x += 4) {
          ctx.lineTo(x, y + (rnd() - 0.5) * 4);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(baseX, 0, 2, size);
    }
  } else {
    const cell = size / 10;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? `#${dark.getHexString()}` : `#${light.getHexString()}`;
        ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(roomHalf / 2.5, roomHalf / 2.5);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// 程序化画作纹理(无图片时的兜底:分层渐变 + 光晕 + 笔触)
// 全程使用确定性随机,同一个 seed 渲染结果完全一致
export function makeFallbackTexture(hue = 0.5, seed = 'untitled') {
  const w = 256, h = 320;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const rnd = rngFrom('art', hue, seed);

  const grd = ctx.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, `hsl(${(hue * 360) | 0}, 60%, 46%)`);
  grd.addColorStop(0.45, `hsl(${(hue * 360 + 40) | 0}, 45%, 58%)`);
  grd.addColorStop(1, `hsl(${(hue * 360 + 120) | 0}, 32%, 40%)`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  const glowX = w * (0.25 + rnd() * 0.5);
  const glowY = h * (0.2 + rnd() * 0.4);
  const glow = ctx.createRadialGradient(glowX, glowY, 4, glowX, glowY, w * 0.55);
  glow.addColorStop(0, `hsla(${(hue * 360 + 60) | 0}, 80%, 75%, 0.5)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `hsla(${(hue * 360 + rnd() * 120) | 0}, ${50 + rnd() * 40}%, ${50 + rnd() * 40}%, ${0.12 + rnd() * 0.3})`;
    ctx.lineWidth = 2 + rnd() * 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const sx = rnd() * w;
    const sy = rnd() * h;
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(
      sx + (rnd() - 0.5) * w * 0.5,
      sy + (rnd() - 0.5) * h * 0.5,
      rnd() * w,
      rnd() * h,
    );
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, w - 12, h - 12);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 兜底纹理也走缓存:避免切展厅时重复生成 canvas,也避免显存泄漏
export function getFallbackTexture(hue, seed) {
  const key = `__fallback__${hue}|${seed}`;
  if (paintingTextureCache.has(key)) return paintingTextureCache.get(key);
  const tex = makeFallbackTexture(hue, seed);
  paintingTextureCache.set(key, tex);
  return tex;
}

// 加载画作图片;失败或未提供时用程序化纹理
export function loadPaintingTexture(imagePath, hue = 0.5, seed = 'untitled') {
  if (!imagePath) return Promise.resolve(getFallbackTexture(hue, seed));
  if (paintingTextureCache.has(imagePath)) return Promise.resolve(paintingTextureCache.get(imagePath));
  return new Promise((resolve) => {
    // 相对路径(兼容子路径部署),而非硬编码 /art/
    textureLoader.load(
      `art/${imagePath}`,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        paintingTextureCache.set(imagePath, tex);
        resolve(tex);
      },
      undefined,
      () => {
        console.warn('[art-museum] 画作加载失败,回退程序化纹理:', imagePath);
        const fallback = getFallbackTexture(hue, seed);
        paintingTextureCache.set(imagePath, fallback);
        resolve(fallback);
      },
    );
  });
}

// 圆形粒子贴图 —— PointsMaterial 不给 map 时 WebGL 会把点渲染成硬边方块
let roundSprite = null;
export function getRoundSprite() {
  if (roundSprite) return roundSprite;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  roundSprite = new THREE.CanvasTexture(c);
  return roundSprite;
}

// 画作名牌:美术馆标配的 title / artist / year 小牌子
const labelCache = new Map();
export function makeLabelTexture(title, artist, year) {
  const key = `${title}|${artist}|${year}`;
  if (labelCache.has(key)) return labelCache.get(key);

  const W = 512, H = 160;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

  const serif = '"Songti SC","Noto Serif SC",Georgia,serif';
  const sans = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Helvetica,Arial,sans-serif';

  const fit = (text, font, maxW) => {
    ctx.font = font;
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return `${t}…`;
  };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#1f1d1a';
  ctx.font = `600 40px ${serif}`;
  ctx.fillText(fit(title || 'Untitled', `600 40px ${serif}`, W - 56), W / 2, 56);

  ctx.fillStyle = '#5a564e';
  ctx.font = `400 30px ${sans}`;
  ctx.fillText(fit(artist || 'Unknown', `400 30px ${sans}`, W - 56), W / 2, 104);

  if (year) {
    ctx.fillStyle = '#8a857b';
    ctx.font = `400 24px ${sans}`;
    ctx.fillText(fit(year, `400 24px ${sans}`, W - 56), W / 2, 136);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  labelCache.set(key, tex);
  return tex;
}

// 图片还没加载完时先挂这个，避免画框空着或闪一下抽象纹理
let placeholder = null;
export function getPlaceholderTexture() {
  if (placeholder) return placeholder;
  const W = 256, H = 320;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfc9bd';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '400 22px "PingFang SC",Helvetica,Arial,sans-serif';
  ctx.fillText('载入中', W / 2, H / 2);
  placeholder = new THREE.CanvasTexture(c);
  placeholder.colorSpace = THREE.SRGBColorSpace;
  return placeholder;
}

// 展厅入口上方的名牌
const roomSignCache = new Map();
export function makeRoomSignTexture(name, sub) {
  const key = `${name}|${sub}`;
  if (roomSignCache.has(key)) return roomSignCache.get(key);

  const W = 768, H = 192;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#f6f3ec';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

  const serif = '"Songti SC","Noto Serif SC",Georgia,serif';
  const sans = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Helvetica,Arial,sans-serif';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1f1d1a';
  ctx.font = `600 66px ${serif}`;
  ctx.fillText(name, W / 2, sub ? 78 : H / 2);
  if (sub) {
    ctx.fillStyle = '#7a756b';
    ctx.font = `400 32px ${sans}`;
    ctx.fillText(sub, W / 2, 138);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  roomSignCache.set(key, tex);
  return tex;
}

// 门厅导览牌：把平面图缩成一张小地图画出来，带"你在这里"
export function makeDirectoryBoardTexture(rooms, youAreHereId) {
  const W = 1024, H = 656;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#f7f4ed';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  const serif = '"Songti SC","Noto Serif SC",Georgia,serif';
  const sans = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Helvetica,Arial,sans-serif';

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1f1d1a';
  ctx.font = `600 46px ${serif}`;
  ctx.fillText('ART MUSEUM', 56, 66);
  ctx.fillStyle = '#8a857b';
  ctx.font = `400 26px ${sans}`;
  ctx.fillText('导览图 · 五个展厅', 56, 110);

  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(56, 142);
  ctx.lineTo(W - 56, 142);
  ctx.stroke();

  // 平面图缩放到画布下半部分
  const pad = 56;
  const areaY = 176, areaH = H - areaY - 56;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.x0); maxX = Math.max(maxX, r.x1);
    minZ = Math.min(minZ, r.z0); maxZ = Math.max(maxZ, r.z1);
  }
  const spanX = maxX - minX, spanZ = maxZ - minZ;
  const scale = Math.min((W - pad * 2) / spanX, areaH / spanZ);
  const offX = pad + ((W - pad * 2) - spanX * scale) / 2;
  const offY = areaY + (areaH - spanZ * scale) / 2;
  const px = (x) => offX + (x - minX) * scale;
  const pz = (z) => offY + (z - minZ) * scale;

  for (const r of rooms) {
    const x = px(r.x0), y = pz(r.z0);
    const w = (r.x1 - r.x0) * scale, h = (r.z1 - r.z0) * scale;
    const isGallery = r.kind === 'gallery';
    ctx.fillStyle = isGallery ? '#dce8f4' : '#f0e6d2';
    ctx.strokeStyle = isGallery ? '#3d6b96' : '#9a7b45';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    if (isGallery) {
      ctx.fillStyle = '#2b4f70';
      ctx.font = `500 22px ${sans}`;
      ctx.textAlign = 'center';
      const label = r.name.replace(/^展厅[一二三四五]\s*·\s*/, '');
      ctx.fillText(label, x + w / 2, y + h / 2);
    }
  }

  // 你在这里
  const here = rooms.find((r) => r.id === youAreHereId);
  if (here) {
    const hx = px((here.x0 + here.x1) / 2);
    const hy = pz((here.z0 + here.z1) / 2);
    ctx.beginPath();
    ctx.arc(hx, hy, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#c0392b';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.font = `500 24px ${sans}`;
    ctx.textAlign = 'left';
    ctx.fillText('你在这里', hx + 20, hy);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

