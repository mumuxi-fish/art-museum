// 纹理生成与画作纹理加载
import * as THREE from 'three';
import { renderer, textureLoader } from './scene.js';

export const paintingTextureCache = new Map();

// 地板纹理(checker / stripes / wood / solid)
export function makeFloorTexture(darkHex, lightHex, roomHalf, type = 'checker') {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const dark = new THREE.Color(darkHex);
  const light = new THREE.Color(lightHex);

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
      const shade = new THREE.Color(darkHex).lerp(new THREE.Color(lightHex), 0.15 + Math.random() * 0.35);
      ctx.fillStyle = `#${shade.getHexString()}`;
      ctx.fillRect(baseX + 1, 0, plankW - 2, size);
      for (let y = 0; y < size; y += 12 + Math.random() * 20) {
        ctx.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.06})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(baseX + 2, y);
        for (let x = baseX + 2; x < baseX + plankW - 2; x += 4) {
          ctx.lineTo(x, y + (Math.random() - 0.5) * 4);
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

// 程序化画作纹理(更精致:分层渐变 + 光晕 + 笔触)
export function makeFallbackTexture(hue) {
  const w = 256, h = 320;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // 主渐变
  const grd = ctx.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, `hsl(${(hue * 360) | 0}, 60%, 46%)`);
  grd.addColorStop(0.45, `hsl(${(hue * 360 + 40) | 0}, 45%, 58%)`);
  grd.addColorStop(1, `hsl(${(hue * 360 + 120) | 0}, 32%, 40%)`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // 光晕(径向渐变)
  const glowX = w * (0.25 + Math.random() * 0.5);
  const glowY = h * (0.2 + Math.random() * 0.4);
  const glow = ctx.createRadialGradient(glowX, glowY, 4, glowX, glowY, w * 0.55);
  glow.addColorStop(0, `hsla(${(hue * 360 + 60) | 0}, 80%, 75%, 0.5)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 抽象笔触
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `hsla(${(hue * 360 + Math.random() * 120) | 0}, ${50 + Math.random() * 40}%, ${50 + Math.random() * 40}%, ${0.12 + Math.random() * 0.3})`;
    ctx.lineWidth = 2 + Math.random() * 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const sx = Math.random() * w;
    const sy = Math.random() * h;
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(
      sx + (Math.random() - 0.5) * w * 0.5,
      sy + (Math.random() - 0.5) * h * 0.5,
      Math.random() * w,
      Math.random() * h,
    );
    ctx.stroke();
  }

  // 画框内侧阴影(视觉层次)
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

// 加载画作图片;失败或未提供时用程序化纹理
export function loadPaintingTexture(imagePath, hue = 0.5) {
  if (!imagePath) return Promise.resolve(makeFallbackTexture(hue));
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
        const fallback = makeFallbackTexture(hue);
        paintingTextureCache.set(imagePath, fallback);
        resolve(fallback);
      },
    );
  });
}
