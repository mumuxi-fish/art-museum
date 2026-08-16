// 第一人称可见人物(可选显示)
import * as THREE from 'three';
import { scene, camera } from './scene.js';

let bodyGroup = null;
let bodyVisible = false;
let bodyToggleBtn = null;

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

  [1, -1].forEach((side) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), clothMat);
    arm.position.set(side * 0.28, -0.5, 0);
    arm.castShadow = true;
    group.add(arm);
  });

  group.visible = false;
  return group;
}

export function initPlayer(btn) {
  bodyToggleBtn = btn;
  btn.addEventListener('click', toggleBody);
}

function toggleBody() {
  if (!bodyGroup) {
    bodyGroup = createBodyMesh();
    scene.add(bodyGroup);
  }
  bodyVisible = !bodyVisible;
  bodyGroup.visible = bodyVisible;
  bodyToggleBtn.classList.toggle('active', bodyVisible);
}

// 每帧跟随相机
export function updatePlayer() {
  if (bodyGroup && bodyGroup.visible) {
    bodyGroup.position.copy(camera.position);
    bodyGroup.quaternion.copy(camera.quaternion);
  }
}
