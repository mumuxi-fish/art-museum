// 展馆数据加载与画作预加载
import { loadPaintingTexture } from './textures.js';

export let galleries = [];

export async function loadGalleries() {
  try {
    const response = await fetch('data/galleries.json');
    const data = await response.json();
    galleries = data.galleries || [];
    console.log('加载了', galleries.length, '个展馆');
  } catch (err) {
    console.error('加载展馆配置失败:', err);
    galleries = [];
  }
}

export async function preloadPaintings() {
  const tasks = [];
  galleries.forEach((gallery) => {
    if (gallery.arts) {
      gallery.arts.forEach((art) => {
        if (art.image) tasks.push(loadPaintingTexture(art.image, art.hue));
      });
    }
  });
  await Promise.all(tasks);
}
