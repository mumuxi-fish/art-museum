// 场景 / 相机 / 渲染器 单例
import * as THREE from 'three';
import { EYE_HEIGHT } from './config.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);
// 整座馆横向 60m、纵向 35m，雾要淡一些，否则站在门厅看不到走廊尽头
scene.fog = new THREE.FogExp2(0x0a0a0c, 0.0095);

export const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 200);
camera.position.set(0, EYE_HEIGHT, 0);

// 全馆共用一盏环境光。three.js 的 AmbientLight 没有空间衰减，
// 按房间各建一盏会互相叠加，所以只留一盏当底子，房间的明暗交给各自的顶灯。
export const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
// 全馆 60 多盏灯 + forward rendering，像素比拉到 2 等于 4 倍像素量，太亏。
// 1.5 在 Retina 上肉眼看不出差别，帧率能翻一倍。
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
// 阴影贴图关掉：全馆的投影只来自展厅顶灯，画面上几乎看不出来，
// 但进厅时第一次分配阴影贴图 + 跑 shadow pass 会明显卡一帧。
renderer.shadowMap.enabled = false;
document.body.appendChild(renderer.domElement);

export const textureLoader = new THREE.TextureLoader();

// "画面变了、需要重画"的标记。
//
// 静止不动的时候 animate 会跳过 renderer.render（详见 main.js），
// 所以任何会让画面和上一帧不一样的事都得喊一声：贴图到位、日光滑杆、
// 整厅剔除翻转、开手电、窗口缩放……漏喊就停在旧画面上。
let needsRender = true;

export function markDirty() {
  needsRender = true;
}

// 取走标记并复位。一帧只会取一次。
export function takeDirty() {
  const d = needsRender;
  needsRender = false;
  return d;
}

export function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // resize 会把 canvas 清掉，不重画就是一片黑
  markDirty();
}

window.addEventListener('resize', handleResize);
