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
// 分两批：主墙 15 张（进门正对着看的那面墙）先来，其余 25 张随后补。
//
// 并发数限制在 6，并且失败会重试。
// 起因是实测：从国内访问 GitHub Pages 只有 1–11 KB/s，总带宽就那么大，
// 一次放 40 个请求过去只会互相挤、集体超时（实测并发 4 张全部 timeout）。
// 限流 + 重试反而能一张一张稳定拿到图。
const CONCURRENCY = 6;
const RETRIES = 2;

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
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const tex = await loadPaintingTexture(image, slot.hue, slot.fallbackSeed, attempt > 0);
        onReady(slot.material, tex);
        break;
      } catch (err) {
        if (attempt === RETRIES) {
          console.warn('[art-museum] 画作加载失败（已重试）:', image, err);
        } else {
          // 慢网络下超时很常见，等一下再试，别急着退化成色块
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
      }
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
