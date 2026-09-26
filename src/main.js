// Art Museum — 入口：装配各模块
//
// 整座馆是一张连续平面图，一次建好，玩家从门厅一路走进去，没有传送。

import * as THREE from 'three';
import { scene, camera, renderer, ambient, markDirty, takeDirty } from './scene.js';
import { IS_MOBILE } from './config.js';
import { loadMuseum, streamArtTextures } from './loader.js';
import { buildPlan } from './plan.js';
import {
  buildMuseum, disposeMuseum, applyRoomVisibility, visibleRoomCount,
  freezeMuseumMatrices, getVisRevision,
} from './room.js';
import { initControls, controls, updateMovement, enterMobileMode } from './controls.js';
import { initPlayer, updatePlayer } from './player.js';
import { initFlashlight, updateFlashlight, toggle } from './flashlight.js';
import { initInteract, updateInteract, activate, isSeated, stand, hidePrompt } from './interact.js';
import { initMinimap, updateMinimap } from './minimap.js';
import { initDaylight, applyDaylight, daylightLabel } from './daylight.js';
import { paintingTextureCache, artWallUrl, artDetailUrl } from './textures.js';
import {
  initAudio, setAudioEnabled, toggleMute, isMuted, footstep, sitSound, clickSound,
  toggleMusic, isMusicOn, audioRms,
  nextTrack, currentTrack, isTrackLoading, trackList, audioDebug,
} from './audio.js';

// DOM
const roomLabel = document.getElementById('galleryLabel');
const mobileControls = document.getElementById('mobileControls');
const joystickBase = document.getElementById('joystickBase');
const joystickThumb = document.getElementById('joystickThumb');
const lookBtn = document.getElementById('lookBtn');
const mobileToast = document.getElementById('mobileToast');
const bodyToggle = document.getElementById('bodyToggle');
const galleryMenu = document.getElementById('gallery-menu');
const galleryMenuBtn = document.getElementById('galleryMenuBtn');
const galleryCards = document.getElementById('gallery-cards');
const flashBtn = document.getElementById('flashBtn');
const musicBtn = document.getElementById('musicBtn');
const nextTrackBtns = document.querySelectorAll('.next-track-btn');
const minimapEl = document.getElementById('minimap');
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapRoom = document.getElementById('minimap-room');
const helpBtn = document.getElementById('helpBtn');
const helpPanel = document.getElementById('help-panel');
const helpClose = document.getElementById('help-close');
const daylightEl = document.getElementById('daylight');
const daylightRange = document.getElementById('daylight-range');
const daylightName = document.getElementById('daylight-name');
const loadingEl = document.getElementById('loading');
const fatalEl = document.getElementById('fatal');
const progressEl = document.getElementById('art-progress');
const toastEl = document.getElementById('toast');
const promptEl = document.getElementById('prompt');
const detailEl = document.getElementById('art-detail');
const detailImg = document.getElementById('detail-img');
const detailTitle = document.getElementById('detail-title');
const detailArtist = document.getElementById('detail-artist');
const detailYear = document.getElementById('detail-year');
const detailLink = document.getElementById('detail-link');
const detailClose = document.getElementById('detail-close');
const detailDesc = document.getElementById('detail-desc');
const detailKnow = document.getElementById('detail-know');
const detailTechnique = document.getElementById('detail-technique');
const detailDimensions = document.getElementById('detail-dimensions');
const detailCredit = document.getElementById('detail-credit');
const introHint = document.getElementById('intro-hint');

const GALLERY_ICONS = ['🌅', '☀️', '🖼️', '🌌', '🌸', '🏛', '🎨', '🌿', '🔥', '💧'];

let plan = null;
let lights = [];
let currentRoomId = null;
let started = false;
let warmupQueue = null;
let detailOpen = false;
// 全馆作品索引（含世界坐标），供详情浮层的"相关作品"跳转用
let artIndex = [];

// 轻量提示：借移动端那个 toast 元素，桌面端也能用
let toastTimer = null;
function toast(msg, duration = 1600) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => { toastEl.hidden = true; }, 300);
  }, duration);
}

function showLoading(on) {
  if (loadingEl) loadingEl.classList.toggle('hidden', !on);
}

function menuOpen() {
  return galleryMenu && !galleryMenu.classList.contains('hidden');
}

function placePlayer(x, z, yaw) {
  camera.rotation.order = 'YXZ';
  camera.position.set(x, camera.position.y, z);
  if (yaw !== undefined) camera.rotation.set(0, yaw, 0);
}

// ---- 相机滑移 ----
//
// 展厅列表和详情浮层的"相关作品"原本是直接改坐标（瞬移），和馆内"没有传送、
// 连续动线"的设定自相矛盾 —— 卡片上还写着「走过去 →」，点下去却是落地。
//
// 改成一段带缓动的滑移：本馆的房间图是一棵树（门厅 ↔ 主廊 ↔ 各展厅，
// 展厅之间不直接连通），所以先在房间图上 BFS 出一条路，用每个门洞的中心
// 当途经点，相机沿折线滑过去。全程不落地、不切镜头，小地图上也能看见自己在走。
let glide = null;

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// 从当前位置走到 (x, z) 的途经点。房间图连通就走门洞，不连通（理论上不会）
// 直接退化成一条直线。
function waypointsTo(x, z) {
  const pts = [];
  const from = plan.roomAt(camera.position.x, camera.position.z);
  const to = plan.roomAt(x, z);

  if (from && to && from.id !== to.id) {
    const prev = new Map();
    const seen = new Set([from.id]);
    const queue = [from.id];
    let reached = false;
    while (queue.length && !reached) {
      const id = queue.shift();
      if (id === to.id) { reached = true; break; }
      for (const op of plan.byId.get(id).openings) {
        const next = op.rooms.find((r) => r !== id);
        if (next && !seen.has(next)) {
          seen.add(next);
          prev.set(next, { from: id, op });
          queue.push(next);
        }
      }
    }
    if (reached) {
      // 房间链：from → … → to，同时记下每一步走的门洞
      const chain = [];
      for (let cur = to.id; cur !== from.id;) {
        const step = prev.get(cur);
        chain.unshift({ next: cur, op: step.op });
        cur = step.from;
      }
      const doorPt = (op) => (op.axis === 'x'
        ? { x: op.at, z: (op.from + op.to) / 2 }
        : { x: (op.from + op.to) / 2, z: op.at });
      chain.forEach((step, i) => {
        pts.push(doorPt(step.op));
        // 途经的房间（门厅/主廊）在两个门洞之间绕一下房间中心。
        // 两个门洞可能开在同一面墙上，直接连线会贴着墙皮走，近裁剪面会穿帮。
        if (i < chain.length - 1) {
          const mid = plan.byId.get(step.next);
          pts.push({ x: mid.cx, z: mid.cz });
        }
      });
    }
  }
  pts.push({ x, z });
  return pts;
}

function startGlide(x, z, yaw) {
  const points = [{ x: camera.position.x, z: camera.position.z }, ...waypointsTo(x, z)];
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    lengths.push(d);
    total += d;
  }
  // 已经站在目标点上（比如同室内的"相关作品"距离很近却重合）——直接落位
  if (total < 0.02) {
    placePlayer(x, z, yaw ?? camera.rotation.y);
    return;
  }
  hidePrompt();
  glide = {
    points,
    lengths,
    total,
    // 距离越远给的时间越长，但整体压在 0.6–1s：是"滑过去"，不是模拟步行
    duration: Math.min(1.0, Math.max(0.6, total / 26)),
    t: 0,
    yaw0: camera.rotation.y,
    yaw1: yaw ?? camera.rotation.y,
    y: camera.position.y,
  };
}

function updateGlide(dt) {
  glide.t += dt / glide.duration;
  const done = glide.t >= 1;
  const t = Math.min(glide.t, 1);
  // easeInOutCubic：起步和落地都缓一下，中间最快
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

  let want = e * glide.total;
  let i = 0;
  while (i < glide.lengths.length - 1 && want > glide.lengths[i]) {
    want -= glide.lengths[i];
    i += 1;
  }
  const seg = glide.lengths[i] || 1;
  const a = glide.points[i];
  const b = glide.points[i + 1];
  const k = Math.min(1, want / seg);

  camera.position.set(a.x + (b.x - a.x) * k, glide.y, a.z + (b.z - a.z) * k);
  camera.rotation.y = glide.yaw0 + shortestAngle(glide.yaw0, glide.yaw1) * e;

  if (done) {
    camera.position.set(glide.points.at(-1).x, glide.y, glide.points.at(-1).z);
    camera.rotation.y = glide.yaw1;
    glide = null;
    stepAccum = 0;
  }
}

// ---- 灯光预算 ----
//
// 全馆 117 盏灯，全开会把 forward rendering 的 shader 撑爆。
// 但也不能简单地"当前房间 + 相邻房间"：走廊和所有展厅都相邻，
// 站走廊里等于全馆灯全开（实测 65/65），那才是最卡的场景。
//
// 改成固定灯数预算：当前房间的灯全开，再按距离补 LIGHT_BUDGET_EXTRA 盏，
// 总数只由房间决定、不随走位变化。three.js 的 shader program 是按可见灯数量缓存的，
// 数量恒定 = 只编译一次，走动时一次重编译都没有。
const LIGHT_BUDGET_EXTRA = 4;

// 地板反射：在馆内拍一次环境贴图（主要是天花板和灯），作为所有地板的 envMap。
// 只拍一次 —— 地板反射的是上方环境，走动时基本不变，没必要每帧重算，
// 这样比 Reflector 那种每帧再渲染一遍场景便宜得多。
function applyFloorReflection(floorMats) {
  if (!floorMats?.length) return;

  const rt = new THREE.WebGLCubeRenderTarget(256, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cubeCam = new THREE.CubeCamera(0.3, 60, rt);
  // 放在走廊中段、离地 1.1m：这里能同时拍到天花板灯和两侧展厅的门洞
  cubeCam.position.set(24, 1.1, 18.75);

  // 拍的时候临时藏起地板，否则会把自己拍进去形成自反射
  const hidden = [];
  scene.traverse((o) => {
    if (o.isMesh && floorMats.includes(o.material)) {
      hidden.push(o);
      o.visible = false;
    }
  });
  cubeCam.update(renderer, scene);
  for (const o of hidden) o.visible = true;

  for (const m of floorMats) {
    m.envMap = rt.texture;
    m.envMapIntensity = 0.6;
    // envMap 从 null 变成有值会改变 shader 的 defines，必须重编译
    m.needsUpdate = true;
  }
}

function lightBudgetFor(roomId) {
  let own = 0;
  for (const l of lights) if (l.userData.roomId === roomId) own += 1;
  return Math.min(own + LIGHT_BUDGET_EXTRA, lights.length);
}

function applyLightBudget(roomId) {
  const own = [];
  const others = [];
  for (const l of lights) {
    (l.userData.roomId === roomId ? own : others).push(l);
  }
  const budget = Math.min(own.length + LIGHT_BUDGET_EXTRA, lights.length);

  const px = camera.position.x;
  const pz = camera.position.z;
  others.sort((a, b) => {
    const da = (a.position.x - px) ** 2 + (a.position.z - pz) ** 2;
    const db = (b.position.x - px) ** 2 + (b.position.z - pz) ** 2;
    return da - db;
  });

  const keep = new Set(own);
  for (const l of others) {
    if (keep.size >= budget) break;
    keep.add(l);
  }
  for (const l of lights) l.visible = keep.has(l);
}

// 预编译每个房间的光照配置，切换房间时不再现场编译
function stepWarmup() {
  if (!warmupQueue?.length) return;
  const id = warmupQueue.shift();
  applyLightBudget(id);
  renderer.compile(scene, camera);
  applyLightBudget(currentRoomId); // 立刻还原，免得闪一帧
}

function updateRoom() {
  if (!plan) return;
  const room = plan.roomAt(camera.position.x, camera.position.z);
  if (!room || room.id === currentRoomId) return;
  currentRoomId = room.id;
  applyLightBudget(room.id);
  markDirty(); // 可见灯数变了，shader 要重编译，画面也跟着变
  if (roomLabel) {
    roomLabel.textContent = room.name;
    // 用一个短促的文字动画代替整屏闪黑：有"到了一个新厅"的提示，又不糊一下画面
    roomLabel.classList.remove('pop');
    void roomLabel.offsetWidth;
    roomLabel.classList.add('pop');
  }
  started = true;
}

// ---- 整厅剔除 ----
//
// plan 已经把每面实心墙抽成了 2D 线段，这里按视线判断哪些房间看得见，
// 看不见的整个 group 直接不渲染（门洞、隔壁厅、拐角后面的东西全挡住）。
//
// 代价是每帧最多 ~0.3ms，所以只在姿势变了的时候重算：走动 >0.15m、
// 转头 >1.7°、或者站着不动超过 0.5s 兜底算一次。
let roomSamples = null;
const visPose = { x: Infinity, z: Infinity, yaw: 0, at: -1 };
let roomCulling = true;

function updateRoomVisibility(now) {
  if (!plan || !roomSamples) return;
  if (!roomCulling) {
    if (applyRoomVisibility(null)) markDirty();
    visPose.x = Infinity;
    visPose.at = -1;
    return;
  }
  const moved = Math.hypot(camera.position.x - visPose.x, camera.position.z - visPose.z);
  const turned = Math.abs(shortestAngle(visPose.yaw, camera.rotation.y));
  if (moved < 0.15 && turned < 0.03 && now - visPose.at < 0.5) return;
  visPose.x = camera.position.x;
  visPose.z = camera.position.z;
  visPose.yaw = camera.rotation.y;
  visPose.at = now;
  if (applyRoomVisibility(plan.visibleRoomsFrom(camera.position.x, camera.position.z, roomSamples))) {
    markDirty();
  }
}

// 作品详情浮层。打开时锁住走动，并且不要让指针解锁去弹展厅列表
function openArtDetail(art) {
  if (!detailEl) return;
  detailOpen = true;
  clickSound();
  if (detailImg) detailImg.src = art.image ? artDetailUrl(art.image) : '';
  if (detailImg) detailImg.alt = art.title || '';
  if (detailTitle) detailTitle.textContent = art.title || '无题';
  if (detailArtist) detailArtist.textContent = art.artist || '佚名';
  if (detailYear) detailYear.textContent = art.year || '';
  if (detailDesc) {
    detailDesc.textContent = art.description || '';
    detailDesc.classList.toggle('hidden', !art.description);
  }
  if (detailKnow) {
    detailKnow.textContent = art.didYouKnow ? `你知道吗 · ${art.didYouKnow}` : '';
    detailKnow.classList.toggle('hidden', !art.didYouKnow);
  }
  if (detailTechnique) detailTechnique.textContent = art.technique || '—';
  if (detailDimensions) detailDimensions.textContent = art.dimensions || '—';
  if (detailCredit) detailCredit.textContent = art.creditline || '—';
  if (detailLink) {
    if (art.source) {
      detailLink.href = art.source;
      detailLink.classList.remove('hidden');
    } else {
      detailLink.classList.add('hidden');
    }
  }
  renderRelated(art);
  detailEl.classList.remove('hidden');
  if (controls?.isLocked) controls.unlock();
}

// ---- 相关作品 ----
// 同作者优先，不够再用同展厅的补齐。点一下直接走到那幅画前面。
const relatedBox = document.getElementById('detail-related');
const relatedList = document.getElementById('detail-related-list');

function renderRelated(art) {
  if (!relatedBox || !relatedList) return;

  // art 是从 3D 场景的 userData 里拿的，不带 roomId，用 id 回索引里查
  const self = artIndex.find((a) => a.id === art.id);
  const roomId = self?.roomId;

  const sameArtist = artIndex.filter(
    (a) => a.id !== art.id && art.artist && a.artist === art.artist,
  );
  const taken = new Set(sameArtist.map((a) => a.id));
  const sameRoom = roomId
    ? artIndex.filter((a) => a.id !== art.id && a.roomId === roomId && !taken.has(a.id))
    : [];
  const picks = [...sameArtist, ...sameRoom].slice(0, 4);

  if (!picks.length) {
    relatedBox.classList.add('hidden');
    return;
  }

  relatedList.innerHTML = '';
  for (const p of picks) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'related-card';
    btn.title = `${p.title || '无题'} · ${p.artist || '佚名'}`;
    const img = document.createElement('img');
    // 相关作品的卡片只有 78×56，直接复用墙上已经加载好的 640 小图 —— 零请求。
    // 墙上还没到位就用同一个 URL，等流式加载完成后浏览器缓存会命中。
    const wall = paintingTextureCache.get(p.image);
    img.src = wall?.image?.src || artWallUrl(p.image);
    img.alt = '';
    img.loading = 'lazy';
    const cap = document.createElement('span');
    cap.textContent = p.title || '无题';
    btn.append(img, cap);
    btn.addEventListener('click', () => goToArtwork(p));
    relatedList.appendChild(btn);
  }
  relatedBox.classList.remove('hidden');
}

// 站到画心外侧，面朝画。距离从 2.4m 起试，走不通就往前挪。
// 走过去靠 startGlide 滑移，不瞬移。
function goToArtwork(a) {
  closeArtDetail();

  const p = a.position;
  if (!p) return;
  const nx = Math.sin(a.rotY);
  const nz = Math.cos(a.rotY);
  let x = p.x + nx * 2.4;
  let z = p.z + nz * 2.4;
  for (let d = 2.4; d >= 1.0; d -= 0.2) {
    const tx = p.x + nx * d;
    const tz = p.z + nz * d;
    if (!plan || plan.canStand(tx, tz)) { x = tx; z = tz; break; }
  }

  startGlide(x, z, Math.atan2(nx, nz));
}

function closeArtDetail() {
  if (!detailEl || !detailOpen) return;
  detailOpen = false;
  detailEl.classList.add('hidden');
  if (controls) controls.lock();
}

function renderGalleryMenu() {
  if (!galleryCards) return;
  galleryCards.innerHTML = '';
  plan.galleries.forEach((g, i) => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
      <div class="gc-icon">${GALLERY_ICONS[i] || '🏛'}</div>
      <div class="gc-name">${g.name}</div>
      <div class="gc-arts">${g.arts?.length || 0} 幅画作 · ${g.w} × ${g.d} m</div>
      <span class="gc-enter">走过去 →</span>`;
    card.addEventListener('click', () => jumpToGallery(g));
    galleryCards.appendChild(card);
  });
}

function jumpToGallery(gallery) {
  const corridor = plan.rooms.find((r) => r.kind === 'corridor');
  const op = corridor
    ? plan.openings.find((o) => o.rooms.includes(gallery.id) && o.rooms.includes(corridor.id))
    : null;

  let x = gallery.cx;
  let z = gallery.cz;
  if (op) {
    const inset = plan.wallThickness + 1.4;
    if (op.axis === 'x') {
      x = op.at + (gallery.cx > op.at ? inset : -inset);
      z = (op.from + op.to) / 2;
    } else {
      z = op.at + (gallery.cz > op.at ? inset : -inset);
      x = (op.from + op.to) / 2;
    }
  }
  const yaw = Math.atan2(-(gallery.cx - x), -(gallery.cz - z));
  galleryMenu.classList.add('hidden');
  startGlide(x, z, yaw);
  try {
    if (controls) controls.lock();
    else enterMobileMode();
  } catch {
    // 浏览器拒绝指针锁定时会抛错，拖动模式照样能用
  }
}

initControls({
  mobileControls,
  joystickBase,
  joystickThumb,
  lookBtn,
  mobileToast,
  canStand: (x, z) => plan.canStand(x, z),
});

initPlayer(bodyToggle);

galleryMenuBtn?.addEventListener('click', () => {
  galleryMenu.classList.toggle('hidden');
});

// 点列表外的空白处关闭
galleryMenu?.addEventListener('click', (e) => {
  if (e.target === galleryMenu) galleryMenu.classList.add('hidden');
});

detailClose?.addEventListener('click', closeArtDetail);
detailEl?.addEventListener('click', (e) => {
  if (e.target === detailEl) closeArtDetail();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') toggle();
  if (e.code === 'KeyM') toggleSound();
  if (e.code === 'KeyB') toggleMusicKey();
  if (e.code === 'KeyN') nextTrackKey();
  if (e.code === 'KeyH') toggleHelp();
    if (e.code === 'KeyE' && !glide) activate();
  if (e.code === 'Escape') {
    if (!helpPanel?.classList.contains('hidden')) toggleHelp(false);
    else if (detailOpen) closeArtDetail();
    else if (isSeated()) stand();
  }
});

// 浏览器要求用户手势之后才能出声，所以第一次点击/按键时才启动音频
let audioStarted = false;
const startAudio = () => {
  if (audioStarted) return;
  audioStarted = true;
  setAudioEnabled(true);
};
window.addEventListener('pointerdown', startAudio);
window.addEventListener('keydown', startAudio);

// 声音开关只留 M 键。
// 原来还有个右上角的 🔊 按钮，但它的定位样式被误写进了 @media 块里，
// 桌面端根本没生效 —— 按钮掉进文档流，在左上角变成个没背景的小图标。
// 与其修位置，不如直接去掉，桌面端按 M 更顺手。
function toggleSound() {
  startAudio();
  const isMuted = toggleMute();
  toast(isMuted ? '声音已关' : '声音已开');
}

// B 键：只切背景音乐，M 管的仍然是全部声音
function toggleMusicKey() {
  startAudio();
  const on = toggleMusic();
  toast(on ? '音乐已开' : '音乐已关');
  musicBtn?.classList.toggle('active', on);
}

// N 键 / ⏭ 按钮：下一首。第一首是本地生成的 pad，后面是 public/music/ 下的文件
async function nextTrackKey() {
  startAudio();
  if (isTrackLoading()) {
    toast('上一首还在载入…');
    return;
  }
  const r = await nextTrack();
  if (r.stale) return;   // 连按了 N，以最后一次为准
  toast(r.ok ? `正在播放：${r.track.title}` : `《${r.track.title}》没载进来，已回到合成氛围`);
}

// 操作说明面板。开场提示几秒后就没了，这里给个常驻入口（按钮或 H 键）。
function toggleHelp(force) {
  if (!helpPanel) return;
  const show = force ?? helpPanel.classList.contains('hidden');
  helpPanel.classList.toggle('hidden', !show);
  helpBtn?.classList.toggle('active', show);
  // 面板要能用鼠标点，所以打开时先退出指针锁定
  if (show && controls?.isLocked) controls.unlock();
}
helpBtn?.addEventListener('click', (e) => { e.stopPropagation(); toggleHelp(); });
helpClose?.addEventListener('click', () => toggleHelp(false));

initFlashlight(flashBtn, {
  onToggle: (isOn) => toast(isOn ? '手电筒已开' : '手电筒已关'),
});

// 移动端没有键盘，音乐开关做成一个和手电并排的按钮（B 键的等价物）
musicBtn?.classList.toggle('active', isMusicOn());
musicBtn?.addEventListener('click', () => toggleMusicKey());

// 切歌：桌面右上角的 ⏭ 和手机端动作区的 ⏭ 是同一个 class
nextTrackBtns.forEach((btn) => {
  btn.addEventListener('click', (e) => { e.stopPropagation(); nextTrackKey(); });
});

if (controls) {
  controls.addEventListener('unlock', () => {
    if (!detailOpen) galleryMenu.classList.remove('hidden');
  });
}

const clock = new THREE.Clock();
const prevPos = new THREE.Vector3();
let stepAccum = 0;
const STRIDE = 0.78;   // 一步大约 0.78m

// 上一次真正画出来的位姿。静止不动 + 没有 markDirty 就跳过 renderer.render，
// 站在展厅里发呆时 GPU 完全闲着（笔记本上最省电的一段）。
const renderedPose = { x: NaN, y: NaN, z: NaN, rx: NaN, ry: NaN, rz: NaN };

function poseChanged() {
  return camera.position.x !== renderedPose.x
    || camera.position.y !== renderedPose.y
    || camera.position.z !== renderedPose.z
    || camera.rotation.x !== renderedPose.rx
    || camera.rotation.y !== renderedPose.ry
    || camera.rotation.z !== renderedPose.rz;
}

function renderIfDirty() {
  const dirty = takeDirty();
  if (!dirty && !poseChanged() && !glide) return;
  renderedPose.x = camera.position.x;
  renderedPose.y = camera.position.y;
  renderedPose.z = camera.position.z;
  renderedPose.rx = camera.rotation.x;
  renderedPose.ry = camera.rotation.y;
  renderedPose.rz = camera.rotation.z;
  renderer.render(scene, camera);
}

// 按实际走过的距离触发脚步，和移动速度天然同步
function updateFootsteps() {
  const dx = camera.position.x - prevPos.x;
  const dz = camera.position.z - prevPos.z;
  const moved = Math.hypot(dx, dz);
  prevPos.copy(camera.position);
  // 滑移/菜单跳转会是一次较大的位移，排除掉，免得滑过去时一路响脚步
  if (glide || moved <= 0.0005 || moved > 1.5) return;
  stepAccum += moved;
  if (stepAccum >= STRIDE) {
    stepAccum = 0;
    const room = plan?.byId.get(currentRoomId);
    footstep(room?.materials?.floorType || 'checker');
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (glide) updateGlide(dt);
  else if (!menuOpen() && !detailOpen && !isSeated()) updateMovement(dt);
  // 视线拾取和手电瞄准读的是 camera.matrixWorld，而 three 只在 renderer.render()
  // 里更新相机的世界矩阵 —— 现在静止时可能连续很多帧不渲染，射线就会停在上一帧
  // 的位姿上（提示条会指着看不见的东西）。相机就一个节点，这里自己算一次。
  camera.updateMatrixWorld();
  updateRoom();
  updateRoomVisibility(clock.elapsedTime);
  updateMinimap(camera, currentRoomId, plan);
  if (!detailOpen && !glide) updateInteract(getVisRevision());
  updatePlayer();
  if (updateFlashlight(dt)) markDirty();
  updateFootsteps();
  stepWarmup();
  renderIfDirty();
}

function showFatal(err) {
  console.error('[art-museum] 启动失败:', err);
  showLoading(false);
  if (fatalEl) {
    fatalEl.classList.remove('hidden');
    const detail = fatalEl.querySelector('.fatal-detail');
    if (detail) detail.textContent = String(err?.message || err);
  }
}

async function bootstrap() {
  try {
    const data = await loadMuseum();
    plan = buildPlan(data);

    const built = buildMuseum(plan);
    lights = built.lights;
    roomSamples = built.roomSamples;

    // 抛光地板的环境反射（拍一次，不是每帧）
    applyFloorReflection(built.floorMats);

    // 场景建完了，冻结全部静态节点的矩阵（详见 room.js）
    freezeMuseumMatrices();

    // 建作品索引：详情浮层里点"相关作品"要能算出该站到哪儿。
    // 直接写回原对象（而不是做副本）—— 3D 场景里 canvas.userData.art
    // 挂的就是这些对象，写回去它才带着 roomId 和 rotY。
    artIndex = [];
    for (const room of plan.rooms) {
      for (const a of room.arts || []) {
        a.roomId = room.id;
        a.roomName = room.name;
        a.rotY = a.rotation?.y ?? 0;
        artIndex.push(a);
      }
    }

    placePlayer(plan.spawn.x, plan.spawn.z, plan.spawn.yaw);
    prevPos.copy(camera.position);
    currentRoomId = plan.roomAt(plan.spawn.x, plan.spawn.z)?.id ?? plan.rooms[0].id;
    applyLightBudget(currentRoomId);

    // 导览小地图
    initMinimap(plan, minimapCanvas, minimapRoom);
    minimapEl?.classList.remove('hidden');

    // 光线随时间（正午 → 闭馆）
    initDaylight(scene, ambient, built.coveMats, built.floorMats);
    daylightEl?.classList.remove('hidden');
    if (daylightRange) {
      const onTime = () => {
        const t = Number(daylightRange.value) / 1000;
        applyDaylight(t);
        if (daylightName) daylightName.textContent = daylightLabel(t);
        markDirty();
      };
      daylightRange.addEventListener('input', onTime);
      onTime();
    }

    renderGalleryMenu();
    animate();
    // 立刻开始预热各房间的光照 shader（每帧一个房间）。
    // 之前是等 40 张图加载完才开始，用户在加载期间走进展厅就会现场编译，卡一下。
    warmupQueue = plan.rooms.map((r) => r.id);

    initAudio({});

    initInteract({
      artTargets: built.artTargets,
      benches: built.benches,
      benchTargets: built.benchTargets,
      promptEl,
      canStand: (x, z) => plan.canStand(x, z),
      onOpenArt: openArtDetail,
      onSit: (b) => { sitSound(); toast(`已坐下 · ${b.roomName}`); },
      onStand: () => { sitSound(); toast('已起身'); },
    });

    // 开场提示只留几秒，之后彻底交给沉浸
    setTimeout(() => introHint?.classList.add('fade'), 6000);

    if (IS_MOBILE) mobileControls.style.display = 'none';

    // 画作在后台流式加载，每张到位就换上去，不阻塞首屏
    streamArtTextures(
      built.artSlots,
      (material, texture) => {
        // 只换贴图对象，不要 needsUpdate —— 那会强制重编译 shader，
        // 40 张图就是 40 次重编译，页面会一路卡到底
        material.map = texture;
        material.emissiveMap = texture;
        markDirty(); // 静止时靠它把新到的画刷上墙
      },
      (done, total) => {
        if (!progressEl) return;
        if (done >= total) {
          progressEl.classList.add('hidden');
        } else {
          progressEl.classList.remove('hidden');
          progressEl.textContent = `载入画作 ${done} / ${total}`;
        }
      },
    );
  } catch (err) {
    showFatal(err);
  }
}

window.addEventListener('beforeunload', disposeMuseum);

// 调试/自动化钩子：给截图验证和后续编辑器联动用
window.__artMuseum = {
  get plan() { return plan; },
  get camera() { return camera; },
  get lights() { return lights; },
  get renderer() { return renderer; },
  get activeLightCount() { return lights.filter((l) => l.visible).length; },
  get artIndex() { return artIndex; },
  get stats() {
    const i = renderer.info;
    return {
      可见灯: this.activeLightCount,
      灯预算: lightBudgetFor(currentRoomId),
      总灯数: lights.length,
      绘制调用: i.render.calls,
      三角面: i.render.triangles,
      可见厅: visibleRoomCount(),
      总厅数: plan?.rooms.length ?? 0,
      几何体: i.memory.geometries,
      贴图: i.memory.textures,
      着色器程序: i.programs?.length ?? 0,
      剔除版本: getVisRevision(),
    };
  },
  // 音频调试：rms 是 master 上的实时有效值（总静音≈0）
  audio: {
    rms: () => audioRms(),
    get musicOn() { return isMusicOn(); },
    get muted() { return isMuted(); },
    get track() { return currentTrack().id; },
    get trackTitle() { return currentTrack().title; },
    get trackLoading() { return isTrackLoading(); },
    tracks: () => trackList().map((t) => t.id),
    next: () => nextTrack(),
    debug: () => audioDebug(),
  },
  setView(x, z, yaw = 0, pitch = 0) {
    glide = null;
    camera.rotation.order = 'YXZ';
    camera.position.set(x, camera.position.y, z);
    camera.rotation.set(pitch, yaw, 0);
    currentRoomId = null;
    updateRoom();
  },
  standIn(roomId, yaw) {
    const r = plan?.byId.get(roomId);
    if (!r) return null;
    this.setView(r.cx, r.cz, yaw ?? 0, 0);
    return r;
  },
  jumpTo: jumpToGallery,
  // 自动化验证用：直接触发滑移/开详情，不走 UI
  glideToArt: goToArtwork,
  openArt: openArtDetail,
  get gliding() { return glide; },
  get elapsed() { return clock.elapsedTime; },
  get roomSamples() { return roomSamples; },
  get visPose() { return { ...visPose }; },
  setRoomCulling(on) { roomCulling = !!on; visPose.x = Infinity; visPose.at = -1; },
  get roomCulling() { return roomCulling; },
  previewPath(x, z) {
    const from = plan.roomAt(camera.position.x, camera.position.z);
    const to = plan.roomAt(x, z);
    return { from: from?.id, to: to?.id, pts: waypointsTo(x, z) };
  },
};

bootstrap();
