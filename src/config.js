// 全局常量配置
export const ROOM_HEIGHT = 6.0;
export const EYE_HEIGHT = 1.62;
export const MOVE_SPEED = 4.2;

// 灯光按距离剔除的半径。整座馆有 50 多盏灯，全开会把 shader 撑爆；
// 隔着墙也看不见，所以只保留相机附近的。
export const LIGHT_CULL_RADIUS = 26;

export const IS_MOBILE =
  /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) ||
  ('ontouchstart' in window && window.innerWidth <= 768);
