import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const ROOM_HEIGHT = 8;
const DOOR_HALF_W = 1.6;
const DOOR_H = 3.8;

let scene, camera, renderer, orbit, transform;
let roomGroup, canvasEl;
let selectedObject = null;
let selectionType = null; // 'painting' | 'light' | 'wall' | 'floor' | 'ceiling' | null
let selectionData = null;
let galleryData = null;
let toolMode = 'select';
let paintingMeshes = [];
let lightMeshes = []; // { group, lightObj, data }
let groups = []; // { id, name, items: ['art-1', 'light-3'], groupObj: THREE.Group }
let wallGroup, floorMesh, ceilingMesh, accentGroup;
let textureLoader, paintingCache = new Map();
let onSelectionChange = null;

// ── 初始化 ──
export function init3DEditor(container, onSelect) {
  onSelectionChange = onSelect;
  canvasEl = document.createElement('canvas');
  canvasEl.style.cssText = 'display:block;width:100%;height:100%;';
  container.appendChild(canvasEl);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0c);

  const w = container.clientWidth, h = container.clientHeight;
  camera = new THREE.PerspectiveCamera(60, w / Math.max(h, 1), 0.1, 100);
  camera.position.set(8, 5, 12);
  camera.lookAt(0, 3, 0);

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  textureLoader = new THREE.TextureLoader();

  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 3, 0);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI * 0.7;
  orbit.minDistance = 3;
  orbit.maxDistance = 25;
  orbit.update();

  transform = new TransformControls(camera, renderer.domElement);
  transform.setMode('translate');
  transform.setSize(0.8);
  transform.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
  });
  transform.addEventListener('objectChange', () => {
    if (selectedObject && (selectionType === 'painting' || selectionType === 'light')) {
      syncPositionToData();
      notifySelection();
    }
  });

  // 基础场景灯光（编辑器内建，不出现在灯具列表中）
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  ambient.name = '__editor_ambient';
  scene.add(ambient);

  const editorDir = new THREE.DirectionalLight(0xffffff, 0.3);
  editorDir.position.set(10, 12, 8);
  editorDir.name = '__editor_dir';
  scene.add(editorDir);

  // 网格参考
  const grid = new THREE.GridHelper(20, 20, 0x333333, 0x1a1a1a);
  grid.position.y = 0.01;
  scene.add(grid);

  // 射线点击
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let clickStart = { x: 0, y: 0 };
  let mouseDown = false;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    clickStart.x = e.clientX;
    clickStart.y = e.clientY;
    mouseDown = true;
  });

  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!mouseDown) return;
    mouseDown = false;
    const dx = e.clientX - clickStart.x;
    const dy = e.clientY - clickStart.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) return; // drag, not click
    if (transform.dragging) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const targets = [];
    paintingMeshes.forEach(({ group }) => {
      group.children.forEach((child) => { if (child.isMesh) targets.push(child); });
    });
    lightMeshes.forEach(({ group }) => {
      group.children.forEach((child) => { if (child.isMesh) targets.push(child); });
    });

    // Also add any group wrapper meshes
    groups.forEach((g) => {
      if (g.groupObj) {
        g.groupObj.children.forEach((child) => {
          if (child.isMesh) targets.push(child);
        });
      }
    });

    if (wallGroup) wallGroup.children.forEach((c) => { if (c.isMesh) targets.push(c); });
    if (floorMesh) targets.push(floorMesh);
    if (ceilingMesh) targets.push(ceilingMesh);

    const intersects = raycaster.intersectObjects(targets, false);
    if (intersects.length > 0) {
      handleClick(intersects[0].object);
    } else {
      clearSelection();
    }
  });

  window.addEventListener('resize', () => {
    const cw = container.clientWidth, ch = container.clientHeight;
    camera.aspect = cw / Math.max(ch, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(cw, ch);
  });

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}

// ── 创建灯具3D模型 ──
function createCeilingLightFixture(color = '#fff5e8') {
  const group = new THREE.Group();
  const c = new THREE.Color(color);

  // 安装底座（贴天花板）
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.4 }),
  );
  base.position.y = -0.04;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 灯罩（半透明圆锥/半球）
  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  shade.rotation.x = Math.PI;
  shade.position.y = -0.35;
  shade.castShadow = true;
  group.add(shade);

  // 灯泡（发光球体）
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 12),
    new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: 1.2,
      roughness: 0.1,
    }),
  );
  bulb.position.y = -0.2;
  group.add(bulb);

  // 灯环
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

  // 安装面板
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.6 }),
  );
  plate.position.z = 0.03;
  group.add(plate);

  // 灯臂
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.5 }),
  );
  arm.position.set(0, -0.1, 0.18);
  arm.rotation.x = 0.4;
  group.add(arm);

  // 灯罩
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.25, 12),
    new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    }),
  );
  shade.position.set(0, -0.22, 0.35);
  shade.rotation.x = -0.2;
  group.add(shade);

  // 灯泡
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 10),
    new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: 0.8,
      roughness: 0.1,
    }),
  );
  bulb.position.set(0, -0.18, 0.3);
  group.add(bulb);

  return group;
}

// ── 加载展馆 ──
export function loadGallery(data) {
  galleryData = data;
  clearScene();
  buildRoom(data);
  setTimeout(() => {
    if (paintingMeshes.length === 0 && data.arts?.length > 0) {
      buildArts(data);
    }
  }, 500);
}

export function refreshGallery(data) {
  galleryData = data;
  clearScene();
  buildRoom(data);
}

function clearScene() {
  if (roomGroup) {
    roomGroup.traverse((o) => {
      if (o.geometry && o !== transform) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => {
          if (m.map && !m.userData?.keepMap) m.map.dispose();
          m.dispose();
        });
      }
    });
    scene.remove(roomGroup);
  }
  // 清理额外添加到场景的灯具光源
  lightMeshes.forEach(({ lightObj }) => {
    if (lightObj) {
      if (lightObj.target) scene.remove(lightObj.target);
      scene.remove(lightObj);
    }
  });
  paintingMeshes = [];
  lightMeshes = [];
  groups = [];
  wallGroup = null;
  floorMesh = null;
  ceilingMesh = null;
  accentGroup = null;
  clearSelection();
}

// ── 构建房间 ──
function buildRoom(data) {
  roomGroup = new THREE.Group();
  scene.add(roomGroup);

  const dims = data.dimensions || {};
  const ROOM_HALF = dims.roomHalfWidth || 10;
  const wallDepth = dims.wallDepth || 0.35;
  const mats = data.materials || {};

  // 地板
  const floorType = mats.floorType || 'checker';
  const floorTex = makeFloorTex(mats.floorDark || 0x272420, mats.floorLight || 0xf0ebe0, ROOM_HALF, floorType);
  floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.04 }),
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  floorMesh.userData = { type: 'floor' };
  roomGroup.add(floorMesh);

  // 天花板
  ceilingMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2),
    new THREE.MeshStandardMaterial({ color: mats.ceilingColor || mats.wallColor || 0xf0ebe0, roughness: 1, metalness: 0 }),
  );
  ceilingMesh.rotation.x = Math.PI / 2;
  ceilingMesh.position.y = ROOM_HEIGHT;
  ceilingMesh.receiveShadow = true;
  ceilingMesh.userData = { type: 'ceiling' };
  roomGroup.add(ceilingMesh);

  // 四面墙
  wallGroup = new THREE.Group();
  wallGroup.userData = { type: 'wall' };
  const W = ROOM_HALF * 2;
  const wallMat = new THREE.MeshStandardMaterial({ color: mats.wallColor || 0xf0ebe0, roughness: 0.88, metalness: 0.02 });

  const addWall = (w, h, d, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: 'wall' };
    return mesh;
  };

  const lw = addWall(wallDepth, ROOM_HEIGHT, W, wallMat);
  lw.position.set(-ROOM_HALF + wallDepth / 2, ROOM_HEIGHT / 2, 0);
  wallGroup.add(lw);

  const rw = addWall(wallDepth, ROOM_HEIGHT, W, wallMat);
  rw.position.set(ROOM_HALF - wallDepth / 2, ROOM_HEIGHT / 2, 0);
  wallGroup.add(rw);

  const bw = addWall(W, ROOM_HEIGHT, wallDepth, wallMat);
  bw.position.set(0, ROOM_HEIGHT / 2, -ROOM_HALF + wallDepth / 2);
  wallGroup.add(bw);

  const sideW = (W - DOOR_HALF_W * 2) / 2;
  const fl = addWall(sideW, ROOM_HEIGHT, wallDepth, wallMat);
  fl.position.set(-ROOM_HALF + sideW / 2, ROOM_HEIGHT / 2, ROOM_HALF - wallDepth / 2);
  wallGroup.add(fl);

  const fr = addWall(sideW, ROOM_HEIGHT, wallDepth, wallMat);
  fr.position.set(ROOM_HALF - sideW / 2, ROOM_HEIGHT / 2, ROOM_HALF - wallDepth / 2);
  wallGroup.add(fr);

  const lintelH = ROOM_HEIGHT - DOOR_H;
  const lt = addWall(DOOR_HALF_W * 2, lintelH, wallDepth, wallMat);
  lt.position.set(0, DOOR_H + lintelH / 2, ROOM_HALF - wallDepth / 2);
  wallGroup.add(lt);

  wallGroup.children.forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
  roomGroup.add(wallGroup);

  // 门框
  accentGroup = new THREE.Group();
  accentGroup.userData = { type: 'accent' };
  const accMat = new THREE.MeshStandardMaterial({ color: mats.accentColor || 0xc0b090, roughness: 0.65, metalness: 0.15 });
  const ft = 0.12;
  const dfW = DOOR_HALF_W * 2 + ft * 2, dfH = DOOR_H + ft;

  const tf = new THREE.Mesh(new THREE.BoxGeometry(dfW, ft, 0.2), accMat);
  tf.position.set(0, DOOR_H + ft / 2, ROOM_HALF - 0.2);
  accentGroup.add(tf);

  [1, -1].forEach((side) => {
    const sf = new THREE.Mesh(new THREE.BoxGeometry(ft, dfH, 0.2), accMat);
    sf.position.set(side * (DOOR_HALF_W + ft / 2), dfH / 2, ROOM_HALF - 0.2);
    accentGroup.add(sf);
  });

  const dp = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_HALF_W * 2 - 0.08, DOOR_H - 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: mats.doorColor || 0x3d3530, roughness: 0.55, metalness: 0.08 }),
  );
  dp.position.set(-DOOR_HALF_W * 0.35, DOOR_H / 2, ROOM_HALF - 0.28);
  dp.rotation.y = 0.35;
  accentGroup.add(dp);

  accentGroup.children.forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
  roomGroup.add(accentGroup);

  // 画作
  if (data.arts?.length) buildArts(data, ROOM_HALF, wallDepth);

  // 灯具
  if (data.lights?.length) buildLights(data, ROOM_HALF, wallDepth);
}

// ── 构建灯具 ──
function buildLights(data, roomHalf, wallDepth) {
  const r = roomHalf || data.dimensions?.roomHalfWidth || 10;
  const wd = wallDepth || data.dimensions?.wallDepth || 0.35;

  (data.lights || []).forEach((ld) => {
    const useSpot = ld.type === 'ceiling';
    const fixtureGroup = useSpot ? createCeilingLightFixture(ld.color) : createWallLightFixture(ld.color);

    // 实际光源
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

    // 位置
    const pos = ld.position || { x: 0, y: 7.5, z: 0 };
    fixtureGroup.position.set(pos.x, pos.y, pos.z);
    lightObj.position.copy(fixtureGroup.position);

    // 旋转
    if (ld.rotation) {
      fixtureGroup.rotation.set(ld.rotation.x || 0, ld.rotation.y || 0, ld.rotation.z || 0);
    }

    // 更新光源目标方向（基于旋转）
    const dir = new THREE.Vector3(0, -1, 0);
    dir.applyQuaternion(fixtureGroup.quaternion);
    lightObj.target.position.copy(fixtureGroup.position).add(dir);

    // 标记 userData
    fixtureGroup.traverse((child) => {
      if (child.isMesh) {
        child.userData = { type: 'light', lightId: ld.id, lightData: ld };
      }
    });

    scene.add(lightObj);
    scene.add(lightObj.target);
    roomGroup.add(fixtureGroup);
    lightMeshes.push({ group: fixtureGroup, lightObj, data: ld });
  });
}

// ── 更新灯具属性 ──
function updateLightProperties(lightId, updates) {
  const entry = lightMeshes.find(({ data }) => data.id === lightId);
  if (!entry) return;

  const { group, lightObj, data } = entry;

  if (updates.intensity !== undefined) {
    data.intensity = updates.intensity;
    lightObj.intensity = data.enabled ? data.intensity : 0;
  }
  if (updates.color !== undefined) {
    data.color = updates.color;
    const c = new THREE.Color(updates.color);
    lightObj.color.copy(c);
    // 更新灯具模型发光
    group.traverse((child) => {
      if (child.isMesh && child.material && child.material.emissive) {
        child.material.color.copy(c);
        child.material.emissive.copy(c);
      }
      if (child.isMesh && child.material && child.material.transparent) {
        child.material.color.copy(c);
      }
    });
  }
  if (updates.range !== undefined) {
    data.range = updates.range;
    lightObj.distance = updates.range;
  }
  if (updates.angle !== undefined) {
    data.angle = updates.angle;
    lightObj.angle = updates.angle;
  }
  if (updates.penumbra !== undefined) {
    data.penumbra = updates.penumbra;
    lightObj.penumbra = updates.penumbra;
  }
  if (updates.enabled !== undefined) {
    data.enabled = updates.enabled;
    lightObj.intensity = updates.enabled ? data.intensity : 0;
    // 灯泡发光
    group.traverse((child) => {
      if (child.isMesh && child.material && child.material.emissive) {
        child.material.emissiveIntensity = updates.enabled ? (data.type === 'ceiling' ? 1.2 : 0.8) : 0;
      }
    });
  }
  if (updates.name !== undefined) {
    data.name = updates.name;
  }
  if (updates.position) {
    const { x, y, z } = updates.position;
    group.position.set(x, y, z);
    lightObj.position.set(x, y, z);
    data.position = { x, y, z };
    // 更新目标方向
    const dir = new THREE.Vector3(0, -1, 0);
    dir.applyQuaternion(group.quaternion);
    lightObj.target.position.set(x, y, z).add(dir);
  }
}

// ── 地板纹理 ──
function makeFloorTex(darkHex, lightHex, roomHalf, type = 'checker') {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
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
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? `#${dark.getHexString()}` : `#${light.getHexString()}`;
        ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
      }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(roomHalf / 2.5, roomHalf / 2.5);
  return tex;
}

function snapToWall(wall, r, wd) {
  const offset = wd + 0.02;
  switch (wall) {
    case 'left':  return { x: -r + offset, z: 0, rotY: Math.PI / 2 };
    case 'right': return { x: r - offset,  z: 0, rotY: -Math.PI / 2 };
    case 'front': return { x: 0, z: r - offset,  rotY: Math.PI };
    default:      return { x: 0, z: -r + offset, rotY: 0 };
  }
}

function buildArts(data, ROOM_HALF, wallDepth) {
  const r = ROOM_HALF || (data.dimensions?.roomHalfWidth || 10);
  const wd = wallDepth || (data.dimensions?.wallDepth || 0.35);
  const frameWood = new THREE.MeshStandardMaterial({ color: 0x4a3f36, roughness: 0.7, metalness: 0.05 });

  data.arts.forEach((a) => {
    const hue = a.hue || 0.5;
    const file = a.image;

    const grp = new THREE.Group();
    grp.userData = { type: 'painting', artData: a };

    const bw = (a.size?.width || 2) + 0.16;
    const bh = (a.size?.height || 1.5) + 0.16;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), frameWood);
    frame.castShadow = true;
    frame.userData = { type: 'painting', artData: a };

    const canvasMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    if (file && !file.startsWith('data:')) {
      canvasMat.userData = { keepMap: true };
      loadTex(file, hue).then((tex) => {
        canvasMat.map = tex;
        canvasMat.color.set(0xffffff);
        canvasMat.needsUpdate = true;
      });
    } else if (file && file.startsWith('data:')) {
      const img = new Image();
      img.onload = () => {
        const tex = new THREE.CanvasTexture(document.createElement('canvas'));
        const c2 = tex.image;
        c2.width = img.width;
        c2.height = img.height;
        c2.getContext('2d').drawImage(img, 0, 0);
        tex.colorSpace = THREE.SRGBColorSpace;
        canvasMat.map = tex;
        canvasMat.needsUpdate = true;
      };
      img.src = file;
    } else {
      canvasMat.color.setHSL(hue, 0.62, 0.48);
    }

    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(a.size?.width || 2, a.size?.height || 1.5), canvasMat);
    canvas.position.z = 0.04;
    canvas.castShadow = true;
    canvas.userData = { type: 'painting', artData: a };

    grp.add(frame, canvas);

    if (a.wall) {
      const snap = snapToWall(a.wall, r, wd);
      grp.position.set(
        a.position?.x ?? snap.x,
        a.position?.y || 2.5,
        a.position?.z ?? snap.z,
      );
      grp.rotation.order = 'YXZ';
      grp.rotation.y = a.rotation?.y ?? snap.rotY;
      grp.rotation.z = a.rotation?.z || 0;
    } else {
      grp.position.set(a.position?.x || 0, a.position?.y || 2.5, a.position?.z || 0);
      if (grp.position.x < -r + 0.2) grp.position.x = -r + wd + 0.02;
      if (grp.position.x > r - 0.2) grp.position.x = r - wd - 0.02;
      if (grp.position.z < -r + 0.2) grp.position.z = -r + wd + 0.02;
      grp.rotation.order = 'YXZ';
      grp.rotation.y = a.rotation?.y || 0;
      grp.rotation.z = a.rotation?.z || 0;
    }

    if (!a.wall) {
      if (a.position?.x <= -r + 1) a.wall = 'left';
      else if (a.position?.x >= r - 1) a.wall = 'right';
      else if (a.position?.z <= -r + 1) a.wall = 'back';
      else if (a.position?.z >= r - 1) a.wall = 'front';
      else a.wall = 'back';
    }

    paintingMeshes.push({ group: grp, data: a });
    roomGroup.add(grp);
  });
}

function loadTex(file, hue) {
  if (paintingCache.has(file)) return Promise.resolve(paintingCache.get(file));
  if (file && file.startsWith('data:')) {
    const img = new Image();
    img.src = file;
    return new Promise((resolve) => {
      img.onload = () => {
        const tex = new THREE.CanvasTexture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        paintingCache.set(file, tex);
        resolve(tex);
      };
      img.onerror = () => { const fb = fallbackTex(hue); paintingCache.set(file, fb); resolve(fb); };
    });
  }
  return new Promise((res) => {
    textureLoader.load(
      file,
      (tex) => { tex.colorSpace = THREE.SRGBColorSpace; paintingCache.set(file, tex); res(tex); },
      undefined,
      () => { const fb = fallbackTex(hue); paintingCache.set(file, fb); res(fb); },
    );
  });
}

function fallbackTex(hue) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `hsl(${(hue * 360) | 0}, 50%, 45%)`;
  ctx.fillRect(0, 0, 256, 320);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── 选择处理 ──
function handleClick(obj) {
  const type = obj.userData?.type;
  if (!type) { clearSelection(); return; }

  if (type === 'painting') {
    const entry = paintingMeshes.find(({ group }) => group.children.includes(obj) || group === obj);
    if (entry) { selectPainting(entry.group, entry.data); return; }
  }

  if (type === 'light') {
    const ld = obj.userData?.lightData;
    const entry = lightMeshes.find(({ data }) => data.id === ld?.id);
    if (entry) { selectLight(entry.group, entry.data); return; }
  }

  if (type === 'wall') { selectWall(); return; }
  if (type === 'accent') { selectWall(); highlightGroup(accentGroup); return; }
  if (type === 'floor') { selectFloor(); return; }
  if (type === 'ceiling') { selectCeiling(); return; }

  clearSelection();
}

function selectPainting(group, data) {
  clearSelection();
  selectedObject = group;
  selectionType = 'painting';
  selectionData = data;
  highlightObject(group);
  if (toolMode === 'translate') { scene.add(transform); transform.attach(group); }
  notifySelection();
}

function selectLight(group, data) {
  clearSelection();
  selectedObject = group;
  selectionType = 'light';
  selectionData = data;
  highlightObject(group);
  if (toolMode === 'translate') { scene.add(transform); transform.attach(group); }
  notifySelection();
}

function selectWall() {
  clearSelection();
  selectionType = 'wall';
  selectionData = null;
  highlightGroup(wallGroup);
  notifySelection();
}

function selectFloor() {
  clearSelection();
  selectionType = 'floor';
  selectionData = null;
  highlightObject(floorMesh);
  notifySelection();
}

function selectCeiling() {
  clearSelection();
  selectionType = 'ceiling';
  selectionData = null;
  highlightObject(ceilingMesh);
  notifySelection();
}

export function clearSelection() {
  const hadTransform = selectionType === 'painting' || selectionType === 'light';
  clearHighlight();
  if (hadTransform && selectedObject) {
    transform.detach();
    if (!selectedObject.parent && roomGroup) {
      roomGroup.add(selectedObject);
    }
  }
  scene.remove(transform);
  selectedObject = null;
  selectionType = null;
  selectionData = null;
  notifySelection();
}

export function getSelection() {
  if (!selectionType) return null;
  const result = { type: selectionType, data: selectionData };

  if (selectionType === 'painting' && selectedObject && selectionData) {
    result.position = {
      x: +selectedObject.position.x.toFixed(2),
      y: +selectedObject.position.y.toFixed(2),
      z: +selectedObject.position.z.toFixed(2),
    };
    result.data = { ...selectionData, position: result.position };
  }

  if (selectionType === 'light' && selectedObject && selectionData) {
    result.position = {
      x: +selectedObject.position.x.toFixed(2),
      y: +selectedObject.position.y.toFixed(2),
      z: +selectedObject.position.z.toFixed(2),
    };
    result.data = { ...selectionData, position: result.position };
  }

  if (selectionType === 'wall' || selectionType === 'floor' || selectionType === 'ceiling') {
    result.materials = galleryData?.materials || {};
  }

  return result;
}

export function selectByType(type) {
  if (type === 'wall') { selectWall(); return; }
  if (type === 'floor') { selectFloor(); return; }
  if (type === 'ceiling') { selectCeiling(); return; }
}

export function setToolMode(mode) {
  toolMode = mode;
  if (mode === 'select') {
    if (selectedObject) transform.detach();
    scene.remove(transform);
  } else {
    transform.setMode(mode);
    if (selectedObject && (selectionType === 'painting' || selectionType === 'light')) {
      scene.add(transform);
      transform.attach(selectedObject);
    }
  }
}

function syncPositionToData() {
  if (!selectedObject || !selectionData) return;
  if (selectionType === 'painting') {
    selectionData.position = {
      x: +selectedObject.position.x.toFixed(3),
      y: +selectedObject.position.y.toFixed(3),
      z: +selectedObject.position.z.toFixed(3),
    };
    selectionData.rotation = {
      y: +selectedObject.rotation.y.toFixed(4),
      z: +selectedObject.rotation.z.toFixed(4),
    };
    // 同步到 galleryData
    const art = galleryData?.arts?.find(a => a.id === selectionData.id);
    if (art) {
      art.position = { ...selectionData.position };
      art.rotation = { ...selectionData.rotation };
    }
  } else if (selectionType === 'light') {
    selectionData.position = {
      x: +selectedObject.position.x.toFixed(3),
      y: +selectedObject.position.y.toFixed(3),
      z: +selectedObject.position.z.toFixed(3),
    };
    // 同步实际光源位置
    const entry = lightMeshes.find(({ data }) => data.id === selectionData.id);
    if (entry) {
      entry.lightObj.position.copy(selectedObject.position);
      const dir = new THREE.Vector3(0, -1, 0);
      dir.applyQuaternion(selectedObject.quaternion);
      entry.lightObj.target.position.copy(selectedObject.position).add(dir);
    }
    // 同步到 galleryData
    const ldata = galleryData?.lights?.find(l => l.id === selectionData.id);
    if (ldata) ldata.position = { ...selectionData.position };
  }
}

export function getGalleryData() {
  if (!galleryData) return null;
  paintingMeshes.forEach(({ group, data }) => {
    data.position = {
      x: +group.position.x.toFixed(3),
      y: +group.position.y.toFixed(3),
      z: +group.position.z.toFixed(3),
    };
    data.rotation = {
      y: +group.rotation.y.toFixed(4),
      z: +group.rotation.z.toFixed(4),
    };
  });
  lightMeshes.forEach(({ group, data }) => {
    data.position = {
      x: +group.position.x.toFixed(3),
      y: +group.position.y.toFixed(3),
      z: +group.position.z.toFixed(3),
    };
  });
  return galleryData;
}

// ── 更新选中画作 ──
export function updateSelectedPainting(updates) {
  if (!selectedObject || selectionType !== 'painting') return;
  const entry = paintingMeshes.find(({ group }) => group === selectedObject);
  if (!entry) return;

  if (updates.size) {
    const w = updates.size.width, h = updates.size.height;
    const bw = w + 0.16, bh = h + 0.16;
    selectedObject.children.forEach((child) => {
      if (!child.isMesh) return;
      const oldGeo = child.geometry;
      if (oldGeo.type === 'BoxGeometry') {
        child.geometry = new THREE.BoxGeometry(bw, bh, 0.06);
      } else if (oldGeo.type === 'PlaneGeometry') {
        child.geometry = new THREE.PlaneGeometry(w, h);
      }
      if (oldGeo) oldGeo.dispose();
    });
    entry.data.size = { width: w, height: h };
    if (selectionData) selectionData.size = { width: w, height: h };
    const art = galleryData?.arts?.find(a => a.id === entry.data.id);
    if (art) art.size = { width: w, height: h };
    clearHighlight();
    highlightObject(selectedObject);
  }

  if (updates.position) {
    const { x, y, z } = updates.position;
    selectedObject.position.set(x, y, z);
    entry.data.position = { x, y, z };
    if (selectionData) selectionData.position = { x, y, z };
    const art = galleryData?.arts?.find(a => a.id === entry.data.id);
    if (art) art.position = { x, y, z };
    clearHighlight();
    highlightObject(selectedObject);
  }

  if (updates.wall) {
    const dims = galleryData?.dimensions || {};
    const r = dims.roomHalfWidth || 10;
    const wd = dims.wallDepth || 0.35;
    const snap = snapToWall(updates.wall, r, wd);
    const y = entry.data.position?.y || 2.5;
    selectedObject.position.set(snap.x, y, snap.z);
    selectedObject.rotation.y = snap.rotY;
    entry.data.wall = updates.wall;
    entry.data.position = { x: snap.x, y, z: snap.z };
    entry.data.rotation = { y: snap.rotY, z: 0 };
    if (selectionData) {
      selectionData.wall = updates.wall;
      selectionData.position = { x: snap.x, y, z: snap.z };
      selectionData.rotation = { y: snap.rotY, z: 0 };
    }
    const art = galleryData?.arts?.find(a => a.id === entry.data.id);
    if (art) { art.wall = updates.wall; art.position = { x: snap.x, y, z: snap.z }; art.rotation = { y: snap.rotY, z: 0 }; }
    clearHighlight();
    highlightObject(selectedObject);
  }

  if (updates.title !== undefined) { entry.data.title = updates.title; if (selectionData) selectionData.title = updates.title; const art = galleryData?.arts?.find(a => a.id === entry.data.id); if (art) art.title = updates.title; }
  if (updates.artist !== undefined) { entry.data.artist = updates.artist; if (selectionData) selectionData.artist = updates.artist; const art = galleryData?.arts?.find(a => a.id === entry.data.id); if (art) art.artist = updates.artist; }

  notifySelection();
}

// ── 更新选中灯具 ──
export function updateSelectedLight(updates) {
  if (!selectedObject || selectionType !== 'light' || !selectionData) return;
  updateLightProperties(selectionData.id, updates);
  // 同步到 galleryData
  const ld = galleryData?.lights?.find(l => l.id === selectionData.id);
  if (ld) {
    Object.keys(updates).forEach(k => { if (k !== 'id') ld[k] = updates[k]; });
  }
  notifySelection();
}

// ── 复制 ──
export function duplicateSelectedItem() {
  if (selectionType === 'painting' && selectionData) {
    const orig = selectionData;
    const newId = 'art-' + Date.now();
    const newArt = JSON.parse(JSON.stringify(orig));
    newArt.id = newId;
    newArt.title = orig.title + ' (副本)';
    if (newArt.position) {
      newArt.position.x += 0.8;
      newArt.position.z += 0.3;
    }
    if (!galleryData.arts) galleryData.arts = [];
    galleryData.arts.push(newArt);
    refreshGallery(galleryData);
    // 选中副本
    setTimeout(() => {
      const entry = paintingMeshes.find(({ data }) => data.id === newId);
      if (entry) selectPainting(entry.group, entry.data);
    }, 100);
    return newArt;
  }

  if (selectionType === 'light' && selectionData) {
    const orig = selectionData;
    const newId = 'light-' + Date.now();
    const newLight = JSON.parse(JSON.stringify(orig));
    newLight.id = newId;
    newLight.name = orig.name + ' (副本)';
    if (newLight.position) {
      newLight.position.x += 1.0;
      newLight.position.z += 0.5;
    }
    if (!galleryData.lights) galleryData.lights = [];
    galleryData.lights.push(newLight);
    refreshGallery(galleryData);
    setTimeout(() => {
      const entry = lightMeshes.find(({ data }) => data.id === newId);
      if (entry) selectLight(entry.group, entry.data);
    }, 100);
    return newLight;
  }
  return null;
}

// ── 删除 ──
export function deleteSelectedItem() {
  if (selectionType === 'painting' && selectionData) {
    const id = selectionData.id;
    galleryData.arts = (galleryData.arts || []).filter(a => a.id !== id);
    clearSelection();
    refreshGallery(galleryData);
    return true;
  }
  if (selectionType === 'light' && selectionData) {
    const id = selectionData.id;
    galleryData.lights = (galleryData.lights || []).filter(l => l.id !== id);
    clearSelection();
    refreshGallery(galleryData);
    return true;
  }
  return false;
}

// ── 添加新灯具 ──
export function addLight(type = 'ceiling') {
  if (!galleryData) return null;
  const dims = galleryData.dimensions || {};
  const r = dims.roomHalfWidth || 10;
  const newLight = {
    id: 'light-' + Date.now(),
    name: type === 'ceiling' ? '新顶灯' : '新墙灯',
    type,
    position: type === 'ceiling' ? { x: 0, y: 7.5, z: 0 } : { x: -r + 1, y: 4.5, z: -2 },
    rotation: { x: 0, y: type === 'wall' ? 1.5708 : 0, z: 0 },
    color: '#fff5e8',
    intensity: 1.0,
    range: 10,
    angle: 1.2,
    penumbra: 0.4,
    enabled: true,
  };
  if (!galleryData.lights) galleryData.lights = [];
  galleryData.lights.push(newLight);
  refreshGallery(galleryData);
  setTimeout(() => {
    const entry = lightMeshes.find(({ data }) => data.id === newLight.id);
    if (entry) selectLight(entry.group, entry.data);
  }, 100);
  return newLight;
}

// ── 添加新画作 ──
export function addPainting() {
  if (!galleryData) return null;
  const newArt = {
    id: 'art-' + Date.now(),
    title: '新画作',
    artist: '',
    wall: 'back',
    position: { x: 0, y: 2.5, z: -9 },
    size: { width: 2, height: 1.5 },
    rotation: { y: 0, z: 0 },
    hue: Math.random(),
  };
  if (!galleryData.arts) galleryData.arts = [];
  galleryData.arts.push(newArt);
  refreshGallery(galleryData);
  setTimeout(() => {
    const entry = paintingMeshes.find(({ data }) => data.id === newArt.id);
    if (entry) selectPainting(entry.group, entry.data);
  }, 100);
  return newArt;
}

// ── 高亮 ──
const highlightMaterial = new THREE.MeshBasicMaterial({
  color: 0xc9b896,
  wireframe: true,
  transparent: true,
  opacity: 0.4,
  depthTest: true,
  depthWrite: false,
});

let highlightObjects = [];

function highlightObject(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.isMesh && child.material !== highlightMaterial) {
      const hl = new THREE.Mesh(child.geometry, highlightMaterial);
      hl.position.copy(child.position);
      hl.rotation.copy(child.rotation);
      hl.scale.copy(child.scale);
      hl.userData = { isHighlight: true };
      if (obj.parent) obj.parent.add(hl);
      highlightObjects.push(hl);
    }
  });
}

function highlightGroup(group) {
  group.children.forEach((child) => {
    if (child.isMesh && child.material !== highlightMaterial) {
      const hl = new THREE.Mesh(child.geometry, highlightMaterial);
      hl.position.copy(child.position);
      hl.rotation.copy(child.rotation);
      hl.scale.copy(child.scale);
      hl.userData = { isHighlight: true };
      group.add(hl);
      highlightObjects.push(hl);
    }
  });
}

function clearHighlight() {
  highlightObjects.forEach((hl) => {
    if (hl.parent) hl.parent.remove(hl);
  });
  highlightObjects = [];
}

function notifySelection() {
  if (onSelectionChange) onSelectionChange(getSelection());
}

// ── 获取灯具列表 ──
export function getLightList() {
  return galleryData?.lights || [];
}

export function getArtList() {
  return galleryData?.arts || [];
}
