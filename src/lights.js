// 灯具 3D 模型与光源创建
//
// 和上一版的区别：不再按"一个房间一个 group"来建，而是直接在世界坐标里摆。
// 整座馆是一张连续的平面图，所有房间挂在同一个 group 下。

import * as THREE from 'three';

function createCeilingLightFixture(color = '#fff5e8') {
  const group = new THREE.Group();
  const c = new THREE.Color(color);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.4 }),
  );
  base.position.y = -0.03;
  group.add(base);

  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({
      color: c, roughness: 0.5, metalness: 0.1,
      transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    }),
  );
  shade.rotation.x = Math.PI;
  shade.position.y = -0.22;
  group.add(shade);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 12),
    new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.1,
    }),
  );
  bulb.position.y = -0.13;
  group.add(bulb);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.022, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.5 }),
  );
  ring.position.y = -0.42;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  return group;
}

function createWallLightFixture(color = '#ffe8d0') {
  const group = new THREE.Group();
  const c = new THREE.Color(color);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.6 }),
  );
  plate.position.z = 0.03;
  group.add(plate);

  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.5 }),
  );
  arm.position.set(0, -0.1, 0.18);
  arm.rotation.x = 0.4;
  group.add(arm);

  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.25, 12),
    new THREE.MeshStandardMaterial({
      color: c, roughness: 0.4, metalness: 0.1,
      transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    }),
  );
  shade.position.set(0, -0.22, 0.35);
  shade.rotation.x = -0.2;
  group.add(shade);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 10),
    new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.1,
    }),
  );
  bulb.position.set(0, -0.18, 0.3);
  group.add(bulb);

  return group;
}

// 按房间的 lights 配置在世界坐标里建灯，并把灯对象收进 out 供按房间剔除用
export function buildRoomLights(room, group, out) {
  (room.lights || []).forEach((ld) => {
    const useSpot = ld.type === 'ceiling';
    const fixture = useSpot ? createCeilingLightFixture(ld.color) : createWallLightFixture(ld.color);
    const pos = ld.position || { x: 0, y: 3, z: 0 };
    fixture.position.set(pos.x, pos.y, pos.z);
    if (ld.rotation) {
      fixture.rotation.set(ld.rotation.x || 0, ld.rotation.y || 0, ld.rotation.z || 0);
    }
    group.add(fixture);

    const color = new THREE.Color(ld.color);
    const light = new THREE.SpotLight(
      color,
      ld.enabled === false ? 0 : (ld.intensity ?? 30),
      ld.range || 14,
      ld.angle || 1.2,
      ld.penumbra ?? 0.4,
      2,
    );
    light.position.copy(fixture.position);

    const dir = new THREE.Vector3(0, -1, 0).applyQuaternion(fixture.quaternion);
    const target = new THREE.Object3D();
    target.position.copy(fixture.position).add(dir);
    group.add(target);
    light.target = target;

    light.userData.roomId = room.id;
    group.add(light);
    out.push(light);
  });
}
