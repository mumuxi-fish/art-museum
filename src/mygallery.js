// 「选一个本地文件夹 → 生成你自己的展厅」的本地实现
//
// 全程在浏览器里跑：读文件 → canvas 缩成墙图(640)和大图(1600) → 存 IndexedDB。
// 照片不出本机：没有任何上传，也没有任何文件写进仓库。
//
// 为什么存 IndexedDB 而不是内存里现改场景：buildMuseum 建完就冻结了矩阵、
// 灯光预算、房间可见性，运行中拆掉重建整个场景风险太大 —— 存下来刷新一次，
// 走的就是和默认展馆完全相同的那条启动路径，只换 museum.json 的来源。
import { setCustomArtUrl } from './textures.js';
import { buildMyGalleryPlan } from './mygallery-plan.js';

const DB_NAME = 'art-museum-mygallery';
const STORE = 'gallery';
const RECORD_ID = 'current';

// 只认浏览器解得开的位图格式。HEIC 之类解不开的单张跳过，不拖垮整个文件夹。
const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|avif|jfif)$/i;

let active = false;

// 当前是不是「我自己导入的展厅」（main.js 用它决定 🖼 按钮的状态）
export function isMyGallery() {
  return active;
}

// ---- IndexedDB ----
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB 打不开'));
  });
}

async function idbRun(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务中止'));
    });
  } finally {
    db.close();
  }
}

const idbGet = (key) => idbRun('readonly', (store) => store.get(key));
const idbPut = (record) => idbRun('readwrite', (store) => store.put(record, RECORD_ID));
const idbDelete = () => idbRun('readwrite', (store) => store.delete(RECORD_ID));

// ---- 启动时取回上次导入的展厅 ----
export async function loadMyGallery() {
  let record;
  try {
    record = await idbGet(RECORD_ID);
  } catch (err) {
    console.warn('[art-museum] 本地展厅读取失败，回退到默认展馆:', err);
    return null;
  }
  if (!record?.json?.rooms?.length || !record.images?.length) return null;
  try {
    registerMyArtUrls(record.images);
  } catch (err) {
    console.warn('[art-museum] 本地图片注册失败，回退到默认展馆:', err);
    return null;
  }
  active = true;
  return record;
}

// 把 IDB 里的 Blob 换成 object URL，textures.js 的 artWallUrl/artDetailUrl 就会走这里
function registerMyArtUrls(images) {
  for (const img of images) {
    if (!img?.image || !(img.wall instanceof Blob) || !(img.detail instanceof Blob)) {
      throw new Error('本地图片记录不完整');
    }
    setCustomArtUrl(img.image, {
      wall: URL.createObjectURL(img.wall),
      detail: URL.createObjectURL(img.detail),
    });
  }
}

// 还原默认展馆：删掉记录，调用方负责刷新页面（object URL 随页面卸载自动回收）
export async function clearMyGallery() {
  try {
    await idbDelete();
  } catch (err) {
    console.warn('[art-museum] 本地展厅清除失败:', err);
    throw err;
  }
}

// ---- 导入 ----
function stemOf(name) {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).trim() || name;
}

function folderNameOf(file, fallback) {
  const rel = file.webkitRelativePath;
  const folder = typeof rel === 'string' && rel.includes('/') ? rel.split('/')[0] : '';
  return folder || fallback;
}

async function decode(file) {
  // imageOrientation: 'from-image' 才会按 EXIF 摆正手机拍的照片
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

// 长边压到 maxEdge 再转码：墙图 640、详情图 1600，手机随手拍的 4000px 大图
// 不缩的话一张就 8MB，几十张能把显存和 IndexedDB 一起吃光。
async function scaleToBlob(bitmap, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(bitmap, 0, 0, w, h);

  let blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.88));
  if (!blob || blob.type !== 'image/webp') {
    // 老浏览器不支持 webp 编码，退到 jpeg（照片本来也没有透明）
    blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
  }
  if (!blob) throw new Error('图片转换失败');
  return blob;
}

/**
 * @param {FileList|File[]} fileList <input webkitdirectory multiple> 选出来的文件
 * @param {(p: {done:number, total:number, name:string}) => void} [onProgress]
 * @returns {Promise<{count:number, skipped:number, folder:string}>}
 */
export async function importPhotoFiles(fileList, onProgress) {
  const files = [...fileList].filter((f) => IMG_RE.test(f.name));
  if (!files.length) throw new Error('文件夹里没有浏览器认得的图片');
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }));

  const folder = folderNameOf(files[0], '我的照片');
  const photos = [];
  const images = [];
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    onProgress?.({ done: i, total: files.length, name: files[i].name });
    let bitmap;
    try {
      bitmap = await decode(files[i]);
    } catch {
      skipped += 1;
      continue;
    }
    try {
      const image = `p${photos.length + 1}.webp`;
      const wall = await scaleToBlob(bitmap, 640);
      const detail = await scaleToBlob(bitmap, 1600);
      photos.push({ image, title: stemOf(files[i].name), w: bitmap.width, h: bitmap.height });
      images.push({ image, wall, detail });
    } finally {
      bitmap.close?.();
    }
  }

  if (!photos.length) throw new Error('这些图片都解不开（HEIC 需要先转成 JPG）');

  const json = buildMyGalleryPlan(photos, { title: folder });
  await idbPut({ folder, savedAt: Date.now(), json, images });

  return { count: photos.length, skipped, folder };
}
