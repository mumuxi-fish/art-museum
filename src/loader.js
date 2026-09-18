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
// 两批都用并发 —— 之前把第二批限流到 4 并发，实测反而更慢：
// 带宽才是瓶颈，浏览器自己会管连接数，人为限流只是白白拉长了总时长。
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
      console.warn('[art-museum] 画作加载失败:', image, err);
    }
    done += 1;
    onProgress?.(done, total);
  };

  // id 是按编年编的，每厅前 3 幅就是主墙
  const isMainWall = (slot) => /-art-0[123]$/.test(slot.id || '');
  const first = entries.filter(([, s]) => isMainWall(s));
  const rest = entries.filter(([, s]) => !isMainWall(s));

  await Promise.all(first.map(loadOne));
  await Promise.all(rest.map(loadOne));
}
