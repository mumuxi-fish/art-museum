// 手电筒:跟随相机视角的聚光灯,可开关
import * as THREE from 'three';
import { scene, camera } from './scene.js';

let light = null;
let target = null;
let on = false;
let btn = null;

export function initFlashlight(flashBtn) {
  btn = flashBtn;
  light = new THREE.SpotLight(0xfff3d6, 0, 20, 0.55, 0.7, 2);
  light.castShadow = false;
  target = new THREE.Object3D();
  scene.add(target);
  light.target = target;
  scene.add(light);
  if (btn) btn.addEventListener('click', toggle);
}

export function toggle() {
  if (!light) return false;
  on = !on;
  light.intensity = on ? 3.2 : 0;
  if (btn) btn.classList.toggle('active', on);
  return on;
}

export function setFlashlight(v) {
  if (!light) return;
  on = !!v;
  light.intensity = on ? 3.2 : 0;
  if (btn) btn.classList.toggle('active', on);
}

// 每帧跟随相机位置与朝向
export function updateFlashlight() {
  if (!light) return;
  light.position.copy(camera.position);
  light.position.y -= 0.12;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  target.position.copy(camera.position).addScaledVector(dir, 7);
}

export function isFlashlightOn() {
  return on;
}
