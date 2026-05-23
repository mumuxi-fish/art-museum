import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const ROOM_HEIGHT = 8;
const EYE_HEIGHT = 1.55;
const MOVE_SPEED = 5.5;
const DOOR_HALF_W = 1.6;
const DOOR_H = 3.8;
const DOOR_TRIGGER_DIST = 2.8;

const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) ||
  ('ontouchstart' in window && window.innerWidth <= 768);

let galleries = [];
let currentGalleryIndex = 0;
let roomGroup = null;
let doorWorldPos = new THREE.Vector3(0, 0, 0);
let currentLightFixtures = []; // { group, lightObj }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);
scene.fog = new THREE.FogExp2(0x0a0a0c, 0.018);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 120);
camera.position.set(0, EYE_HEIGHT, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const textureLoader = new THREE.TextureLoader();
const paintingTextureCache = new Map();

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

// 人物
let bodyGroup = null;
let bodyVisible = false;

function createBodyMesh() {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4b896, roughness: 0.7, metalness: 0.02 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x3d3d4a, roughness: 0.85, metalness: 0.03 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.7, 12), clothMat);
  torso.position.y = -0.6;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinMat);
  head.position.y = -0.12;
  head.castShadow = true;
  group.add(head);

  [1, -1].forEach(side => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), clothMat);
    arm.position.set(side * 0.28, -0.5, 0);
    arm.castShadow = true;
    group.add(arm);
  });

  group.visible = false;
  return group;
}

function toggleBody() {
  if (!bodyGroup) {
    bodyGroup = createBodyMesh();
    scene.add(bodyGroup);
  }
  bodyVisible = !bodyVisible;
  bodyGroup.visible = bodyVisible;
  bodyToggle.classList.toggle('active', bodyVisible);
}

bodyToggle.addEventListener('click', toggleBody);

// 桌面控制
const controls = isMobile ? null : new PointerLockControls(camera, document.body);

if (controls) {
  blocker.addEventListener('click', () => controls.lock());
  controls.addEventListener('lock', () => blocker.classList.add('hidden'));
  controls.addEventListener('unlock', () => blocker.classList.remove('hidden'));
} else {
  blocker.addEventListener('click', () => {
    blocker.classList.add('hidden');
    enterMobileMode();
  });
}

// 移动端控制
let mobileActive = false;
let mobileLookActive = true;
let euler = new THREE.Euler(0, 0, 0, 'YXZ');
let touchStart = null;
let lastTouchId = null;
let touchLast = null;

let joystickActive = false;
let joystickId = null;
let joystickOrigin = { x: 0, y: 0 };
let joystickValue = { x: 0, y: 0 };
const JOYSTICK_MAX_R = 62;

function enterMobileMode() {
  if (mobileActive) return;
  mobileActive = true;
  mobileControls.style.display = 'block';
  euler.setFromQuaternion(camera.quaternion);
  camera.rotation.order = 'YXZ';
  showToast('拖动屏幕环顾四周，摇杆移动');

  document.addEventListener('touchstart', onTouchStart, { passive: false });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd);
  document.addEventListener('touchcancel', onTouchEnd);

  lookBtn.classList.add('active');
  renderer.domElement.addEventListener('touchstart', onCanvasTouch, { passive: false });
}

function showToast(msg, duration = 2500) {
  mobileToast.textContent = msg;
  mobileToast.hidden = false;
  mobileToast.classList.add('show');
  clearTimeout(mobileToast._timeout);
  mobileToast._timeout = setTimeout(() => {
    mobileToast.classList.remove('show');
    setTimeout(() => { mobileToast.hidden = true; }, 300);
  }, duration);
}

function onCanvasTouch(e) {
  if (!mobileActive) return;
  for (const touch of e.changedTouches) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el === renderer.domElement && !el.closest('#joystickZone') && !el.closest('#actionButtons')) {
      e.preventDefault();
    }
  }
}

function onTouchStart(e) {
  if (!mobileActive) return;
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.closest('#joystickZone')) {
      joystickActive = true;
      joystickId = touch.identifier;
      const rect = joystickBase.getBoundingClientRect();
      joystickOrigin.x = rect.left + rect.width / 2;
      joystickOrigin.y = rect.top + rect.height / 2;
      updateJoystick(touch.clientX, touch.clientY);
      continue;
    }
    if (el && el.closest('#actionButtons')) continue;
    if (mobileLookActive) {
      touchStart = { x: touch.clientX, y: touch.clientY };
      lastTouchId = touch.identifier;
      touchLast = { x: touch.clientX, y: touch.clientY };
    }
  }
}

function onTouchMove(e) {
  if (!mobileActive) return;
  e.preventDefault();
  for (const touch of e.changedTouches) {
    if (joystickActive && touch.identifier === joystickId) {
      updateJoystick(touch.clientX, touch.clientY);
      continue;
    }
    if (mobileLookActive && touch.identifier === lastTouchId && touchStart) {
      const dx = touch.clientX - touchLast.x;
      const dy = touch.clientY - touchLast.y;
      const sensitivity = 0.003;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= dx * sensitivity;
      euler.x -= dy * sensitivity;
      euler.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, euler.x));
      camera.quaternion.setFromEuler(euler);
      touchLast = { x: touch.clientX, y: touch.clientY };
    }
  }
}

function onTouchEnd(e) {
  if (!mobileActive) return;
  for (const touch of e.changedTouches) {
    if (touch.identifier === joystickId) {
      joystickActive = false;
      joystickId = null;
      joystickValue.x = 0;
      joystickValue.y = 0;
      joystickThumb.style.transform = 'translate(0px, 0px)';
    }
    if (touch.identifier === lastTouchId) {
      touchStart = null;
      lastTouchId = null;
      touchLast = null;
    }
  }
}

function updateJoystick(cx, cy) {
  const dx = cx - joystickOrigin.x;
  const dy = cy - joystickOrigin.y;
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(dist, JOYSTICK_MAX_R);
  const angle = Math.atan2(dy, dx);
  const tx = Math.cos(angle) * clamped;
  const ty = Math.sin(angle) * clamped;
  joystickThumb.style.transform = `translate(${tx}px, ${ty}px)`;
  joystickValue.x = dx / JOYSTICK_MAX_R;
  joystickValue.y = dy / JOYSTICK_MAX_R;
  joystickValue.x = Math.max(-1, Math.min(1, joystickValue.x));
  joystickValue.y = Math.max(-1, Math.min(1, joystickValue.y));
}

lookBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  mobileLookActive = !mobileLookActive;
  if (mobileLookActive) {
    lookBtn.classList.add('active');
    showToast('环顾模式：拖动屏幕旋转视角');
  } else {
    lookBtn.classList.remove('active');
    showToast('环顾已锁定，摇杆移动');
  }
});

doorBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (nearDoor) goThroughDoor();
});

// 加载展馆
async function loadGalleries() {
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

// ── 灯具3D模型 ──
function createCeilingLightFixture(color = '#fff5e8') {
  const group = new THREE.Group();
  const c = new THREE.Color(color);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.4 }),
  );
  base.position.y = -0.04;
  base.castShadow = true;
  group.add(base);

  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({
      color: c, roughness: 0.5, metalness: 0.1,
      transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    }),
  );
  shade.rotation.x = Math.PI;
  shade.position.y = -0.35;
  group.add(shade);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 12),
    new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.1,
    }),
  );
  bulb.position.y = -0.2;
  group.add(bulb);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.03, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.5 }),
  );
  ring.position.y = -0.65;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  return group;
}

function createWallLightFixture(color = '#ffe8d0') {
  const group = new THREE.Group();
  const c = new THREE.Color(color);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.6 }),
  );
  plate.position.z = 0.03;
  group.add(plate);

  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.5 }),
  );
  arm.position.set(0, -0.1, 0.18);
  arm.rotation.x = 0.4;
  group.add(arm);

  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.25, 12),
    new THREE.MeshStandardMaterial({
      color: c, roughness: 0.4, metalness: 0.1,
      transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    }),
  );
  shade.position.set(0, -0.22, 0.35);
  shade.rotation.x = -0.2;
  group.add(shade);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 10),
    new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.1,
    }),
  );
  bulb.position.set(0, -0.18, 0.3);
  group.add(bulb);

  return group;
}

// 地板纹理
function makeFloorTexture(darkHex, lightHex, roomHalf, type = 'checker') {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const dark = new THREE.Color(darkHex);
  const light = new THREE.Color(lightHex);

  if (type === 'solid') {
    ctx.fillStyle = `#${dark.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
  } else if (type === 'stripes') {
    const stripeH = size / 16;
    for (let y = 0; y < 16; y++) {
      ctx.fillStyle = (y % 2 === 0) ? `#${dark.getHexString()}` : `#${light.getHexString()}`;
      ctx.fillRect(0, y * stripeH, size, stripeH);
    }
  } else if (type === 'wood') {
    const plankW = size / 5;
    ctx.fillStyle = `#${dark.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5; i++) {
      const baseX = i * plankW;
      const shade = new THREE.Color(darkHex).lerp(new THREE.Color(lightHex), 0.15 + Math.random() * 0.35);
      ctx.fillStyle = `#${shade.getHexString()}`;
      ctx.fillRect(baseX + 1, 0, plankW - 2, size);
      for (let y = 0; y < size; y += 12 + Math.random() * 20) {
        ctx.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.06})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(baseX + 2, y);
        for (let x = baseX + 2; x < baseX + plankW - 2; x += 4) {
          ctx.lineTo(x, y + (Math.random() - 0.5) * 4);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(baseX, 0, 2, size);
    }
  } else {
    const cell = size / 10;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? `#${dark.getHexString()}` : `#${light.getHexString()}`;
        ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(roomHalf / 2.5, roomHalf / 2.5);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function loadPaintingTexture(imagePath, hue = 0.5) {
  if (!imagePath) return Promise.resolve(makeFallbackTexture(hue));
  if (paintingTextureCache.has(imagePath)) return Promise.resolve(paintingTextureCache.get(imagePath));
  return new Promise((resolve) => {
    textureLoader.load(
      `/art/${imagePath}`,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        paintingTextureCache.set(imagePath, tex);
        resolve(tex);
      },
      undefined,
      () => {
        const fallback = makeFallbackTexture(hue);
        paintingTextureCache.set(imagePath, fallback);
        resolve(fallback);
      },
    );
  });
}

function makeFallbackTexture(hue) {
  const w = 256, h = 320;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, `hsl(${(hue * 360) | 0}, 62%, 48%)`);
  grd.addColorStop(0.45, `hsl(${(hue * 360 + 40) | 0}, 45%, 58%)`);
  grd.addColorStop(1, `hsl(${(hue * 360 + 120) | 0}, 35%, 42%)`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, Math.random() * h);
    ctx.quadraticCurveTo(Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function clearRoom() {
  if (roomGroup) {
    scene.remove(roomGroup);
    roomGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m.userData?.keepMap) { m.map = null; }
          else if (m.map) { m.map.dispose(); }
          m.dispose();
        });
      }
    });
    roomGroup = null;
  }

  // 清理灯具光源（它们不在 roomGroup 中）
  currentLightFixtures.forEach(({ lightObj }) => {
    if (lightObj) {
      if (lightObj.target) scene.remove(lightObj.target);
      scene.remove(lightObj);
    }
  });
  currentLightFixtures = [];
}

function buildWallSegment(width, height, depth, color) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildRoom(galleryData) {
  clearRoom();

  const { materials, dimensions, arts, lights, ambientIntensity } = galleryData;
  const ROOM_HALF = dimensions.roomHalfWidth || 10;
  const wallDepth = dimensions.wallDepth || 0.35;

  roomGroup = new THREE.Group();
  scene.add(roomGroup);

  // 环境光
  const ambient = new THREE.AmbientLight(0xffffff, ambientIntensity ?? 0.35);
  ambient.name = '__ambient';
  scene.add(ambient);
  currentLightFixtures.push({ group: null, lightObj: ambient });

  // 地板
  const floorType = materials.floorType || 'checker';
  const floorTex = makeFloorTexture(materials.floorDark, materials.floorLight, ROOM_HALF, floorType);
  const floorGeo = new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.04 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  // 天花板
  const ceilGeo = new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2);
  const ceilMat = new THREE.MeshStandardMaterial({ color: materials.ceilingColor || materials.wallColor, roughness: 1, metalness: 0 });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM_HEIGHT;
  ceil.receiveShadow = true;
  roomGroup.add(ceil);

  const W = ROOM_HALF * 2;

  // 四面墙
  const left = buildWallSegment(wallDepth, ROOM_HEIGHT, W, materials.wallColor);
  left.position.set(-ROOM_HALF + wallDepth / 2, ROOM_HEIGHT / 2, 0);
  roomGroup.add(left);

  const right = buildWallSegment(wallDepth, ROOM_HEIGHT, W, materials.wallColor);
  right.position.set(ROOM_HALF - wallDepth / 2, ROOM_HEIGHT / 2, 0);
  roomGroup.add(right);

  const back = buildWallSegment(W, ROOM_HEIGHT, wallDepth, materials.wallColor);
  back.position.set(0, ROOM_HEIGHT / 2, -ROOM_HALF + wallDepth / 2);
  roomGroup.add(back);

  // 前墙（带门）
  const doorY1 = DOOR_H;
  const lintelH = ROOM_HEIGHT - DOOR_H;
  const sideW = (ROOM_HALF * 2 - DOOR_HALF_W * 2) / 2;

  const frontLeft = buildWallSegment(sideW, ROOM_HEIGHT, wallDepth, materials.wallColor);
  frontLeft.position.set(-ROOM_HALF + sideW / 2, ROOM_HEIGHT / 2, ROOM_HALF - wallDepth / 2);
  roomGroup.add(frontLeft);

  const frontRight = buildWallSegment(sideW, ROOM_HEIGHT, wallDepth, materials.wallColor);
  frontRight.position.set(ROOM_HALF - sideW / 2, ROOM_HEIGHT / 2, ROOM_HALF - wallDepth / 2);
  roomGroup.add(frontRight);

  const lintel = buildWallSegment(DOOR_HALF_W * 2, lintelH, wallDepth, materials.wallColor);
  lintel.position.set(0, doorY1 + lintelH / 2, ROOM_HALF - wallDepth / 2);
  roomGroup.add(lintel);

  // 门框
  const frameMat = new THREE.MeshStandardMaterial({ color: materials.accentColor, roughness: 0.65, metalness: 0.15 });
  const doorFrameT = 0.12;
  const dfW = DOOR_HALF_W * 2 + doorFrameT * 2;
  const dfH = DOOR_H + doorFrameT;

  const doorFrame = new THREE.Group();
  const topF = new THREE.Mesh(new THREE.BoxGeometry(dfW, doorFrameT, 0.2), frameMat);
  topF.position.set(0, DOOR_H + doorFrameT / 2, ROOM_HALF - 0.2);
  const sideF1 = new THREE.Mesh(new THREE.BoxGeometry(doorFrameT, dfH, 0.2), frameMat);
  sideF1.position.set(-DOOR_HALF_W - doorFrameT / 2, dfH / 2, ROOM_HALF - 0.2);
  const sideF2 = new THREE.Mesh(new THREE.BoxGeometry(doorFrameT, dfH, 0.2), frameMat);
  sideF2.position.set(DOOR_HALF_W + doorFrameT / 2, dfH / 2, ROOM_HALF - 0.2);
  doorFrame.add(topF, sideF1, sideF2);
  doorFrame.traverse((m) => {
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  roomGroup.add(doorFrame);

  // 门板
  const doorPanelGeo = new THREE.BoxGeometry(DOOR_HALF_W * 2 - 0.08, DOOR_H - 0.08, 0.08);
  const doorPanelMat = new THREE.MeshStandardMaterial({ color: materials.doorColor || 0x3d3530, roughness: 0.55, metalness: 0.08 });
  const doorPanel = new THREE.Mesh(doorPanelGeo, doorPanelMat);
  doorPanel.position.set(-DOOR_HALF_W * 0.35, DOOR_H / 2, ROOM_HALF - 0.28);
  doorPanel.rotation.y = 0.35;
  doorPanel.castShadow = true;
  roomGroup.add(doorPanel);

  doorWorldPos.set(0, DOOR_H / 2, ROOM_HALF - 0.05);

  // 画作
  const frameWood = new THREE.MeshStandardMaterial({
    color: materials.frameColor || 0x4a3f36,
    roughness: materials.frameRoughness || 0.7,
    metalness: materials.frameMetalness || 0.05,
  });

  function snapToWall(wall) {
    const offset = wallDepth + 0.02;
    switch (wall) {
      case 'left':  return { x: -ROOM_HALF + offset, z: 0, rotY: Math.PI / 2 };
      case 'right': return { x: ROOM_HALF - offset,  z: 0, rotY: -Math.PI / 2 };
      case 'front': return { x: 0, z: ROOM_HALF - offset,  rotY: Math.PI };
      default:      return { x: 0, z: -ROOM_HALF + offset, rotY: 0 };
    }
  }

  if (arts) {
    arts.forEach((a) => {
      const artTex = paintingTextureCache.get(a.image || null) || makeFallbackTexture(a.hue || 0.5);
      const bw = a.size.width + 0.16;
      const bh = a.size.height + 0.16;

      const frame = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), frameWood);
      const canvasMat = new THREE.MeshStandardMaterial({
        map: artTex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
      });
      canvasMat.userData.keepMap = true;
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(a.size.width, a.size.height), canvasMat);
      canvas.position.z = 0.04;

      const grp = new THREE.Group();
      grp.add(frame, canvas);

      if (a.wall) {
        const snap = snapToWall(a.wall);
        grp.position.set(
          a.position.x ?? snap.x,
          a.position.y,
          a.position.z ?? snap.z,
        );
        grp.rotation.order = 'YXZ';
        grp.rotation.y = a.rotation.y ?? snap.rotY;
        grp.rotation.z = a.rotation.z || 0;
      } else {
        grp.position.set(a.position.x, a.position.y, a.position.z);
        if (grp.position.x < -ROOM_HALF + 0.2) grp.position.x = -ROOM_HALF + wallDepth + 0.02;
        if (grp.position.x > ROOM_HALF - 0.2) grp.position.x = ROOM_HALF - wallDepth - 0.02;
        if (grp.position.z < -ROOM_HALF + 0.2) grp.position.z = -ROOM_HALF + wallDepth + 0.02;
        grp.rotation.order = 'YXZ';
        grp.rotation.y = a.rotation.y || 0;
        grp.rotation.z = a.rotation.z || 0;
      }

      frame.castShadow = true;
      canvas.castShadow = true;
      roomGroup.add(grp);
    });
  }

  // ── 灯具 ──
  if (lights) {
    lights.forEach((ld) => {
      const useSpot = ld.type === 'ceiling';
      const fixtureGroup = useSpot ? createCeilingLightFixture(ld.color) : createWallLightFixture(ld.color);

      const color = new THREE.Color(ld.color);
      let lightObj;

      if (useSpot) {
        lightObj = new THREE.SpotLight(color, ld.enabled ? ld.intensity : 0, ld.range || 14, ld.angle || 1.2, ld.penumbra || 0.4, 2);
        lightObj.target.position.set(0, 0, -1);
        lightObj.castShadow = true;
        lightObj.shadow.mapSize.set(1024, 1024);
        lightObj.shadow.bias = -0.001;
      } else {
        lightObj = new THREE.SpotLight(color, ld.enabled ? ld.intensity : 0, ld.range || 10, ld.angle || 1.0, ld.penumbra || 0.6, 2);
        lightObj.target.position.set(0, 0, -1);
        lightObj.castShadow = false;
      }

      const pos = ld.position || { x: 0, y: 7.5, z: 0 };
      fixtureGroup.position.set(pos.x, pos.y, pos.z);
      lightObj.position.copy(fixtureGroup.position);

      if (ld.rotation) {
        fixtureGroup.rotation.set(ld.rotation.x || 0, ld.rotation.y || 0, ld.rotation.z || 0);
      }

      const dir = new THREE.Vector3(0, -1, 0);
      dir.applyQuaternion(fixtureGroup.quaternion);
      lightObj.target.position.copy(fixtureGroup.position).add(dir);

      scene.add(lightObj);
      scene.add(lightObj.target);
      roomGroup.add(fixtureGroup);
      currentLightFixtures.push({ group: fixtureGroup, lightObj });
    });
  }

  galleryLabel.textContent = galleryData.name;
}

// 预加载
async function preloadPaintings() {
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

// 键盘
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
let nearDoor = false;

window.addEventListener('keydown', (e) => {
  if (e.code in keys) keys[e.code] = true;
  if (e.code === 'KeyE' && controls?.isLocked && nearDoor) {
    goThroughDoor();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code in keys) keys[e.code] = false;
});

function goThroughDoor() {
  currentGalleryIndex = (currentGalleryIndex + 1) % galleries.length;
  loadGallery(currentGalleryIndex);
  const body = controls ? controls.object : camera;
  body.position.set(0, EYE_HEIGHT, 6);
  if (!isMobile) {
    body.rotation.set(0, 0, 0);
  } else {
    euler.set(0, 0, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  }
}

function collide(pos) {
  const margin = 0.35;
  const g = galleries[currentGalleryIndex];
  const ROOM_HALF = g?.dimensions?.roomHalfWidth || 10;
  const hx = ROOM_HALF - margin;
  const hz = ROOM_HALF - margin;
  if (pos.x < -hx || pos.x > hx) return false;
  if (pos.z < -hz) return false;
  if (pos.z > hz) {
    const inDoorX = Math.abs(pos.x) <= DOOR_HALF_W + 0.25;
    const inDoorY = pos.y >= 0 && pos.y <= DOOR_H + 0.2;
    if (inDoorX && inDoorY) return true;
    return false;
  }
  return true;
}

// 主循环
const clock = new THREE.Clock();
const moveDir = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  moveDir.set(0, 0, 0);

  if (isMobile && mobileActive) {
    if (Math.abs(joystickValue.x) > 0.08 || Math.abs(joystickValue.y) > 0.08) {
      moveDir.set(-joystickValue.x, 0, joystickValue.y);
      moveDir.applyQuaternion(camera.quaternion);
      moveDir.y = 0;
      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        const step = MOVE_SPEED * dt;
        const p = camera.position;
        const ox = p.x;
        p.x += moveDir.x * step;
        if (!collide(p)) p.x = ox;
        const oz = p.z;
        p.z += moveDir.z * step;
        if (!collide(p)) p.z = oz;
      }
    }
  } else if (controls?.isLocked) {
    if (keys.KeyW) moveDir.z -= 1;
    if (keys.KeyS) moveDir.z += 1;
    if (keys.KeyA) moveDir.x -= 1;
    if (keys.KeyD) moveDir.x += 1;
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      moveDir.applyQuaternion(camera.quaternion);
      moveDir.y = 0;
      moveDir.normalize();
      const step = MOVE_SPEED * dt;
      const p = controls.object.position;
      const ox = p.x;
      p.x += moveDir.x * step;
      if (!collide(p)) p.x = ox;
      const oz = p.z;
      p.z += moveDir.z * step;
      if (!collide(p)) p.z = oz;
    }
  }

  if (isMobile && mobileActive) {
    camera.position.y = EYE_HEIGHT;
  } else if (controls?.isLocked) {
    controls.object.position.y = EYE_HEIGHT;
  }

  const bodyPos = (controls?.isLocked) ? controls.object.position : camera.position;
  const dist = Math.hypot(bodyPos.x - doorWorldPos.x, bodyPos.z - doorWorldPos.z);
  const g = galleries[currentGalleryIndex];
  const ROOM_HALF = g?.dimensions?.roomHalfWidth || 10;
  nearDoor = dist < DOOR_TRIGGER_DIST && bodyPos.z > ROOM_HALF - 6;

  if (isMobile) {
    doorPromptMobile.hidden = !nearDoor;
    doorBtn.hidden = !nearDoor;
  } else {
    doorPrompt.hidden = !(nearDoor && controls?.isLocked);
  }

  if (bodyGroup && bodyGroup.visible) {
    bodyGroup.position.copy(camera.position);
    bodyGroup.quaternion.copy(camera.quaternion);
  }

  renderer.render(scene, camera);
}

function loadGallery(index) {
  if (index < 0 || index >= galleries.length) return;
  const galleryData = galleries[index];
  buildRoom(galleryData);
  galleryLabel.textContent = galleryData.name;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 启动
async function bootstrap() {
  await loadGalleries();
  if (galleries.length > 0) {
    await preloadPaintings();
    loadGallery(0);
  }
  animate();

  if (isMobile) {
    mobileControls.style.display = 'none';
  }
}

bootstrap();
