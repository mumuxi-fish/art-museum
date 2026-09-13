// 展馆数据加载与画作贴图流式加载
import { loadPaintingTexture } from './textures.js';

export async function loadMuseum() {
  const response = await fetch('data/museum.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.rooms?.length) throw new Error('平面图数据为空');
  return data;
}

// 背景流式加载：每张图到位就立刻换到对应材质上，不阻塞首屏。
// 上一版是启动时把 40 张一次性拉完再建场景，首屏要等好几秒。
export async function streamArtTextures(artSlots, onReady, onProgress) {
  const entries = [...artSlots.entries()];
  if (!entries.length) return;
  let done = 0;
  await Promise.all(entries.map(async ([image, slot]) => {
    try {
      const tex = await loadPaintingTexture(image, slot.hue, slot.fallbackSeed);
      onReady(slot.material, tex);
    } catch (err) {
      console.warn('[art-museum] 画作加载失败:', image, err);
    }
    done += 1;
    onProgress?.(done, entries.length);
  }));
}
