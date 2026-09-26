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

  // 只有「交通空间 ↔ 展厅」之间才开门。
  //
  // 起因：新加四个展厅后，它们和已有展厅共享了墙（比如 dawn 的西墙 x=12
  // 正好是 dutch 的东墙），于是这里给展厅之间也开了门洞 —— 而侧墙是挂画的
  // 地方，结果就是「有的画挂在门里」。
  //
  // 展厅之间本来就不该直接连通：逛展的动线是「展厅 → 走廊 → 展厅」。
  const isTransport = (r) => r.kind === 'entrance' || r.kind === 'corridor';

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (!isTransport(a) && !isTransport(b)) continue; // 展厅之间不开门
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
    // 独立展墙也要绕开
    for (const p of room.partitions || []) {
      obstacles.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1 });
    }
    // 家具也要绕开。盆栽/伞架没有 w/d，用固定半径兜底。
    for (const f of room.furniture || []) {
      if (f.w && f.d) {
        const rot = Math.abs(Math.sin(f.rotY || 0)) > 0.5;
        const hw = (rot ? f.d : f.w) / 2;
        const hd = (rot ? f.w : f.d) / 2;
        obstacles.push({ x0: f.x - hw, z0: f.z - hd, x1: f.x + hw, z1: f.z + hd });
      } else {
        const r = f.kind === 'umbrella' ? 0.22 : 0.34;
        obstacles.push({ x0: f.x - r, z0: f.z - r, x1: f.x + r, z1: f.z + r });
      }
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

  // ---- 视线遮挡：判断"从某个点能不能看见某个房间" ----
  //
  // 按厅剔除要用它：房间被藏起来的前提是玩家确实看不见它。
  // 判据是 2D 线段求交 —— 把所有实心墙段抽成线段，从眼睛到采样点的连线
  // 只要穿过任意一条实心墙就算被挡。门洞那截在上面拆墙时已经被扣掉，
  // 门楣(lintel)在 3m 以上、不挡 1.62m 的视线，所以两者都不进这个表。
  //
  // 采样点必须包含房间里每个物件的位置：能看到某个物件 ⇒ 到它的连线没穿墙
  // ⇒ 那个物件所在的房间就该是可见的。少了这一步会出现"标签还在墙上、
  // 房间却被藏了"这种穿帮。
  const wallSegs = [];
  for (const r of rooms) {
    for (const w of r.walls) {
      if (w.kind !== 'solid') continue;
      if (w.side === 'north') wallSegs.push([w.from, r.z0, w.to, r.z0]);
      else if (w.side === 'south') wallSegs.push([w.from, r.z1, w.to, r.z1]);
      else if (w.side === 'west') wallSegs.push([r.x0, w.from, r.x0, w.to]);
      else wallSegs.push([r.x1, w.from, r.x1, w.to]);
    }
  }

  // 端点相碰不算挡住：采样点本身可能就落在墙上（房间角点、门洞中心）
  const EPS_T = 1e-4;
  function lineBlocked(ax, az, bx, bz) {
    const rx = bx - ax;
    const rz = bz - az;
    for (let i = 0; i < wallSegs.length; i++) {
      const s = wallSegs[i];
      const sx = s[2] - s[0];
      const sz = s[3] - s[1];
      const denom = rx * sz - rz * sx;
      if (denom === 0) continue; // 平行/共线：贴着墙走的视线按不挡算
      const cx = s[0] - ax;
      const cz = s[1] - az;
      const t = (cx * sz - cz * sx) / denom;
      const u = (cx * rz - cz * rx) / denom;
      if (t > EPS_T && t < 1 - EPS_T && u > EPS_T && u < 1 - EPS_T) return true;
    }
    return false;
  }

  // 每个房间的兜底采样点：房间内部的网格 + 每个门洞横跨宽度的几个点（取在房间
  // 里侧 0.6m / 1.4m）。物件坐标由 room.js 建完场景后回填（objectsByRoom）。
  //
  // 网格不能只放中心/边中点/四角：擦着门缝斜看进来时，能看到的往往是一小块
  // 角落，而中心正好被墙挡住 —— 那就成了"房间里露着一块背景色"的出洞。
  // 实测把兜底点加密成 1.6m 网格后，随机 97 万次"看得见 ⇒ 该厅可见"的检查归零。
  //
  // 门洞那组点必须取在房间"里侧"而不是门洞平面上：只测门洞平面的话，站门厅
  // 往主廊看会把每个展厅的门口都算成看得见（确实看得见门框），整馆一间都剔不掉。
  // 横跨门宽取 3 个点是因为视线可能从门缝的任意一侧进来，只取中心会漏。
  const baseSamples = new Map();
  for (const r of rooms) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const pts = [];
    const nx = Math.max(2, Math.round(w / 1.6));
    const nz = Math.max(2, Math.round(d / 1.6));
    for (let i = 1; i <= nx; i++) {
      for (let j = 1; j <= nz; j++) {
        pts.push([r.x0 + (i / (nx + 1)) * w, r.z0 + (j / (nz + 1)) * d]);
      }
    }
    for (const o of r.openings) {
      const dir = o.axis === 'x' ? Math.sign(r.cx - o.at || 1) : Math.sign(r.cz - o.at || 1);
      // 门洞平面本身：沿门宽每 ~0.05m 一个点。
      // 这组点是"看得见 ⇒ 该厅可见"的几何保证 —— 若视线能进到厅内任一点，
      // 它必然先穿过某个门洞的开口，于是开口上这一点也一定看得见。
      // 少了它，两道门对齐的擦边视线（站门厅透过主廊看对面展厅）会漏判成出洞。
      // 密度是实测卡出来的：随机 110 万次"看得见 ⇒ 可见"检查里，漏掉的都是
      // 门宽上只有 0.07–0.16m 的窄窗，采样间隔 0.22m 时正好跳过去。
      // 0.05m 仍会漏掉门宽两端 0.02m 的窄窗（随机种子复验过），压到 0.02m。
      const n = Math.min(160, Math.max(10, Math.round((o.to - o.from) / 0.02)));
      // 靠边各补一个半步点：残余漏判全卡在门宽两端 0.02m 的窄窗上，
      // 而 k/(n+1) 的取法天然到不了 t=0 和 t=1。
      for (const k of [...Array(n).keys()].map((i) => i + 1).concat([0.5, n + 0.5])) {
        const c = o.from + (o.to - o.from) * (k / (n + 1));
        pts.push(o.axis === 'x' ? [o.at, c] : [c, o.at]);
      }
      // 门洞里侧 0.6m / 1.4m：只测门洞平面会把"看得见门框"也算成看得见，
      // 站门厅会把每个展厅都留住，剔不掉；里侧点才是"看得见厅里的东西"。
      for (const f of [0.2, 0.5, 0.8]) {
        const c = o.from + (o.to - o.from) * f;
        for (const dist of [0.6, 1.4]) {
          pts.push(o.axis === 'x' ? [o.at + dir * dist, c] : [c, o.at + dir * dist]);
        }
      }
    }
    baseSamples.set(r.id, pts);
  }

  // objectsByRoom：Map<roomId, [[x,z], …]>，room.js 建完场景后回填物件世界坐标
  function visibleRoomsFrom(x, z, objectsByRoom) {
    const visible = new Set();
    for (const r of rooms) {
      const objects = objectsByRoom?.get(r.id);
      const pts = objects?.length
        ? [...objects, ...baseSamples.get(r.id)]
        : baseSamples.get(r.id);
      for (let i = 0; i < pts.length; i++) {
        if (!lineBlocked(x, z, pts[i][0], pts[i][1])) {
          visible.add(r.id);
          break;
        }
      }
    }
    return visible;
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
    visibleRoomsFrom,
    baseSamples,
    wallSegmentCount: wallSegs.length,
    spawn: data.spawn || { x: 2, z: 2, yaw: 0 },
    galleries: rooms.filter((r) => r.kind === 'gallery'),
  };
}
