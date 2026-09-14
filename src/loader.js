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
//
// 分两批，而不是一次 Promise.all 拉完 40 张 —— 那样进门就占满带宽，
// 慢网下首屏要等十几秒。
//   第一批 = 每个展厅主墙上的 3 幅（进门正对着看的那面墙），15 张，全并发
//   第二批 = 其余 25 张，限流慢慢补，不跟第一批抢
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

  const CONCURRENCY = 4;
  for (let i = 0; i < rest.length; i += CONCURRENCY) {
    await Promise.all(rest.slice(i, i + CONCURRENCY).map(loadOne));
  }
}
