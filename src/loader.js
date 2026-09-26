// 展馆数据加载与画作贴图流式加载
import { loadPaintingTexture } from './textures.js';

export async function loadMuseum() {
  // 带构建 ID：museum.json 在 public/ 下，vite 不会给它加 hash，
  // 不加版本号的话换了图或改了数据，浏览器会一直吃旧缓存。
  const response = await fetch(`data/museum.json?v=${__BUILD_ID__}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.rooms?.length) throw new Error('平面图数据为空');
  return data;
}

// 背景流式加载：每张图到位就立刻换到对应材质上，不阻塞首屏。
//
// 分两批：主墙的图（进门正对着看的那面墙）先来，其余随后补。
// 并发限制在 6 —— 一次放开 72 个请求只会互相挤，浏览器排队反而更慢。
const CONCURRENCY = 6;

async function runPool(items, worker, limit) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

export async function streamArtTextures(artSlots, onReady, onProgress) {
  const entries = [...artSlots.entries()];
  if (!entries.length) return;

  const total = entries.length;
  let done = 0;

  const loadOne = async ([image, slot]) => {
    try {
      const tex = await loadPaintingTexture(image, slot.hue, slot.fallbackSeed);
      onReady(slot.material, tex);
    } catch (err) {
      // 单张失败就先用程序化兜底纹理，别让一张图卡住整面墙
      console.warn('[art-museum] 画作加载失败:', image, err);
    }
    done += 1;
    onProgress?.(done, total);
  };

  // id 是按编年编的，每厅前 3 幅就是主墙
  const isMainWall = (slot) => /-art-0[123]$/.test(slot.id || '');
  const first = entries.filter(([, s]) => isMainWall(s));
  const rest = entries.filter(([, s]) => !isMainWall(s));

  await runPool(first, loadOne, CONCURRENCY);
  await runPool(rest, loadOne, CONCURRENCY);
}
