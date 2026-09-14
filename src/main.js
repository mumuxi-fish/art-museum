// Art Museum — 入口：装配各模块
//
// 整座馆是一张连续平面图，一次建好，玩家从门厅一路走进去，没有传送。

import * as THREE from 'three';
import { scene, camera, renderer } from './scene.js';
import { IS_MOBILE } from './config.js';
import { loadMuseum, streamArtTextures } from './loader.js';
import { buildPlan } from './plan.js';
import { buildMuseum, disposeMuseum } from './room.js';
import { initControls, controls, updateMovement, enterMobileMode } from './controls.js';
import { initPlayer, updatePlayer } from './player.js';
import { initFlashlight, updateFlashlight, toggle } from './flashlight.js';
import { initInteract, updateInteract, activate, isSeated, stand } from './interact.js';
import {
  initAudio, setAudioEnabled, toggleMute, footstep, sitSound, clickSound,
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
const soundBtn = document.getElementById('soundBtn');

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

// ---- 灯光预算 ----
//
// 全馆 65 盏灯，全开会把 forward rendering 的 shader 撑爆。
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
  if (roomLabel) {
    roomLabel.textContent = room.name;
    // 用一个短促的文字动画代替整屏闪黑：有"到了一个新厅"的提示，又不糊一下画面
    roomLabel.classList.remove('pop');
    void roomLabel.offsetWidth;
    roomLabel.classList.add('pop');
  }
  started = true;
}

// 作品详情浮层。打开时锁住走动，并且不要让指针解锁去弹展厅列表
function openArtDetail(art) {
  if (!detailEl) return;
  detailOpen = true;
  clickSound();
  if (detailImg) detailImg.src = `art/${art.image}`;
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
    img.src = `art/${p.image}`;
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

  placePlayer(x, z, Math.atan2(nx, nz));
  currentRoomId = null;
  updateRoom();
  prevPos.copy(camera.position);
  stepAccum = 0;
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
  placePlayer(x, z, yaw);
  currentRoomId = null;
  updateRoom();
  galleryMenu.classList.add('hidden');
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
  if (e.code === 'KeyM') soundBtn?.click();
  if (e.code === 'KeyE') activate();
  if (e.code === 'Escape') {
    if (detailOpen) closeArtDetail();
    else if (isSeated()) stand();
  }
});

// 浏览器要求用户手势之后才能出声，所以第一次点击/按键时才启动音频
let audioStarted = false;
const startAudio = () => {
  if (audioStarted) return;
  audioStarted = true;
  if (setAudioEnabled(true)) soundBtn?.classList.add('active');
};
window.addEventListener('pointerdown', startAudio);
window.addEventListener('keydown', startAudio);

soundBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  startAudio();
  const isMuted = toggleMute();
  soundBtn.textContent = isMuted ? '🔇' : '🔊';
  soundBtn.classList.toggle('active', !isMuted);
  toast(isMuted ? '声音已关' : '声音已开');
});

initFlashlight(flashBtn, {
  onToggle: (isOn) => toast(isOn ? '手电筒已开' : '手电筒已关'),
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

// 按实际走过的距离触发脚步，和移动速度天然同步
function updateFootsteps() {
  const dx = camera.position.x - prevPos.x;
  const dz = camera.position.z - prevPos.z;
  const moved = Math.hypot(dx, dz);
  prevPos.copy(camera.position);
  // 传送/菜单跳转会是一次很大的位移，排除掉
  if (moved <= 0.0005 || moved > 1.5) return;
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
  if (!menuOpen() && !detailOpen && !isSeated()) updateMovement(dt);
  updateRoom();
  if (!detailOpen) updateInteract();
  updatePlayer();
  updateFlashlight(dt);
  updateFootsteps();
  stepWarmup();
  renderer.render(scene, camera);
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

    // 抛光地板的环境反射（拍一次，不是每帧）
    applyFloorReflection(built.floorMats);

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
      几何体: i.memory.geometries,
      贴图: i.memory.textures,
      着色器程序: i.programs?.length ?? 0,
    };
  },
  setView(x, z, yaw = 0, pitch = 0) {
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
};

bootstrap();
