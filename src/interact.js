// 交互系统：视线拾取画作、走近长凳、按 E 触发
//
// 两条目标来源：
//   1) 从画面正中打一条射线，命中画布 → 可以看作品详情
//   2) 走到长凳附近 → 可以坐下
// 两者都在屏幕下方给一个提示条，桌面上按 E、移动端直接点提示条。
import * as THREE from 'three';
import { camera } from './scene.js';

export const SEATED_EYE = 1.16;
const ART_REACH = 13;      // 射线最远能认到几米外的画
const BENCH_REACH = 2.3;   // 离长凳多近才提示坐下

let artTargets = [];
let benchTargets = [];
let benches = [];
let promptEl = null;
let handlers = {};

let target = null;
let seated = null;
const standPos = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);

// 上一次真正算过的位姿 + 整厅剔除版本号。
//
// 拾取是每帧 84 条射线，站着发呆时结果一模一样，没必要重算：
// 位姿没动、藏起来的厅也没换，就直接沿用上一次的 target。
// 位姿要带 pitch —— 低头抬头会改变画面正中那条射线。
const lastPose = { x: NaN, y: NaN, z: NaN, rx: NaN, ry: NaN };
let lastVisRev = -1;

export function initInteract(opts) {
  artTargets = opts.artTargets || [];
  benchTargets = opts.benchTargets || [];
  benches = opts.benches || [];
  promptEl = opts.promptEl || null;
  handlers = opts;

  if (promptEl) {
    promptEl.addEventListener('click', (e) => {
      e.stopPropagation();
      activate();
    });
  }
}

function showPrompt(text) {
  if (!promptEl) return;
  if (promptEl.textContent !== text) promptEl.textContent = text;
  promptEl.classList.remove('hidden');
}

export function hidePrompt() {
  if (!promptEl) return;
  promptEl.classList.add('hidden');
}

// 整厅剔除之后，藏起来的房间里的画/凳子不能再被点到 ——
// three 的 Raycaster 不看 visible，穿墙打到的远室画作会凭空冒出提示条。
function worldVisible(obj) {
  for (let o = obj; o; o = o.parent) if (o.visible === false) return false;
  return true;
}

// 每帧更新当前可交互目标。visRev 传整厅剔除的版本号（room.getVisRevision），
// 藏起来的厅一变，就算没动也要重算，不然提示条会指着看不见的画。
export function updateInteract(visRev = 0) {
  if (seated) {
    target = null;
    showPrompt('E  起身');
    return;
  }

  const still = camera.position.x === lastPose.x
    && camera.position.y === lastPose.y
    && camera.position.z === lastPose.z
    && camera.rotation.x === lastPose.rx
    && camera.rotation.y === lastPose.ry;
  if (still && visRev === lastVisRev) return;
  lastPose.x = camera.position.x;
  lastPose.y = camera.position.y;
  lastPose.z = camera.position.z;
  lastPose.rx = camera.rotation.x;
  lastPose.ry = camera.rotation.y;
  lastVisRev = visRev;

  // 视线正中打一条射线，画作和长凳一起拾取，谁近认谁。
  // 上一版先判画再按距离判凳子，结果站在凳子前只要视线扫到画就只剩"查看作品"。
  raycaster.setFromCamera(screenCenter, camera);
  raycaster.far = ART_REACH;
  const hits = raycaster.intersectObjects([...artTargets, ...benchTargets], false);
  for (const hit of hits) {
    if (!worldVisible(hit.object)) continue;
    if (hit.object.userData.art) {
      target = { kind: 'art', art: hit.object.userData.art };
      showPrompt('E  查看作品');
      return;
    }
    if (hit.object.userData.bench) {
      target = { kind: 'bench', bench: hit.object.userData.bench };
      showPrompt('E  坐下');
      return;
    }
  }

  // 兜底：贴得很近但没瞄准（凳子矮，得低头才看得见）
  let best = null;
  for (const b of benches) {
    const d = Math.hypot(b.x - camera.position.x, b.z - camera.position.z);
    if (d < BENCH_REACH && (!best || d < best.d)) best = { kind: 'bench', bench: b, d };
  }
  target = best;
  if (best) showPrompt('E  坐下');
  else hidePrompt();
}

// 按 E / 点提示条
export function activate() {
  if (seated) {
    stand();
    return;
  }
  if (!target) return;
  if (target.kind === 'art') handlers.onOpenArt?.(target.art);
  else if (target.kind === 'bench') sit(target.bench);
}

export function sit(bench) {
  seated = bench;
  standPos.copy(camera.position);
  camera.position.set(bench.x, SEATED_EYE, bench.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(0, bench.facing, 0);
  handlers.onSit?.(bench);
  showPrompt('E  起身');
}

export function stand() {
  if (!seated) return;
  const f = seated.facing;
  // 站到凳子背对主墙的那一侧
  const bx = seated.x + Math.sin(f) * 0.95;
  const bz = seated.z + Math.cos(f) * 0.95;
  if (handlers.canStand?.(bx, bz)) {
    camera.position.set(bx, camera.position.y, bz);
  } else {
    camera.position.copy(standPos);
  }
  seated = null;
  target = null;
  handlers.onStand?.();
  hidePrompt();
}

export function isSeated() {
  return Boolean(seated);
}

export function currentTarget() {
  return target;
}
