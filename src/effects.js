// 悬浮尘埃粒子(沉浸氛围,轻量)
import * as THREE from 'three';
import { scene } from './scene.js';

const PARTICLE_COUNT = 180;

let points = null;
const velocities = [];
const bounds = { x: 9, y: 3.5, z: 8 };

export function createDustParticles() {
  if (points) return points;

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * bounds.x;
    positions[i * 3 + 1] = 0.2 + Math.random() * bounds.y;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * bounds.z;
    velocities.push({
      x: (Math.random() - 0.5) * 0.12,
      y: (Math.random() - 0.5) * 0.05,
      z: (Math.random() - 0.5) * 0.12,
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xfff4d6,
    size: 0.035,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });

  points = new THREE.Points(geo, mat);
  scene.add(points);
  return points;
}

export function updateDustParticles(dt) {
  if (!points) return;
  const pos = points.geometry.attributes.position;
  const arr = pos.array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const v = velocities[i];
    arr[i * 3] += v.x * dt;
    arr[i * 3 + 1] += v.y * dt;
    arr[i * 3 + 2] += v.z * dt;
    // 边界反弹
    if (Math.abs(arr[i * 3]) > bounds.x) v.x *= -1;
    if (arr[i * 3 + 1] < 0.2 || arr[i * 3 + 1] > bounds.y) v.y *= -1;
    if (Math.abs(arr[i * 3 + 2]) > bounds.z) v.z *= -1;
  }
  pos.needsUpdate = true;
}
