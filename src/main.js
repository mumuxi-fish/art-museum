// Art Museum — 入口:装配各模块
import { scene, camera, renderer } from './scene.js';
import { IS_MOBILE, EYE_HEIGHT } from './config.js';
import { galleries, loadGalleries, preloadPaintings } from './loader.js';
import { buildRoom, getRoomHalfWidth } from './room.js';
import { initControls, controls, updateMovement } from './controls.js';
import { initPlayer, updatePlayer } from './player.js';
import { createDustParticles, updateDustParticles } from './effects.js';

// DOM
const blocker = document.getElementById('blocker');
const doorPrompt = document.getElementById('doorPrompt');
const doorPromptMobile = document.getElementById('doorPromptMobile');
const galleryLabel = document.getElementById('galleryLabel');
const mobileControls = document.getElementById('mobileControls');
const joystickBase = document.getElementById('joystickBase');
const joystickThumb = document.getElementById('joystickThumb');
const doorBtn = document.getElementById('doorBtn');
const lookBtn = document.getElementById('lookBtn');
const mobileToast = document.getElementById('mobileToast');
const bodyToggle = document.getElementById('bodyToggle');

let currentGalleryIndex = 0;

function loadGallery(index) {
  if (index < 0 || index >= galleries.length) return;
  buildRoom(galleries[index]);
  galleryLabel.textContent = galleries[index].name;
}

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
  blocker,
  mobileControls,
  joystickBase,
  joystickThumb,
  doorPrompt,
  doorPromptMobile,
  doorBtn,
  lookBtn,
  mobileToast,
  onDoorEnter: goThroughDoor,
  getRoomHalf: () => getRoomHalfWidth(galleries[currentGalleryIndex]),
});

initPlayer(bodyToggle);

// 主循环
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateMovement(dt);
  updatePlayer();
  updateDustParticles(dt);
  renderer.render(scene, camera);
}

// 启动
async function bootstrap() {
  await loadGalleries();
  if (galleries.length > 0) {
    await preloadPaintings();
    loadGallery(0);
  }
  createDustParticles();
  animate();

  if (IS_MOBILE) {
    mobileControls.style.display = 'none';
  }
}

bootstrap();
