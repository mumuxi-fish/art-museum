// 手电筒：跟随视角的双层聚光（窄而亮的中心光斑 + 宽而弱的外围泛光）
//
// 上一版的问题：光源就放在相机位置上（等于灯装在眼睛里），单锥角，
// decay=2 下近处过曝、远处全黑，打在墙上是一个生硬的圆。
// 现在改成：
//   - 灯挂在身前偏下一点，像真的举着手电
//   - 内层窄锥（亮）+ 外层宽锥（弱），边缘用大 penumbra 化开
//   - 开关做 0.18s 的亮度渐变，不"啪"地一下跳
//   - 位置带一点阻尼跟随，走路时有点手持的晃动感
import * as THREE from 'three';
import { scene, camera } from './scene.js';

const CORE_COLOR = 0xfff2d8;
const SPILL_COLOR = 0xffe6c0;
const CORE_MAX = 42;
const SPILL_MAX = 13;

let core = null;
let spill = null;
let target = null;
let on = false;
let level = 0;          // 0..1，用于渐变
let btn = null;
let onToggle = null;

const aim = new THREE.Vector3();
const want = new THREE.Vector3();
const dir = new THREE.Vector3();

export function initFlashlight(flashBtn, opts = {}) {
  btn = flashBtn;
  onToggle = opts.onToggle || null;

  target = new THREE.Object3D();
  scene.add(target);

  // decay 用 1.35 而不是物理正确的 2。平方衰减下 10m 外照度只剩 1/100，
  // 实测在已经点着灯的展厅里几乎看不出手电（只提亮 1 个灰阶）。
  // 真实手电是靠几千坎德拉的极高光强来补偿的，这里用缓一点的曲线等效。
  core = new THREE.SpotLight(CORE_COLOR, 0, 42, 0.17, 0.5, 1.35);
  spill = new THREE.SpotLight(SPILL_COLOR, 0, 22, 0.55, 1.0, 1.4);
  for (const l of [core, spill]) {
    l.castShadow = false;
    // 关掉时用 intensity=0 而不是 visible=false：
    // 可见灯数量一变 three.js 就要重编译 shader，开关手电会卡一下
    l.target = target;
    scene.add(l);
  }

  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
}

export function toggle() {
  if (!core) return false;
  on = !on;
  if (btn) btn.classList.toggle('active', on);
  onToggle?.(on);
  return on;
}

export function setFlashlight(v) {
  if (!core) return;
  on = !!v;
  if (btn) btn.classList.toggle('active', on);
}

export function isFlashlightOn() {
  return on;
}

export function updateFlashlight(dt = 0.016) {
  if (!core) return;

  // 亮度渐变
  const goal = on ? 1 : 0;
  const speed = dt / 0.18;
  level += Math.sign(goal - level) * Math.min(speed, Math.abs(goal - level));
  core.intensity = CORE_MAX * level;
  spill.intensity = SPILL_MAX * level;

  if (level <= 0.001) return;

  camera.getWorldDirection(dir);

  // 灯挂在身前 0.35m、下方 0.22m，像举在胸前的手电
  want.copy(camera.position).addScaledVector(dir, 0.35);
  want.y -= 0.22;

  // 阻尼跟随：走快了会有一点点滞后，像手持光源而不是焊在头上
  const k = 1 - Math.pow(0.0005, dt);
  core.position.lerp(want, k);
  spill.position.lerp(want, k);

  // 瞄准相机前方 14m 处
  aim.copy(camera.position).addScaledVector(dir, 14);
  target.position.copy(aim);
}
