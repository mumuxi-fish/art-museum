// 输入控制：桌面(PointerLock) + 移动端(摇杆/触控) + 键盘 + 碰撞
//
// 和上一版的区别：不再有"走到门口触发传送"。整座馆是连续平面图，
// 碰撞直接问 plan.canStand()，玩家就是一路走过去。

import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { camera, renderer } from './scene.js';
import { IS_MOBILE, EYE_HEIGHT, MOVE_SPEED } from './config.js';

export const controls = IS_MOBILE ? null : new PointerLockControls(camera, document.body);

// 移动端状态
let mobileActive = false;
let mobileLookActive = true;
let joystickActive = false;
let joystickId = null;
const joystickOrigin = { x: 0, y: 0 };
const joystickValue = { x: 0, y: 0 };
const JOYSTICK_MAX_R = 62;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
let touchStart = null;
let lastTouchId = null;
let touchLast = null;

const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
const moveDir = new THREE.Vector3();

let opts = null;

// 指针锁定的兜底。预览面板/iframe 里浏览器会拒绝 Pointer Lock，
// 上一版把"能移动"绑死在 isLocked 上，一旦锁定失败就彻底动不了。
// 现在改成：锁定可用就用锁定，不可用就按住鼠标拖动转视角，两种都能走。
let pointerLockFailed = false;
let dragging = false;
let lastMouse = { x: 0, y: 0 };
const LOOK_SENS = 0.0032;

function showToast(msg, duration = 2500) {
  if (!opts?.mobileToast) return;
  const t = opts.mobileToast;
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 300);
  }, duration);
}

function updateJoystick(cx, cy) {
  const dx = cx - joystickOrigin.x;
  const dy = cy - joystickOrigin.y;
  const dist = Math.min(Math.hypot(dx, dy), JOYSTICK_MAX_R);
  const angle = Math.atan2(dy, dx);
  opts.joystickThumb.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
  joystickValue.x = Math.max(-1, Math.min(1, dx / JOYSTICK_MAX_R));
  joystickValue.y = Math.max(-1, Math.min(1, dy / JOYSTICK_MAX_R));
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
      const rect = opts.joystickBase.getBoundingClientRect();
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
      opts.joystickThumb.style.transform = 'translate(0px, 0px)';
    }
    if (touch.identifier === lastTouchId) {
      touchStart = null;
      lastTouchId = null;
      touchLast = null;
    }
  }
}

export function enterMobileMode() {
  if (mobileActive) return;
  mobileActive = true;
  opts.mobileControls.style.display = 'block';
  euler.setFromQuaternion(camera.quaternion);
  camera.rotation.order = 'YXZ';
  showToast('拖动屏幕环顾四周，摇杆移动');

  document.addEventListener('touchstart', onTouchStart, { passive: false });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd);
  document.addEventListener('touchcancel', onTouchEnd);

  opts.lookBtn.classList.add('active');
  renderer.domElement.addEventListener('touchstart', onCanvasTouch, { passive: false });
}

export function initControls(options) {
  opts = options;

  opts.lookBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    mobileLookActive = !mobileLookActive;
    if (mobileLookActive) {
      opts.lookBtn.classList.add('active');
      showToast('环顾模式：拖动屏幕旋转视角');
    } else {
      opts.lookBtn.classList.remove('active');
      showToast('环顾已锁定，摇杆移动');
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.code in keys) keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code in keys) keys[e.code] = false;
  });

  if (IS_MOBILE) return;

  // 浏览器拒绝指针锁定（常见于 iframe / 预览面板）→ 切到拖动转视角。
  // 不能只靠 pointerlockerror 事件：有些环境点了锁不上但也不报错，
  // 所以点击后过一小会儿回头检查一次，没锁上就启用拖动模式。
  const enableDragLook = () => {
    if (pointerLockFailed) return;
    pointerLockFailed = true;
    document.body.classList.add('drag-look');
    showToast('指针锁定不可用，按住鼠标拖动即可转视角', 4500);
  };
  document.addEventListener('pointerlockerror', enableDragLook);

  renderer.domElement.addEventListener('click', () => {
    if (!controls || controls.isLocked) return;
    try { controls.lock(); } catch { enableDragLook(); return; }
    setTimeout(() => {
      if (!controls.isLocked) enableDragLook();
    }, 350);
  });

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (controls?.isLocked || e.button !== 0) return;
    dragging = true;
    lastMouse = { x: e.clientX, y: e.clientY };
    document.body.classList.add('dragging');
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    document.body.classList.remove('dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging || controls?.isLocked) return;
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    lastMouse = { x: e.clientX, y: e.clientY };
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= dx * LOOK_SENS;
    euler.x -= dy * LOOK_SENS;
    euler.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, euler.x));
    camera.quaternion.setFromEuler(euler);
  });
}

// 桌面上是否处于"可走动"状态。
//
// 这里故意不跟指针锁定绑定：上一版写成"只有 isLocked 才能走"，
// 结果浏览器拒绝 Pointer Lock 时（iframe / 预览面板）玩家彻底动不了。
// 能不能走动跟怎么看是两件事，桌面上就一律允许，菜单打开时由 main.js 挡掉。
export function canWalk() {
  if (IS_MOBILE) return mobileActive;
  return true;
}

// 玩家身体位置（桌面端是 controls.object，移动端就是相机）
export function getBody() {
  return controls?.isLocked ? controls.object : camera;
}

function tryMove(body, step) {
  const p = body.position;
  const nx = p.x + moveDir.x * step;
  const nz = p.z + moveDir.z * step;
  // 分轴尝试，贴墙时还能沿着墙滑
  if (opts.canStand(nx, p.z)) p.x = nx;
  if (opts.canStand(p.x, nz)) p.z = nz;
}

export function updateMovement(dt) {
  moveDir.set(0, 0, 0);

  if (IS_MOBILE && mobileActive) {
    if (Math.abs(joystickValue.x) > 0.08 || Math.abs(joystickValue.y) > 0.08) {
      moveDir.set(-joystickValue.x, 0, joystickValue.y);
      moveDir.applyQuaternion(camera.quaternion);
      moveDir.y = 0;
      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        tryMove(camera, MOVE_SPEED * dt);
      }
    }
  } else if (canWalk()) {
    if (keys.KeyW) moveDir.z -= 1;
    if (keys.KeyS) moveDir.z += 1;
    if (keys.KeyA) moveDir.x -= 1;
    if (keys.KeyD) moveDir.x += 1;
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      moveDir.applyQuaternion(camera.quaternion);
      moveDir.y = 0;
      moveDir.normalize();
      tryMove(camera, MOVE_SPEED * dt);
    }
  }

  getBody().position.y = EYE_HEIGHT;
}
