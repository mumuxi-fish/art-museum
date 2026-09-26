// 全局常量配置
export const ROOM_HEIGHT = 6.0;
export const EYE_HEIGHT = 1.62;
export const MOVE_SPEED = 4.2;

// 灯光按距离剔除的半径。整座馆有 117 盏灯，全开会把 shader 撑爆；
// 隔着墙也看不见，所以只保留相机附近的。
export const LIGHT_CULL_RADIUS = 26;

export const IS_MOBILE =
  /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) ||
  ('ontouchstart' in window && window.innerWidth <= 768);

// 画作图片只有一个源：本地相对路径（兼容子路径部署）。
// 之前这里还有个 ART_CDN_BASE（jsDelivr 代理），是为国内直连 GitHub Pages
// 慢到 1–11 KB/s 加的。现在跑在本地，整条多源回退路径用不到，纯属复杂度。
