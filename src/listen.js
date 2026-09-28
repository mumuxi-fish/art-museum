// 听音点：展厅墙上「音频牌」的播放引擎（选本地文件夹导入的纯音频）
//
// 和右上角的背景音乐是两套东西：背景音乐一直在响，这里是你走近哪块牌、
// 按 E 点哪块牌，才响哪一条。规矩很简单 —— 同一时刻只响一首，播新的就停旧的。
// 没有多轨混音、不进播放列表（B/N/空格 那套键全都不管它）。
let sources = new Map();   // key -> { url, title, duration }
let audio = null;
let currentKey = null;
let stateListener = null;  // (key, playing) => void，main.js 拿它去重绘站牌

// 导入/读取本地记录时调用：把 object URL 登记进来
export function registerLocalAudios(list) {
  sources = new Map(
    (list || [])
      .filter((a) => a && a.key && a.url)
      .map((a) => [a.key, { url: a.url, title: a.title || '', duration: a.duration || '' }]),
  );
}

export const hasLocalAudios = () => sources.size > 0;
export const localAudioTitle = (key) => sources.get(key)?.title || '';
export const listeningKey = () => (audio && !audio.paused ? currentKey : null);
export const isListening = (key = null) =>
  Boolean(audio && !audio.paused && (key === null || currentKey === key));
export function onListenState(cb) {
  stateListener = cb;
}

function notify(key, playing) {
  stateListener?.(key, playing, sources.get(key)?.title || '');
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'metadata';
  // 别的牌子/页面出了声就别撞在一起
  audio.addEventListener('ended', () => {
    if (currentKey) notify(currentKey, false);
  });
  audio.addEventListener('error', () => {
    if (currentKey) notify(currentKey, false);
  });
  return audio;
}

/**
 * 按 E 切换某块听音点的状态。
 * @returns {Promise<{ok: boolean, playing?: boolean, title?: string, message?: string}>}
 */
export async function toggleListen(key) {
  const src = sources.get(key);
  if (!src) return { ok: false, message: '这段音频没载进来' };
  const el = ensureAudio();

  if (currentKey === key && !el.paused) {
    el.pause();
    notify(key, false);
    return { ok: true, playing: false, title: src.title };
  }

  // 换一条（或者上一条已经停了）就重挂 src，再播
  if (currentKey !== key) {
    const prev = currentKey;
    el.pause();
    if (prev) notify(prev, false);
    el.src = src.url;
    el.currentTime = 0;
    currentKey = key;
  }

  try {
    await el.play();
    notify(key, true);
    return { ok: true, playing: true, title: src.title };
  } catch (err) {
    return { ok: false, message: `播放失败：${err?.message || err}` };
  }
}

export function stopListen() {
  if (!audio) return;
  const prev = currentKey;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  currentKey = null;
  if (prev) notify(prev, false);
}
