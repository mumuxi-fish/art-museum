// 整座馆的构建：地板 / 天花 / 墙段 / 门套 / 画作 / 名牌 / 射灯 / 标识牌
//
// 和上一版的区别：以前是"一次建一个房间，切展厅就整间重建"，现在是一张连续平面图，
// 七个空间（门厅 + 主廊 + 五个展厅）一次性建好，玩家一路走过去，不再有传送。

import * as THREE from 'three';
import { scene } from './scene.js';
import {
  makeFloorTexture,
  getFallbackTexture,
  getPlaceholderTexture,
  makeLabelTexture,
  makeRoomSignTexture,
  makeDirectoryBoardTexture,
  makeThemeLabelTexture,
} from './textures.js';
import { buildRoomLights } from './lights.js';

let museumGroup = null;

const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const STD = (o) => new THREE.MeshStandardMaterial(o);

function mat(color, opts = {}) {
  return STD({ color, roughness: 0.88, metalness: 0.02, ...opts });
}

export function disposeMuseum() {
  if (!museumGroup) return;
  scene.remove(museumGroup);
  museumGroup.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const m = obj.material;
    if (!m) return;
    const list = Array.isArray(m) ? m : [m];
    list.forEach((x) => {
      // 画作/名牌的贴图是全局缓存共用的，只解绑不销毁
      if (x.userData?.keepMap) {
        x.map = null;
        x.emissiveMap = null;
      } else if (x.map) {
        x.map.dispose();
        x.map = null;
      }
      x.dispose();
    });
  });
  museumGroup = null;
}

// 墙板：每个房间在自己边界内侧各建半厚的墙，两个房间之间自然形成整墙厚。
// 这样层高不同的两个房间可以各建各的 —— 走廊看到走廊的墙，展厅看到展厅的墙。
function wallBox(room, wall, wallT) {
  const half = wallT / 2;
  const len = wall.to - wall.from;
  const y0 = wall.y0 ?? 0;
  const y1 = wall.y1 ?? room.height;
  const h = y1 - y0;
  const cy = (y0 + y1) / 2;
  const mid = (wall.from + wall.to) / 2;
  switch (wall.side) {
    case 'north': return { w: len, h, d: half, x: mid, y: cy, z: room.z0 + half / 2 };
    case 'south': return { w: len, h, d: half, x: mid, y: cy, z: room.z1 - half / 2 };
    case 'west':  return { w: half, h, d: len, x: room.x0 + half / 2, y: cy, z: mid };
    default:      return { w: half, h, d: len, x: room.x1 - half / 2, y: cy, z: mid };
  }
}

function buildRoomShell(room, plan, lights) {
  const wallT = plan.wallThickness;
  const m = room.materials;

  const floorTex = makeFloorTexture(
    m.floorDark, m.floorLight, Math.max(room.w, room.d) / 2, m.floorType || 'checker',
  );
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.w, room.d),
    STD({ map: floorTex, roughness: 0.74, metalness: 0.06 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.cx, 0, room.cz);
  floor.receiveShadow = true;
  museumGroup.add(floor);

  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(room.w, room.d),
    STD({ color: m.ceilingColor || m.wallColor, roughness: 1, metalness: 0 }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(room.cx, room.height, room.cz);
  ceil.receiveShadow = true;
  museumGroup.add(ceil);

  const wallMat = mat(m.wallColor);
  const baseColor = new THREE.Color(m.wallColor).multiplyScalar(0.72);
  const baseMat = mat(baseColor.getHex(), { roughness: 0.8 });

  for (const wall of room.walls) {
    const g = wallBox(room, wall, wallT);
    const mesh = new THREE.Mesh(BOX(g.w, g.h, g.d), wallMat);
    mesh.position.set(g.x, g.y, g.z);
    mesh.castShadow = wall.kind === 'solid';
    mesh.receiveShadow = true;
    museumGroup.add(mesh);

    // 踢脚线：便宜但很能提升"装修完成度"
    if (wall.kind === 'solid') {
      const bh = 0.11, bd = 0.03;
      let bx = g.x, bz = g.z, bw = g.w, bdp = g.d;
      if (wall.side === 'north' || wall.side === 'south') {
        bdp = bd;
        bz = wall.side === 'north' ? room.z0 + wallT + bd / 2 : room.z1 - wallT - bd / 2;
      } else {
        bw = bd;
        bx = wall.side === 'west' ? room.x0 + wallT + bd / 2 : room.x1 - wallT - bd / 2;
      }
      const base = new THREE.Mesh(BOX(bw, bh, bdp), baseMat);
      base.position.set(bx, bh / 2, bz);
      base.receiveShadow = true;
      museumGroup.add(base);
    }
  }

  buildRoomLights(room, museumGroup, lights);
}

// 门套：门洞两侧竖框 + 上方横框，让"通过"有实体感
function buildDoorCasing(op, plan) {
  const depth = plan.wallThickness + 0.06;
  const t = 0.09;
  const owner = plan.byId.get(op.rooms[0]);
  const accent = owner?.materials?.accentColor ?? 0x6B5B45;
  const doorMat = mat(accent, { roughness: 0.62, metalness: 0.16 });

  const g = new THREE.Group();
  if (op.axis === 'x') {
    [-1, 1].forEach((s) => {
      const jamb = new THREE.Mesh(BOX(depth, op.height, t), doorMat);
      jamb.position.set(op.at, op.height / 2, s > 0 ? op.to : op.from);
      g.add(jamb);
    });
    const head = new THREE.Mesh(BOX(depth, t, op.width + t * 2), doorMat);
    head.position.set(op.at, op.height + t / 2, (op.from + op.to) / 2);
    g.add(head);
  } else {
    [-1, 1].forEach((s) => {
      const jamb = new THREE.Mesh(BOX(t, op.height, depth), doorMat);
      jamb.position.set(s > 0 ? op.to : op.from, op.height / 2, op.at);
      g.add(jamb);
    });
    const head = new THREE.Mesh(BOX(op.width + t * 2, t, depth), doorMat);
    head.position.set((op.from + op.to) / 2, op.height + t / 2, op.at);
    g.add(head);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  museumGroup.add(g);
}

// 展厅长凳：一块木坐板 + 两片支撑板。美术馆里一定有它，
// 而且有了它才谈得上"坐下看画"这个交互。
function buildBench(bench, room, benchTargets) {
  const g = new THREE.Group();
  const wood = mat(room.materials.frameColor || 0x4a3f36, {
    roughness: 0.62, metalness: 0.04,
  });
  const seat = new THREE.Mesh(BOX(bench.w, 0.1, bench.d), wood);
  seat.position.y = bench.seatY;
  g.add(seat);
  [-1, 1].forEach((s) => {
    const leg = new THREE.Mesh(BOX(0.09, bench.seatY, bench.d - 0.06), wood);
    leg.position.set(s * (bench.w / 2 - 0.14), bench.seatY / 2, 0);
    g.add(leg);
  });
  g.position.set(bench.x, 0, bench.z);
  g.rotation.y = bench.rotY || 0;
  museumGroup.add(g);

  if (benchTargets) {
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.bench = bench;
      benchTargets.push(o);
    });
  }
}

// 走廊尽头的雕塑端景：青铜抽象形体立在石质基座上，顶上一盏射灯
function buildSculpture(sc) {
  const plinthMat = mat(0xCFC9BD, { roughness: 0.85, metalness: 0.02 });
  const plinth = new THREE.Mesh(BOX(sc.plinth, sc.plinthH, sc.plinth), plinthMat);
  plinth.position.set(sc.x, sc.plinthH / 2, sc.z);
  museumGroup.add(plinth);

  // 拉成一条细长的竖向形体。上一版半径给到 0.28，1.95m 高显得像个圆墩子，
  // 收到 0.21 之后比例才立得住。
  const profile = [
    [0.001, 0.00], [0.22, 0.03], [0.24, 0.15], [0.17, 0.31], [0.13, 0.52],
    [0.145, 0.74], [0.115, 1.00], [0.075, 1.30], [0.088, 1.58], [0.052, 1.88],
    [0.024, 2.06], [0.001, 2.16],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bronze = STD({
    color: 0xCBA76B, roughness: 0.28, metalness: 0.34,
  });
  const piece = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), bronze);
  piece.position.set(sc.x, sc.plinthH, sc.z);
  museumGroup.add(piece);

  const target = new THREE.Object3D();
  target.position.set(sc.x, sc.plinthH + sc.height * 0.5, sc.z);
  museumGroup.add(target);
  const spot = new THREE.SpotLight(0xfff1d8, 42, 6.5, 0.36, 0.6, 1.6);
  spot.position.set(sc.x, sc.plinthH + sc.height + 1.3, sc.z);
  spot.target = target;
  museumGroup.add(spot);
  return spot;
}

// 走廊里的展厅导言展签。走廊侧放不下时（花语的门洞几乎占满走廊宽度），
// 退回到展厅内部、门洞旁边。
function buildThemeLabel(room, plan, corridor) {
  const op = plan.openings.find(
    (o) => o.rooms.includes(room.id) && o.rooms.includes(corridor.id),
  );
  if (!op) return;

  const off = plan.wallThickness / 2 + 0.04;
  const PW = 0.85, PH = 0.62, Y = 1.5;
  const along = PW; // 展签宽边沿墙展开

  const tryPlace = (axis, at, side, from, to, lim0, lim1) => {
    const mid = (from + to) / 2;
    const half = (to - from) / 2;
    const cands = [mid + half + along / 2 + 0.35, mid - half - along / 2 - 0.35];
    const v = cands.find((c) => c >= lim0 + along / 2 + 0.25 && c <= lim1 - along / 2 - 0.25);
    if (v === undefined) return null;
    if (axis === 'z') {
      const corridorIsNorth = corridor.z1 <= at + 0.01;
      return {
        x: v,
        z: at + (corridorIsNorth ? -off : off),
        rotY: corridorIsNorth ? Math.PI : 0,
        facingRoom: side,
      };
    }
    const corridorIsWest = corridor.x1 <= at + 0.01;
    return {
      x: at + (corridorIsWest ? -off : off),
      z: v,
      rotY: corridorIsWest ? -Math.PI / 2 : Math.PI / 2,
      facingRoom: side,
    };
  };

  // 先在走廊侧试
  let pos = null;
  if (op.axis === 'z') {
    pos = tryPlace('z', op.at, 'corridor', op.from, op.to, corridor.x0, corridor.x1);
  } else {
    pos = tryPlace('x', op.at, 'corridor', op.from, op.to, corridor.z0, corridor.z1);
  }
  // 放不下就放到展厅内侧、同一面墙上
  if (!pos) {
    const at = op.at;
    if (op.axis === 'z') {
      pos = tryPlace('z', at, 'room', op.from, op.to, room.x0, room.x1);
      if (pos) pos.z = at + (room.z0 >= at ? off : -off);
      if (pos) pos.rotY = room.z0 >= at ? 0 : Math.PI;
    } else {
      pos = tryPlace('x', at, 'room', op.from, op.to, room.z0, room.z1);
      if (pos) pos.x = at + (room.x0 >= at ? off : -off);
      if (pos) pos.rotY = room.x0 >= at ? Math.PI / 2 : -Math.PI / 2;
    }
  }
  if (!pos) return;

  const tex = makeThemeLabelTexture(room.name, room.blurb || '', room.arts?.length || 0);
  const labelMat = STD({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.26,
    roughness: 0.85, metalness: 0,
  });
  labelMat.userData.keepMap = true;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), labelMat);
  panel.position.set(pos.x, Y, pos.z);
  panel.rotation.y = pos.rotY;
  museumGroup.add(panel);

  const frame = new THREE.Mesh(
    BOX(PW + 0.07, PH + 0.07, 0.03),
    mat(room.materials.frameColor, { roughness: 0.65, metalness: 0.08 }),
  );
  frame.position.set(pos.x, Y, pos.z);
  frame.rotation.y = pos.rotY;
  frame.translateZ(-0.025);
  museumGroup.add(frame);
}

// 画作射灯：按画面宽度反算锥角，让光锥刚好罩住画面，墙上不留光晕
function addArtSpotlight(pos, rotY, artWidth, hero, artLight, roomId) {
  const nx = Math.sin(rotY);
  const nz = Math.cos(rotY);
  const out = 2.2;
  const up = 1.5;
  const dist = Math.hypot(out, up);
  const halfW = Math.max(artWidth, 0.9) / 2 + 0.22;
  const angle = Math.min(0.85, Math.max(0.24, Math.atan2(halfW, dist)));

  const target = new THREE.Object3D();
  target.position.copy(pos);
  museumGroup.add(target);

  const cfg = artLight || { base: 8.5, hero: 11.5 };
  const light = new THREE.SpotLight(
    0xfff4e2, hero ? cfg.hero : cfg.base, 9.5, angle, 0.74, 2,
  );
  light.position.set(pos.x + nx * out, pos.y + up, pos.z + nz * out);
  light.castShadow = false;
  light.target = target;
  light.userData.roomId = roomId;
  museumGroup.add(light);
  return light;
}

function buildArtworks(room, plan, lights, artSlots, artTargets) {
  if (!room.arts?.length) return;
  const m = room.materials;
  const frameWood = mat(m.frameColor || 0x4a3f36, {
    roughness: m.frameRoughness ?? 0.7,
    metalness: m.frameMetalness ?? 0.05,
  });
  const placeholder = getPlaceholderTexture();

  room.arts.forEach((a, i) => {
    const seed = `${a.id || i}|${a.title || ''}`;

    const bw = a.size.width + 0.16;
    const bh = a.size.height + 0.16;
    const frame = new THREE.Mesh(BOX(bw, bh, 0.07), frameWood);

    // 画布加一点自发光补偿。漫反射是 albedo/π，像惠斯勒夜曲那种本来就接近全黑的画，
    // 再怎么加射灯也提不亮（乘出来还是黑的）。真实美术馆靠人眼宽容度，
    // 这里用一点点自发光把暗部托起来，代价是整体对比度略降。
    const canvasMat = STD({
      map: placeholder,
      emissive: 0xffffff,
      emissiveMap: placeholder,
      emissiveIntensity: 0.15,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    canvasMat.userData.keepMap = true;
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(a.size.width, a.size.height), canvasMat);
    canvas.position.z = 0.045;

    const grp = new THREE.Group();
    grp.add(frame, canvas);

    if (a.title) {
      const labelTex = makeLabelTexture(a.title, a.artist || '', a.year || '');
      const labelW = Math.min(Math.max(a.size.width * 0.78, 0.62), 1.05);
      const labelH = labelW * (160 / 512);
      const labelMat = STD({
        map: labelTex,
        emissive: 0xffffff,
        emissiveMap: labelTex,
        emissiveIntensity: 0.35,
        roughness: 0.85,
        metalness: 0,
      });
      labelMat.userData.keepMap = true;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(labelW, labelH), labelMat);
      label.position.set(0, -(a.size.height / 2) - labelH / 2 - 0.22, 0.05);
      grp.add(label);
    }

    grp.position.set(a.position.x, a.position.y, a.position.z);
    grp.rotation.order = 'YXZ';
    grp.rotation.y = a.rotation?.y ?? 0;
    grp.rotation.z = a.rotation?.z ?? 0;

    frame.castShadow = true;
    canvas.castShadow = true;
    museumGroup.add(grp);
    lights.push(addArtSpotlight(
      grp.position, grp.rotation.y, a.size.width, a.hero, room.artLight, room.id,
    ));

    if (a.image && !artSlots.has(a.image)) {
      artSlots.set(a.image, { material: canvasMat, fallbackSeed: seed, hue: a.hue ?? 0.5 });
    }
    // 供交互系统射线拾取：瞄到画布就能弹出详情
    canvas.userData.art = a;
    canvas.userData.roomId = room.id;
    artTargets.push(canvas);
  });
}

// 展厅入口上方的名牌：挂在走廊那一侧
function buildGallerySign(room, plan, corridor) {
  const op = plan.openings.find(
    (o) => o.rooms.includes(room.id) && o.rooms.includes(corridor.id),
  );
  if (!op) return;

  const off = plan.wallThickness / 2 + 0.03;
  let x, z, rotY;
  if (op.axis === 'x') {
    const corridorIsWest = corridor.x1 <= op.at + 0.01;
    x = op.at + (corridorIsWest ? -off : off);
    z = (op.from + op.to) / 2;
    rotY = corridorIsWest ? -Math.PI / 2 : Math.PI / 2;
  } else {
    const corridorIsNorth = corridor.z1 <= op.at + 0.01;
    z = op.at + (corridorIsNorth ? -off : off);
    x = (op.from + op.to) / 2;
    rotY = corridorIsNorth ? Math.PI : 0;
  }

  const tex = makeRoomSignTexture(room.name, `${room.arts.length} 幅作品`);
  const signMat = STD({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28,
    roughness: 0.8, metalness: 0,
  });
  signMat.userData.keepMap = true;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), signMat);
  sign.position.set(x, plan.openingHeight + 0.55, z);
  sign.rotation.y = rotY;
  museumGroup.add(sign);
}

// 门厅：导览牌 + 入口大门
function buildEntranceSigns(room) {
  for (const sign of room.signs || []) {
    if (sign.kind === 'directory') {
      const tex = makeDirectoryBoardTexture(
        room._planRooms.map((r) => ({
          id: r.id, name: r.name, kind: r.kind,
          x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1,
        })),
        room.id,
      );
      const boardMat = STD({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.32,
        roughness: 0.85, metalness: 0,
      });
      boardMat.userData.keepMap = true;
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(sign.size.width, sign.size.height), boardMat,
      );
      board.position.set(sign.position.x, sign.position.y, sign.position.z);
      board.rotation.y = sign.rotation?.y ?? 0;
      museumGroup.add(board);

      const fr = new THREE.Mesh(
        BOX(sign.size.width + 0.12, sign.size.height + 0.12, 0.04),
        mat(room.materials.frameColor, { roughness: 0.6, metalness: 0.1 }),
      );
      fr.position.set(sign.position.x, sign.position.y, sign.position.z - 0.035);
      fr.rotation.y = sign.rotation?.y ?? 0;
      museumGroup.add(fr);
    } else if (sign.kind === 'frontdoors') {
      const doorMat = mat(room.materials.doorColor, { roughness: 0.55, metalness: 0.08 });
      const handleMat = mat(0xc9a227, { roughness: 0.3, metalness: 0.9 });
      const leafW = sign.size.width / 2 - 0.06;
      const leafH = sign.size.height;
      [-1, 1].forEach((s) => {
        const leaf = new THREE.Mesh(BOX(0.07, leafH, leafW), doorMat);
        leaf.position.set(sign.position.x, leafH / 2, sign.position.z + s * (leafW / 2 + 0.03));
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        museumGroup.add(leaf);

        const handle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), handleMat);
        handle.position.set(sign.position.x + 0.06, 1.05, sign.position.z + s * 0.16);
        museumGroup.add(handle);
      });
    }
  }
}

export function buildMuseum(plan) {
  disposeMuseum();
  museumGroup = new THREE.Group();
  scene.add(museumGroup);

  const lights = [];
  const artSlots = new Map();
  const artTargets = [];
  const benches = [];
  const benchTargets = [];

  for (const room of plan.rooms) buildRoomShell(room, plan, lights);
  for (const op of plan.openings) buildDoorCasing(op, plan);

  const corridor = plan.rooms.find((r) => r.kind === 'corridor');
  for (const room of plan.rooms) {
    buildArtworks(room, plan, lights, artSlots, artTargets);

    for (const b of room.benches || []) {
      const entry = { ...b, roomId: room.id, roomName: room.name };
      buildBench(entry, room, benchTargets);
      benches.push(entry);
    }
    if (room.sculpture) lights.push(buildSculpture(room.sculpture));

    if (room.kind === 'gallery' && corridor) {
      buildGallerySign(room, plan, corridor);
      buildThemeLabel(room, plan, corridor);
    }
    if (room.kind === 'entrance') {
      room._planRooms = plan.rooms;
      buildEntranceSigns(room);
    }
  }

  return { group: museumGroup, lights, artSlots, artTargets, benches, benchTargets };
}
