// 输入控制:桌面(PointerLock)+ 移动端(摇杆/触控)+ 键盘 + 碰撞 + 门交互
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { camera, scene, renderer } from './scene.js';
import { IS_MOBILE, EYE_HEIGHT, MOVE_SPEED, DOOR_HALF_W, DOOR_H, DOOR_TRIGGER_DIST } from './config.js';
import { doorWorldPos } from './room.js';

export const controls = IS_MOBILE ? null : new PointerLockControls(camera, document.body);

export let nearDoor = false;
let doorCooldown = false; // 自动传送防抖

// 移动端状态
let mobileActive = false;
let mobileLookActive = true;
let joystickActive = false;
let joystickId = null;
let joystickOrigin = { x: 0, y: 0 };
const joystickValue = { x: 0, y: 0 };
const JOYSTICK_MAX_R = 62;
let euler = new THREE.Euler(0, 0, 0, 'YXZ');
let touchStart = null;
let lastTouchId = null;
let touchLast = null;

const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
const moveDir = new THREE.Vector3();

let opts = null; // { blocker, mobileControls, joystickBase, joystickThumb, doorPrompt, doorPromptMobile, doorBtn, lookBtn, mobileToast, onDoorEnter, getRoomHalf }

function showToast(msg, duration = 2500) {
  if (!opts) return;
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

function collide(pos) {
  const margin = 0.35;
  const ROOM_HALF = opts.getRoomHalf();
  const hx = ROOM_HALF - margin;
  const hz = ROOM_HALF - margin;
  if (pos.x < -hx || pos.x > hx) return false;
  if (pos.z < -hz) return false;
  if (pos.z > hz) {
    const inDoorX = Math.abs(pos.x) <= DOOR_HALF_W + 0.25;
    const inDoorY = pos.y >= 0 && pos.y <= DOOR_H + 0.2;
    if (inDoorX && inDoorY) return true;
    return false;
  }
  return true;
}

export function initControls(options) {
  opts = options;

  // 展厅选择菜单替代了 blocker,进入/退出由 main.js 管理
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
}

// 每帧更新移动与门提示
export function updateMovement(dt) {
  moveDir.set(0, 0, 0);

  if (IS_MOBILE && mobileActive) {
    if (Math.abs(joystickValue.x) > 0.08 || Math.abs(joystickValue.y) > 0.08) {
      moveDir.set(-joystickValue.x, 0, joystickValue.y);
      moveDir.applyQuaternion(camera.quaternion);
      moveDir.y = 0;
      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        const step = MOVE_SPEED * dt;
        const p = camera.position;
        const ox = p.x;
        p.x += moveDir.x * step;
        if (!collide(p)) p.x = ox;
        const oz = p.z;
        p.z += moveDir.z * step;
        if (!collide(p)) p.z = oz;
      }
    }
  } else if (controls?.isLocked) {
    if (keys.KeyW) moveDir.z -= 1;
    if (keys.KeyS) moveDir.z += 1;
    if (keys.KeyA) moveDir.x -= 1;
    if (keys.KeyD) moveDir.x += 1;
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      moveDir.applyQuaternion(camera.quaternion);
      moveDir.y = 0;
      moveDir.normalize();
      const step = MOVE_SPEED * dt;
      const p = controls.object.position;
      const ox = p.x;
      p.x += moveDir.x * step;
      if (!collide(p)) p.x = ox;
      const oz = p.z;
      p.z += moveDir.z * step;
      if (!collide(p)) p.z = oz;
    }
  }

  if (IS_MOBILE && mobileActive) {
    camera.position.y = EYE_HEIGHT;
  } else if (controls?.isLocked) {
    controls.object.position.y = EYE_HEIGHT;
  }

  // 门检测:靠近门自动切换展厅(防抖 1.5s,传送后位置重置远离门)
  const bodyPos = (controls?.isLocked) ? controls.object.position : camera.position;
  const dist = Math.hypot(bodyPos.x - doorWorldPos.x, bodyPos.z - doorWorldPos.z);
  const ROOM_HALF = opts.getRoomHalf();
  nearDoor = dist < DOOR_TRIGGER_DIST && bodyPos.z > ROOM_HALF - 6;

  if (nearDoor && !doorCooldown) {
    doorCooldown = true;
    opts.onDoorEnter();
    setTimeout(() => { doorCooldown = false; }, 1500);
  }
}
