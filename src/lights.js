// 灯具 3D 模型与光源创建
import * as THREE from 'three';

function createCeilingLightFixture(color = '#fff5e8') {
  const group = new THREE.Group();
  const c = new THREE.Color(color);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.4 }),
  );
  base.position.y = -0.04;
  base.castShadow = true;
  group.add(base);

  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({
      color: c, roughness: 0.5, metalness: 0.1,
      transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    }),
  );
  shade.rotation.x = Math.PI;
  shade.position.y = -0.35;
  group.add(shade);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 12),
    new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.1,
    }),
  );
  bulb.position.y = -0.2;
  group.add(bulb);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.03, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.5 }),
  );
  ring.position.y = -0.65;
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

// 创建环境光 + 全部点光源;fixtures 用于记录以便清理
export function createLights({ lights, ambientIntensity }, scene, roomGroup, fixtures) {
  const ambient = new THREE.AmbientLight(0xffffff, ambientIntensity ?? 0.35);
  ambient.name = '__ambient';
  scene.add(ambient);
  fixtures.push({ group: null, lightObj: ambient });

  if (!lights) return;
  lights.forEach((ld) => {
    const useSpot = ld.type === 'ceiling';
    const fixtureGroup = useSpot ? createCeilingLightFixture(ld.color) : createWallLightFixture(ld.color);
    const color = new THREE.Color(ld.color);
    let lightObj;

    if (useSpot) {
      lightObj = new THREE.SpotLight(color, ld.enabled ? ld.intensity : 0, ld.range || 14, ld.angle || 1.2, ld.penumbra || 0.4, 2);
      lightObj.target.position.set(0, 0, -1);
      lightObj.castShadow = true;
      lightObj.shadow.mapSize.set(1024, 1024);
      lightObj.shadow.bias = -0.001;
    } else {
      lightObj = new THREE.SpotLight(color, ld.enabled ? ld.intensity : 0, ld.range || 10, ld.angle || 1.0, ld.penumbra || 0.6, 2);
      lightObj.target.position.set(0, 0, -1);
      lightObj.castShadow = false;
    }

    const pos = ld.position || { x: 0, y: 7.5, z: 0 };
    fixtureGroup.position.set(pos.x, pos.y, pos.z);
    lightObj.position.copy(fixtureGroup.position);

    if (ld.rotation) {
      fixtureGroup.rotation.set(ld.rotation.x || 0, ld.rotation.y || 0, ld.rotation.z || 0);
    }

    const dir = new THREE.Vector3(0, -1, 0);
    dir.applyQuaternion(fixtureGroup.quaternion);
    lightObj.target.position.copy(fixtureGroup.position).add(dir);

    scene.add(lightObj);
    scene.add(lightObj.target);
    roomGroup.add(fixtureGroup);
    fixtures.push({ group: fixtureGroup, lightObj });
  });
}
