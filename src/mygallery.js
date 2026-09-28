// 「选一个本地文件夹 → 生成你自己的展厅」的本地实现
//
// 全程在浏览器里跑，分三类处理：
//   图片 → canvas 缩成墙图(640)和大图(1600)
//   视频 → 解码校验 + 抽一帧当封面，原始文件整个存下来（墙上是动态的）
//   音频 → 只探时长、存原始文件，展厅里做成「听音点」的墙牌
// 三者的元数据最后都进 IndexedDB，照片视频不出本机：没有任何上传，
// 也没有任何文件写进仓库。
//
// 为什么存 IndexedDB 而不是内存里现改场景：buildMuseum 建完就冻结了矩阵、
// 灯光预算、房间可见性，运行中拆掉重建整个场景风险太大 —— 存下来刷新一次，
// 走的就是和默认展馆完全相同的那条启动路径，只换 museum.json 的来源。
import { setCustomArtUrl } from './textures.js';
import { buildMyGalleryPlan } from './mygallery-plan.js';
import { registerLocalAudios } from './listen.js';

const DB_NAME = 'art-museum-mygallery';
const STORE = 'gallery';
const RECORD_ID = 'current';

// 单个媒体文件的上限。视频是原始文件整个进 IndexedDB，超了不收（见 README 第六节）。
export const MAX_MEDIA_BYTES = 300 * 1024 * 1024;

// 只认浏览器解得开的位图格式。HEIC 之类解不开的单张跳过，不拖垮整个文件夹。
const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|avif|jfif)$/i;
const VIDEO_RE = /\.(mp4|m4v|webm|mov|ogv|mkv|avi|3gp|mpe?g)$/i;
const AUDIO_RE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i;

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
  const hasPieces = record?.images?.length || record?.videos?.length;
  if (!record?.json?.rooms?.length || !(hasPieces || record?.audios?.length)) return null;
  try {
    registerLocalRecord(record);
  } catch (err) {
    console.warn('[art-museum] 本地媒体注册失败，回退到默认展馆:', err);
    return null;
  }
  active = true;
  return record;
}

// 把 IDB 里的 Blob 换成 object URL，textures.js 的 artWallUrl/artDetailUrl/artVideoUrl
// 以及 listen.js 的听音点就都会走这里。
//
// 老记录（只导过照片）没有 videos/audios 字段，照样读得动。
function registerLocalRecord(record) {
  const byKey = new Map();

  for (const img of record.images || []) {
    if (!img?.image || !(img.wall instanceof Blob) || !(img.detail instanceof Blob)) {
      throw new Error('本地图片记录不完整');
    }
    byKey.set(img.image, {
      wall: URL.createObjectURL(img.wall),
      detail: URL.createObjectURL(img.detail),
    });
  }
  for (const vid of record.videos || []) {
    const entry = byKey.get(vid.image);
    if (!entry || !(vid.video instanceof Blob)) throw new Error('本地视频记录不完整');
    entry.video = URL.createObjectURL(vid.video);
  }
  for (const [key, urls] of byKey) setCustomArtUrl(key, urls);

  registerLocalAudios(
    (record.audios || []).map((a) => ({
      key: a.key,
      title: a.title,
      duration: a.duration,
      url: a.audio instanceof Blob ? URL.createObjectURL(a.audio) : '',
    })).filter((a) => a.url),
  );
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

// 按扩展名分三类；.webm/.mp4 可能是纯音频，探的时候会先按视频试、失败再按音频试
function kindOf(name) {
  if (IMG_RE.test(name)) return 'image';
  if (VIDEO_RE.test(name)) return 'video';
  if (AUDIO_RE.test(name)) return 'audio';
  return null;
}

// 等一个「好了」事件，或者「出错/超时」—— 浏览器解不开的媒体就是靠 error 路径跳过的
function once(el, okEvents, errEvents = ['error'], timeout = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      okEvents.forEach((e) => el.removeEventListener(e, onOk));
      errEvents.forEach((e) => el.removeEventListener(e, onErr));
      clearTimeout(timer);
    };
    const onOk = () => { if (settled) return; settled = true; cleanup(); resolve(); };
    const onErr = (ev) => {
      if (settled) return; settled = true; cleanup();
      reject(new Error(ev?.message || ev?.type || '媒体出错'));
    };
    okEvents.forEach((e) => el.addEventListener(e, onOk));
    errEvents.forEach((e) => el.addEventListener(e, onErr));
    const timer = setTimeout(() => {
      if (settled) return; settled = true; cleanup();
      reject(new Error('媒体加载超时'));
    }, timeout);
  });
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
  return canvasToBlob(canvas);
}

async function canvasToBlob(canvas) {
  let blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.88));
  if (!blob || blob.type !== 'image/webp') {
    // 老浏览器不支持 webp 编码，退到 jpeg（照片本来也没有透明）
    blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
  }
  if (!blob) throw new Error('图片转换失败');
  return blob;
}

// 视频校验 + 抽一帧当封面。解不开的（格式/编码浏览器不认识）抛错走跳过。
async function probeVideo(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.src = url;
  try {
    await once(video, ['loadedmetadata']);
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error('读不出画面尺寸');
    // MediaRecorder 录的 webm 没有 Duration，duration 是 Infinity —— 认不出时长不致命
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const poster = await grabPoster(video, w, h, duration);
    return { w, h, duration, poster };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

// 往前跳 15% 再截一帧（开场常常是黑场）；时长未知就用第一帧
async function grabPoster(video, w, h, duration) {
  await once(video, ['loadeddata']);
  if (duration > 0.4) {
    const t = Math.min(Math.max(0.3, duration * 0.15), duration * 0.8);
    try {
      video.currentTime = t;
      await once(video, ['seeked'], ['error'], 8000);
    } catch {
      // 跳不动就用当前帧
    }
  }
  if (video.readyState < 2) throw new Error('抽不出封面帧');
  const scale = Math.min(1, 640 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d', { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
}

// 音频只探「解得开 + 时长」，原始文件原样存
async function probeAudio(file) {
  const url = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = url;
  try {
    await once(audio, ['loadedmetadata']);
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    return { duration };
  } finally {
    audio.removeAttribute('src');
    audio.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {FileList|File[]} fileList <input webkitdirectory multiple> 选出来的文件
 * @param {(p: {done:number, total:number, name:string}) => void} [onProgress]
 * @returns {Promise<{count:number, images:number, videos:number, audios:number, skipped:number, oversize:number, folder:string}>}
 */
export async function importPhotoFiles(fileList, onProgress) {
  const cmp = (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
  const files = [...fileList]
    .map((f) => ({ file: f, kind: kindOf(f.name) }))
    .filter((x) => x.kind)
    .sort((a, b) => cmp(a.file, b.file));
  if (!files.length) throw new Error('文件夹里没有浏览器认得的图片 / 视频 / 音频');

  const folder = folderNameOf(files[0].file, '我的展厅');
  const photos = [];      // 上墙的（图片 + 视频，视频拿封面帧当 image）
  const images = [];      // { image, wall, detail } —— 全部上墙件的两档贴图
  const videos = [];      // { image, video, w, h, duration }
  const audios = [];      // { key, title, audio, duration }
  let skipped = 0;
  let oversize = 0;
  let done = 0;

  for (const { file, kind } of files) {
    onProgress?.({ done, total: files.length, name: file.name });
    done += 1;

    if (file.size > MAX_MEDIA_BYTES) {
      skipped += 1;
      oversize += 1;
      continue;
    }

    try {
      if (kind === 'image') {
        const bitmap = await decode(file);
        try {
          const image = `p${photos.length + 1}.webp`;
          const wall = await scaleToBlob(bitmap, 640);
          const detail = await scaleToBlob(bitmap, 1600);
          photos.push({ image, title: stemOf(file.name), w: bitmap.width, h: bitmap.height });
          images.push({ image, wall, detail });
        } finally {
          bitmap.close?.();
        }
      } else if (kind === 'video') {
        let info;
        try {
          info = await probeVideo(file);
        } catch {
          // .webm/.mp4 里也可能是纯音频，按视频解不开就再按音频试一次
          const audio = await probeAudio(file).catch(() => null);
          if (!audio) throw new Error('video');
          const key = `au${audios.length + 1}`;
          audios.push({ key, title: stemOf(file.name), audio: file, duration: audio.duration });
          continue;
        }
        const image = `p${photos.length + 1}.webp`;
        photos.push({
          image,
          title: stemOf(file.name),
          w: info.w,
          h: info.h,
          video: true,
          duration: info.duration,
        });
        images.push({ image, wall: info.poster, detail: info.poster });
        videos.push({ image, video: file, w: info.w, h: info.h, duration: info.duration });
      } else {
        const { duration } = await probeAudio(file);
        const key = `au${audios.length + 1}`;
        audios.push({ key, title: stemOf(file.name), audio: file, duration });
      }
    } catch {
      skipped += 1;
    }
  }

  if (!photos.length && !audios.length) {
    throw new Error('这些文件都解不开（视频格式要浏览器放得了，HEIC 图片需先转成 JPG）');
  }

  const json = buildMyGalleryPlan(photos, { title: folder, audios });
  await idbPut({ folder, savedAt: Date.now(), json, images, videos, audios });

  return {
    count: photos.length,
    images: photos.length - videos.length,
    videos: videos.length,
    audios: audios.length,
    skipped,
    oversize,
    folder,
  };
}
