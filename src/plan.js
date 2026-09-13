// 平面图编译器：从房间矩形推导相邻关系、门洞、墙段和可行走区域
//
// 设计要点：
//   - 墙不共用。每个房间在自己的边界内侧各建半厚(0.15m)的墙板，
//     两个房间之间自然形成 0.3m 的墙厚。好处是层高不同的房间可以各建各的，
//     走廊一侧看到的是走廊的墙，展厅一侧看到的是展厅的墙。
//   - 门洞由相邻关系自动推导，不需要在数据里手写。
//   - 可行走区域 = 各房间内缩后的并集 + 每个门洞的通道矩形，
//     通道矩形负责把两个内缩区域之间的缝隙接起来。

export const PLAYER_RADIUS = 0.42;

function rectOf(room) {
  const { x, z } = room.center;
  const { w, d } = room.size;
  return { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 };
}

// 把 [from,to] 扣掉一组区间，返回剩下的实心段
function subtract(from, to, cuts) {
  let segs = [[from, to]];
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [s0, s1] of segs) {
      if (c1 <= s0 || c0 >= s1) { next.push([s0, s1]); continue; }
      if (c0 > s0) next.push([s0, c0]);
      if (c1 < s1) next.push([c1, s1]);
    }
    segs = next;
  }
  return segs.filter(([a, b]) => b - a > 0.001);
}

export function buildPlan(data) {
  const wallT = data.wallThickness ?? 0.3;
  const openW = data.opening?.width ?? 3.2;
  const openH = data.opening?.height ?? 3.0;

  const rooms = data.rooms.map((r) => {
    const rect = rectOf(r);
    return {
      ...r,
      ...rect,
      w: rect.x1 - rect.x0,
      d: rect.z1 - rect.z0,
      cx: r.center.x,
      cz: r.center.z,
      openings: [],
    };
  });
  const byId = new Map(rooms.map((r) => [r.id, r]));

  // ---- 相邻检测：两面墙贴合且重叠长度够，就开一个门洞 ----
  const openings = [];
  const EPS = 0.02;
  const MIN_OVERLAP = 2.0;
  let oid = 0;

  const addOpening = (a, b, axis, at, lo, hi) => {
    const width = Math.min(openW, hi - lo);
    const mid = (lo + hi) / 2;
    const from = mid - width / 2;
    const to = mid + width / 2;
    const op = { id: `op-${++oid}`, rooms: [a.id, b.id], axis, at, from, to, width, height: openH };
    openings.push(op);
    a.openings.push(op);
    b.openings.push(op);
  };

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      // 竖直贴合（共享一条 x 边）
      if (Math.abs(a.x1 - b.x0) < EPS) {
        const lo = Math.max(a.z0, b.z0);
        const hi = Math.min(a.z1, b.z1);
        if (hi - lo >= MIN_OVERLAP) addOpening(a, b, 'x', a.x1, lo, hi);
      } else if (Math.abs(b.x1 - a.x0) < EPS) {
        const lo = Math.max(a.z0, b.z0);
        const hi = Math.min(a.z1, b.z1);
        if (hi - lo >= MIN_OVERLAP) addOpening(b, a, 'x', a.x0, lo, hi);
      }
      // 水平贴合（共享一条 z 边）
      if (Math.abs(a.z1 - b.z0) < EPS) {
        const lo = Math.max(a.x0, b.x0);
        const hi = Math.min(a.x1, b.x1);
        if (hi - lo >= MIN_OVERLAP) addOpening(a, b, 'z', a.z1, lo, hi);
      } else if (Math.abs(b.z1 - a.z0) < EPS) {
        const lo = Math.max(a.x0, b.x0);
        const hi = Math.min(a.x1, b.x1);
        if (hi - lo >= MIN_OVERLAP) addOpening(b, a, 'z', a.z0, lo, hi);
      }
    }
  }

  // ---- 把每个房间的四条边拆成墙段 ----
  for (const room of rooms) {
    const sides = {
      north: { axis: 'z', at: room.z0, lo: room.x0, hi: room.x1 },
      south: { axis: 'z', at: room.z1, lo: room.x0, hi: room.x1 },
      west:  { axis: 'x', at: room.x0, lo: room.z0, hi: room.z1 },
      east:  { axis: 'x', at: room.x1, lo: room.z0, hi: room.z1 },
    };
    room.walls = [];
    for (const [side, s] of Object.entries(sides)) {
      const mine = openings.filter(
        (o) => o.axis === s.axis && Math.abs(o.at - s.at) < EPS
          && o.to > s.lo && o.from < s.hi,
      );
      const cuts = mine.map((o) => [Math.max(o.from, s.lo), Math.min(o.to, s.hi)]);
      for (const [a, b] of subtract(s.lo, s.hi, cuts)) {
        room.walls.push({ side, from: a, to: b, kind: 'solid' });
      }
      for (const o of mine) {
        room.walls.push({
          side,
          from: Math.max(o.from, s.lo),
          to: Math.min(o.to, s.hi),
          kind: 'lintel',
          y0: o.height,
          y1: room.height,
          opening: o,
        });
      }
    }
  }

  // ---- 家具障碍：长凳和雕塑基座不能穿过去 ----
  const obstacles = [];
  for (const room of rooms) {
    for (const b of room.benches || []) {
      const rotated = Math.abs(Math.sin(b.rotY || 0)) > 0.5;
      const hw = (rotated ? b.d : b.w) / 2;
      const hd = (rotated ? b.w : b.d) / 2;
      obstacles.push({ x0: b.x - hw, z0: b.z - hd, x1: b.x + hw, z1: b.z + hd });
    }
    if (room.sculpture) {
      const p = (room.sculpture.plinth || 0.9) / 2;
      obstacles.push({
        x0: room.sculpture.x - p, z0: room.sculpture.z - p,
        x1: room.sculpture.x + p, z1: room.sculpture.z + p,
      });
    }
  }

  // ---- 可行走判定 ----
  const M = PLAYER_RADIUS;
  function canStand(x, z) {
    for (const r of rooms) {
      if (x > r.x0 + M && x < r.x1 - M && z > r.z0 + M && z < r.z1 - M) {
        for (const o of obstacles) {
          if (x > o.x0 - M && x < o.x1 + M && z > o.z0 - M && z < o.z1 + M) return false;
        }
        return true;
      }
    }
    for (const o of openings) {
      if (o.axis === 'x') {
        if (Math.abs(x - o.at) < wallT / 2 + M && z > o.from + M && z < o.to - M) return true;
      } else if (Math.abs(z - o.at) < wallT / 2 + M && x > o.from + M && x < o.to - M) {
        return true;
      }
    }
    return false;
  }

  function roomAt(x, z) {
    for (const r of rooms) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
    }
    return null;
  }

  function openingBetween(aId, bId) {
    return openings.find(
      (o) => o.rooms.includes(aId) && o.rooms.includes(bId),
    ) || null;
  }

  return {
    wallThickness: wallT,
    openingHeight: openH,
    rooms,
    openings,
    obstacles,
    byId,
    canStand,
    roomAt,
    openingBetween,
    spawn: data.spawn || { x: 2, z: 2, yaw: 0 },
    galleries: rooms.filter((r) => r.kind === 'gallery'),
  };
}
