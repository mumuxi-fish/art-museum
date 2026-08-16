// 全局常量配置
export const ROOM_HEIGHT = 8;
export const EYE_HEIGHT = 1.55;
export const MOVE_SPEED = 5.5;
export const DOOR_HALF_W = 1.6;
export const DOOR_H = 3.8;
export const DOOR_TRIGGER_DIST = 2.8;

export const IS_MOBILE =
  /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) ||
  ('ontouchstart' in window && window.innerWidth <= 768);
