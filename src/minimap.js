// 导览小地图：左下角的平面图，实时标出所在位置和朝向。
//
// 用 HTML Canvas 2D 而不是 3D 里的贴图 —— 每帧只重绘十来个矩形和
// 一个三角，开销可以忽略，而且线条清晰、完全不占渲染管线。

let cv = null;
let ctx = null;
let roomEl = null;
let rooms = [];
let galleryIndex = new Map(); // roomId -> 展厅序号（1 起）
let view = null;              // 世界坐标 → 画布坐标的映射
let lastLabel = null;
let frame = 0;

// 小地图上各类型空间的底色
const FILL = {
  entrance: 'rgba(240, 235, 227, 0.13)',
  corridor: 'rgba(240, 235, 227, 0.09)',
  gallery: 'rgba(240, 235, 227, 0.13)',
};
const CUR_FILL = 'rgba(127, 212, 196, 0.30)';
const CUR_LINE = 'rgba(127, 212, 196, 0.9)';
const LINE = 'rgba(240, 235, 227, 0.30)';

export function initMinimap(plan, canvas, labelEl) {
  if (!plan || !canvas) return;
  cv = canvas;
  ctx = cv.getContext('2d');
  roomEl = labelEl;
  rooms = plan.rooms || [];

  (plan.galleries || []).forEach((r, i) => galleryIndex.set(r.id, i + 1));

  // 算出整体包围盒，等比缩放塞进画布
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.x0); maxX = Math.max(maxX, r.x1);
    minZ = Math.min(minZ, r.z0); maxZ = Math.max(maxZ, r.z1);
  }
  const W = cv.width, H = cv.height;
  const PAD = 12;
  const spanX = maxX - minX, spanZ = maxZ - minZ;
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanZ);
  view = {
    scale,
    ox: (W - spanX * scale) / 2,
    oz: (H - spanZ * scale) / 2,
    minX,
    minZ,
  };
}

export function updateMinimap(camera, currentRoomId, plan) {
  if (!ctx || !view) return;
  // 20fps 足够顺，没必要每帧重画
  frame = (frame + 1) % 3;
  if (frame !== 0) return;

  const { scale, ox, oz, minX, minZ } = view;
  const W = cv.width, H = cv.height;
  const tx = (x) => ox + (x - minX) * scale;
  const tz = (z) => oz + (z - minZ) * scale;

  ctx.clearRect(0, 0, W, H);

  // 房间
  for (const r of rooms) {
    const x = tx(r.x0), z = tz(r.z0);
    const w = (r.x1 - r.x0) * scale, h = (r.z1 - r.z0) * scale;
    const cur = r.id === currentRoomId;
    ctx.fillStyle = cur ? CUR_FILL : (FILL[r.kind] || FILL.gallery);
    ctx.fillRect(x, z, w, h);
    ctx.strokeStyle = cur ? CUR_LINE : LINE;
    ctx.lineWidth = cur ? 2 : 1.2;
    ctx.strokeRect(x, z, w, h);
  }

  // 展厅序号
  ctx.font = '600 15px "PingFang SC", Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of rooms) {
    const n = galleryIndex.get(r.id);
    if (!n) continue;
    const cx = tx((r.x0 + r.x1) / 2);
    const cz = tz((r.z0 + r.z1) / 2);
    ctx.fillStyle = r.id === currentRoomId
      ? 'rgba(190, 245, 235, 0.95)'
      : 'rgba(240, 235, 227, 0.45)';
    ctx.fillText(String(n), cx, cz);
  }

  // 玩家：一个朝向三角
  const px = tx(camera.position.x);
  const pz = tz(camera.position.z);
  const yaw = camera.rotation.y;
  const dx = -Math.sin(yaw), dz = -Math.cos(yaw);   // 相机前方（画布坐标）
  const nx = -dz, nz = dx;                          // 垂直方向

  const L = 13, Wd = 6.5;
  ctx.beginPath();
  ctx.moveTo(px + dx * L, pz + dz * L);
  ctx.lineTo(px - dx * 5 + nx * Wd, pz - dz * 5 + nz * Wd);
  ctx.lineTo(px - dx * 5 - nx * Wd, pz - dz * 5 - nz * Wd);
  ctx.closePath();
  ctx.fillStyle = '#7fd4c4';
  ctx.fill();
  ctx.strokeStyle = 'rgba(10, 10, 14, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 当前空间名
  if (roomEl) {
    const name = plan?.rooms?.find((r) => r.id === currentRoomId)?.name || '';
    if (name !== lastLabel) {
      roomEl.textContent = name;
      lastLabel = name;
    }
  }
}
