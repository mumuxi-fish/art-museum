// 光线随时间变化 —— 从「正午」到「闭馆」。
//
// 这是一座室内馆，没有天窗，所以「天光」影响的是整体氛围而不是某扇窗：
// 环境光的色温与强度、雾的浓淡、天花灯槽的亮度、地板反射的强弱。
// 白天靠天光（灯槽压暗、雾淡、冷白），越接近闭馆越靠人工光
// （灯槽拉满、色温转暖橙、雾变浓、地板反射更强）。
//
// 每个字段是一条 0→1 的曲线，滑块拖到哪就插值到哪。
import * as THREE from 'three';

export const STOPS = [
  { at: 0.00, name: '正午', ambient: 0.62, color: 0xffffff, fog: 0.0080, cove: 0.42, reflect: 0.40 },
  { at: 0.33, name: '午后', ambient: 0.55, color: 0xfff4e4, fog: 0.0095, cove: 0.70, reflect: 0.55 },
  { at: 0.66, name: '黄昏', ambient: 0.44, color: 0xffd8a4, fog: 0.0125, cove: 0.92, reflect: 0.72 },
  { at: 1.00, name: '闭馆', ambient: 0.32, color: 0xffc286, fog: 0.0165, cove: 1.00, reflect: 0.85 },
];

// 灯槽和地板的基准色，插值时按系数缩放，不改变各自的固有色
const COVE_BASE = new THREE.Color(0xfff2dd);

let ambient = null;
let scene = null;
let coveMats = [];
let floorMats = [];
let value = 0;

const cA = new THREE.Color();
const cB = new THREE.Color();
const cOut = new THREE.Color();

export function initDaylight(sceneRef, ambientRef, coveMaterials, floorMaterials) {
  scene = sceneRef;
  ambient = ambientRef;
  coveMats = coveMaterials || [];
  floorMats = floorMaterials || [];
  applyDaylight(value);
}

// 在两个相邻预设之间插值。t 在 0..1
function sample(t) {
  const clamped = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < STOPS.length - 2 && clamped > STOPS[i + 1].at) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const span = b.at - a.at || 1;
  const k = Math.min(1, Math.max(0, (clamped - a.at) / span));
  return {
    name: k < 0.5 ? a.name : b.name,
    ambient: a.ambient + (b.ambient - a.ambient) * k,
    fog: a.fog + (b.fog - a.fog) * k,
    cove: a.cove + (b.cove - a.cove) * k,
    reflect: a.reflect + (b.reflect - a.reflect) * k,
    color: cA.setHex(a.color).lerp(cB.setHex(b.color), k),
  };
}

export function applyDaylight(t) {
  value = t;
  if (!scene || !ambient) return;
  const s = sample(t);

  ambient.intensity = s.ambient;
  ambient.color.copy(s.color);

  if (scene.fog) {
    scene.fog.density = s.fog;
    scene.fog.color.copy(s.color);
  }
  if (scene.background?.isColor) {
    // 背景跟着色温走，但压得很暗，免得馆外变成一块亮橙
    scene.background.copy(cOut.copy(s.color).multiplyScalar(0.055));
  }

  for (const m of coveMats) {
    if (m?.color) m.color.copy(cOut.copy(COVE_BASE).multiplyScalar(s.cove));
  }
  for (const m of floorMats) {
    m.envMapIntensity = s.reflect;
  }
}

export function daylightLabel(t) {
  return sample(t).name;
}

export function getDaylight() {
  return value;
}
