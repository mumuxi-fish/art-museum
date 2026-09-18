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

// 画作图片的备用源。
//
// 起因：从国内访问 GitHub Pages 只有 1–11 KB/s（实测 apple.com 有 2.3 MB/s，
// 所以是本机到 GitHub 的链路被限速，不是代码问题）。4.3MB 的画作在那个速度下
// 要下好几分钟，表现为"加载很慢"和"图片出不来"。
//
// jsDelivr 能直接代理 GitHub 仓库，实测 8–41 KB/s（平均约 23 KB/s），
// 而且不需要额外账号。策略是：优先走 CDN，失败自动回退到本地相对路径，
// 两边都不通才重试。仓库改名或换成别的托管时，改这一行就行。
export const ART_CDN_BASE =
  'https://cdn.jsdelivr.net/gh/mumuxi-fish/art-museum@main/public/art/';
