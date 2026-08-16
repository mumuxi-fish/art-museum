// 房间构建与清理
import * as THREE from 'three';
import { scene } from './scene.js';
import { ROOM_HEIGHT, DOOR_HALF_W, DOOR_H } from './config.js';
import { makeFloorTexture, makeFallbackTexture, paintingTextureCache } from './textures.js';
import { createLights } from './lights.js';

export const doorWorldPos = new THREE.Vector3(0, 0, 0);

let roomGroup = null;
let currentLightFixtures = [];

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

function snapToWall(wall, roomHalf, wallDepth) {
  const offset = wallDepth + 0.02;
  switch (wall) {
    case 'left':  return { x: -roomHalf + offset, z: 0, rotY: Math.PI / 2 };
    case 'right': return { x: roomHalf - offset, z: 0, rotY: -Math.PI / 2 };
    case 'front': return { x: 0, z: roomHalf - offset, rotY: Math.PI };
    default:      return { x: 0, z: -roomHalf + offset, rotY: 0 };
  }
}

// 画作射灯:从画前方照向画面
function addArtSpotlight(grp, roomGroup) {
  const pos = grp.position;
  const rotY = grp.rotation.y;
  // 画面法线(平面默认面向 +z,按 rotation.y 旋转)
  const nx = Math.sin(rotY);
  const nz = Math.cos(rotY);

  const light = new THREE.SpotLight(0xfff2dd, 1.6, 9, 0.42, 0.55, 2);
  light.position.set(pos.x + nx * 1.9, pos.y + 0.75, pos.z + nz * 1.9);
  light.castShadow = false;

  const target = new THREE.Object3D();
  target.position.copy(pos);
  roomGroup.add(target);
  light.target = target;
  roomGroup.add(light);
}

function buildArtworks(arts, roomGroup, roomHalf, wallDepth, frameWood) {
  if (!arts) return;
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
      const snap = snapToWall(a.wall, roomHalf, wallDepth);
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
      if (grp.position.x < -roomHalf + 0.2) grp.position.x = -roomHalf + wallDepth + 0.02;
      if (grp.position.x > roomHalf - 0.2) grp.position.x = roomHalf - wallDepth - 0.02;
      if (grp.position.z < -roomHalf + 0.2) grp.position.z = -roomHalf + wallDepth + 0.02;
      grp.rotation.order = 'YXZ';
      grp.rotation.y = a.rotation.y || 0;
      grp.rotation.z = a.rotation.z || 0;
    }

    frame.castShadow = true;
    canvas.castShadow = true;
    roomGroup.add(grp);
    addArtSpotlight(grp, roomGroup); // 射灯照向画作
  });
}

export function buildRoom(galleryData) {
  clearRoom();

  const { materials, dimensions, arts, lights, ambientIntensity } = galleryData;
  const ROOM_HALF = dimensions.roomHalfWidth || 10;
  const wallDepth = dimensions.wallDepth || 0.35;

  roomGroup = new THREE.Group();
  scene.add(roomGroup);

  createLights({ lights, ambientIntensity }, scene, roomGroup, currentLightFixtures);

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

  // 前墙(带门)
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
  buildArtworks(arts, roomGroup, ROOM_HALF, wallDepth, frameWood);
}

export function getRoomHalfWidth(galleryData) {
  return galleryData?.dimensions?.roomHalfWidth || 10;
}
