// Art Museum — 入口:装配各模块
import * as THREE from 'three';
import { scene, camera, renderer } from './scene.js';
import { IS_MOBILE, EYE_HEIGHT } from './config.js';
import { galleries, loadGalleries, preloadPaintings } from './loader.js';
import { buildRoom, getRoomHalfWidth } from './room.js';
import { initControls, controls, updateMovement, enterMobileMode } from './controls.js';
import { initPlayer, updatePlayer } from './player.js';
import { createDustParticles, updateDustParticles } from './effects.js';
import { initFlashlight, updateFlashlight, toggle } from './flashlight.js';

// DOM
const galleryLabel = document.getElementById('galleryLabel');
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

let currentGalleryIndex = 0;

// 展厅菜单图标
const GALLERY_ICONS = ['🌅', '☀️', '⬜', '🌌', '🌸', '🏛', '🎨', '🌿', '🔥', '💧'];

function loadGallery(index) {
  if (index < 0 || index >= galleries.length) return;
  buildRoom(galleries[index]);
  galleryLabel.textContent = galleries[index].name;
}

// 渲染展厅选择菜单
function renderGalleryMenu() {
  galleryCards.innerHTML = '';
  galleries.forEach((g, i) => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
      <div class="gc-icon">${GALLERY_ICONS[i] || '🏛'}</div>
      <div class="gc-name">${g.name}</div>
      <div class="gc-arts">${g.arts?.length || 0} 幅画作</div>
      <span class="gc-enter">进入 →</span>`;
    card.addEventListener('click', () => enterGallery(i));
    galleryCards.appendChild(card);
  });
}

// 进入指定展厅
function enterGallery(index) {
  if (index < 0 || index >= galleries.length) return;
  currentGalleryIndex = index;
  galleryMenu.classList.add('hidden');
  loadGallery(index);
  if (controls) {
    controls.lock();
  } else {
    enterMobileMode();
  }
}

// 门自动传送(顺序切换下一展厅)
function goThroughDoor() {
  currentGalleryIndex = (currentGalleryIndex + 1) % galleries.length;
  loadGallery(currentGalleryIndex);
  const body = controls ? controls.object : camera;
  body.position.set(0, EYE_HEIGHT, 6);
  if (!IS_MOBILE) {
    body.rotation.set(0, 0, 0);
  } else {
    camera.quaternion.set(0, 0, 0, 1);
  }
}

initControls({
  mobileControls,
  joystickBase,
  joystickThumb,
  lookBtn,
  mobileToast,
  onDoorEnter: goThroughDoor,
  getRoomHalf: () => getRoomHalfWidth(galleries[currentGalleryIndex]),
});

initPlayer(bodyToggle);

// 🏛 菜单按钮:打开展厅选择菜单(桌面端需先按 ESC 退出指针锁定)
galleryMenuBtn.addEventListener('click', () => {
  galleryMenu.classList.remove('hidden');
});

// F 键手电筒开关(桌面)
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') toggle();
});

initFlashlight(flashBtn);

// 桌面端 ESC 退出指针锁定 → 重新显示菜单
if (controls) {
  controls.addEventListener('unlock', () => {
    galleryMenu.classList.remove('hidden');
  });
}

// 主循环
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateMovement(dt);
  updatePlayer();
  updateFlashlight();
  updateDustParticles(dt);
  renderer.render(scene, camera);
}

// 启动:加载数据 → 渲染菜单 → 展示选择界面
async function bootstrap() {
  await loadGalleries();
  if (galleries.length > 0) {
    await preloadPaintings();
    renderGalleryMenu();
  }
  createDustParticles();
  animate();

  if (IS_MOBILE) {
    mobileControls.style.display = 'none';
  }
}

bootstrap();
