// 本地文件夹 → 单厅美术馆平面图（纯数据，无 DOM / three 依赖，可在 Node 里自测）
//
// 布局（俯视，+x 向东，+z 向南）：
//
//     z=0  ┌──────────┬───────────────────────────────┐
//          │  入口     │  长厅（你的照片 / 影像）        │
//          │  6 × 7    │  L × 7                        │
//          │  spawn→   │  东墙=主位，北/南墙=长列       │
//     z=7  └──────────┴───────────────────────────────┘
//          x=0        x=6                            x=6+L
//
// 两间共用 x=6 那面墙，plan.js 会自动在中段开一个 3.2m 门洞（入口是 transport，
// 「展厅之间不开门」的规则管不到它）。第一件作品挂东墙主位 —— 站在门厅透过
// 门洞一眼就能望见；其余挂南北两面长墙，西墙（门洞所在）留空 —— 门洞里挂画是
// plan.js 明确要避免的坑。
//
// 照片和视频同为「pieces」一起上墙（视频用封面帧参与排版，room.js 那边换成动态贴图）。
// 纯音频不上墙，而是做成北/南墙照片之后的「听音点」站牌 —— 和照片同一行、
// 中间隔 0.8m，视觉上是一条独立的矮牌子；厅长会为站牌一起变长。
//
// 尺寸推导：单幅面积按张数反比缩放（照片少则挂大画幅，多则小幅），
// 长厅长度 = 两面墙各自需要的长度 + 两端留白，取大者，且不短于 14m。

const WALL_T = 0.3;
const OPEN = { width: 3.2, height: 3.0 };
const HANG_Y = 2.2;

const ENTRY_W = 6;
const ENTRY_D = 7;
const HALL_D = 7;
const HEIGHT = 4.4;
const HALL_X = ENTRY_W;      // 长厅西墙 = 门厅东墙
const MIN_HALL_LEN = 14;

const MAX_ART_W = 3.2;
const MAX_ART_H = 2.4;
const AREA_MIN = 1.4;
const AREA_MAX = 3.6;
const AREA_FULL = 72;        // 单幅面积 × 张数 ≈ 72 m²，图片张数再多也不至于铺成壁纸
const MARGIN = 1.5;          // 长厅两端留白
const GAP_MIN_COUNT = 24;    // 超过这个张数把画间距收窄
const SPOT_MAX = 12;         // 单厅射灯上限（灯全开会把 shader 拖垮，见 room.artLight.max）

// 听音点站牌：固定尺寸，和照片排在同一行（照片在前、站牌在后，中间隔开一截）
const PLATE_W = 0.95;
const PLATE_H = 0.62;
const PLATE_GAP = 0.3;       // 站牌与站牌
const PLATE_SEP = 0.8;       // 照片行与站牌行之间
const PLATE_Y = 1.15;        // 站牌中心高度（比画低一头，一眼看出是另一类东西）
const HERO_PLATE_Y = 1.6;    // 没有照片时，东墙主位那块站牌的高度

const r3 = (v) => Math.round(v * 1000) / 1000;
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 和 build-galleries.py 的 fit() 同一套算法：按真实宽高比缩放，
// 长边不超上限，面积贴近目标值。
function fit(w, h, maxW, maxH, area) {
  if (!w || !h) return { width: r3(maxW * 0.7), height: r3(maxH * 0.7) };
  const ar = w / h;
  const ww = Math.sqrt(area * ar);
  const hh = Math.sqrt(area / ar);
  const s = Math.min(1, maxW / ww, maxH / hh);
  return { width: r3(ww * s), height: r3(hh * s) };
}

function sumRange(sizes, from, to) {
  let s = 0;
  for (let i = from; i < to; i++) s += sizes[i].width;
  return s;
}

// 灯槽：走走廊规格（间距 7m 一盏），强度公式和 build-galleries.py 一致
function coveLights(id, count, x0, len) {
  const k = Math.pow((HEIGHT - 0.5) / 6, 2);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `${id}-light-${i + 1}`,
      name: `灯槽${i + 1}`,
      type: 'cove',
      position: { x: r3(x0 + ((i + 0.5) * len) / count), y: r3(HEIGHT - 0.06), z: HALL_D / 2 },
      rotation: { x: 0, y: 0, z: 0 },
      color: '#fffdf8',
      intensity: r1(58 * k),
      range: r1(HEIGHT * 4),
      angle: 1.42,
      penumbra: 0.85,
      enabled: true,
    });
  }
  return out;
}

// 墙灯：西墙两盏夹着门洞（sconce 夹门是真实美术馆常见做法），
// 东墙两盏夹着主位上的那张照片。绝不能压在门洞上 —— 长厅西墙中段就是 3.2m 的开口。
function wallLights(id, x0, x1) {
  const y = r3(HEIGHT * 0.56);
  const one = (suffix, x, z, rotY) => ({
    id: `${id}-wall-${suffix}`,
    name: suffix,
    type: 'wall',
    position: { x: r3(x), y, z: r3(z) },
    rotation: { x: 0, y: rotY, z: 0 },
    color: '#fff4ec',
    intensity: 16,
    range: 9,
    angle: 1.0,
    penumbra: 0.8,
    enabled: true,
  });
  return [
    one('west-1', x0, 1.0, Math.PI / 2),
    one('west-2', x0, HALL_D - 1.0, Math.PI / 2),
    one('east-1', x1, HALL_D / 2 - 2.2, -Math.PI / 2),
    one('east-2', x1, HALL_D / 2 + 2.2, -Math.PI / 2),
  ];
}

// 门厅灯：2×2 一组，和真实门厅同规格（intensity = 13 × k）
function entranceLights() {
  const k = Math.pow((HEIGHT - 0.5) / 6, 2);
  const spots = [[2.0, 2.0], [4.0, 2.0], [2.0, 5.0], [4.0, 5.0]];
  return spots.map(([x, z], i) => ({
    id: `entrance-light-${i + 1}`,
    name: `门厅灯槽${i + 1}`,
    type: 'cove',
    position: { x, y: r3(HEIGHT - 0.06), z },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#fffbf6',
    intensity: r1(13 * k),
    range: 12,
    angle: 1.3,
    penumbra: 0.6,
    enabled: true,
  }));
}

// 全馆一套清新白墙配色（和真实门厅一致）
const PALETTE = {
  wallColor: 15724265,
  ceilingColor: 14210510,
  accentColor: 7035717,
  floorDark: 11709603,
  floorLight: 15131355,
  floorType: 'stone',
  doorColor: 4076070,
  frameColor: 5916210,
  frameRoughness: 0.7,
  frameMetalness: 0.05,
};

// 秒 → 标签上的 "3:24"（超过一小时才补小时位）
function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

/**
 * @param {{image: string, title: string, w: number, h: number, video?: boolean, duration?: number}[]} pieces
 *   已按展示顺序排好：图片和视频一起上墙（视频以封面帧参与排版）
 * @param {{title?: string, audios?: {key: string, title: string, duration?: number}[]}} opts
 *   厅名（一般用文件夹名）+ 听音点列表
 * @returns 美术馆数据（plan.js 能直接编译的那份结构）
 */
export function buildMyGalleryPlan(pieces, opts = {}) {
  const n = pieces.length;
  const audios = opts.audios || [];
  const m = audios.length;
  if (!n && !m) throw new Error('没有可用的图片 / 视频 / 音频，生成不了展厅');

  const name = String(opts.title || '').trim() || '我的照片';
  const area = clamp(AREA_FULL / Math.max(n, 1), AREA_MIN, AREA_MAX);
  const gap = n <= GAP_MIN_COUNT ? 1.0 : 0.75;
  const sizes = pieces.map((p) => fit(p.w, p.h, MAX_ART_W, MAX_ART_H, area));

  // 第一件挂进门正对的东墙（主墙，一进门口就能从门洞里望见）；
  // 其余对半分：前一半北墙（进门先看），后一半南墙（走到头回头再看）
  const northFrom = n > 0 ? 1 : 0;
  const northCount = Math.ceil((n - northFrom) / 2);
  const southFrom = northFrom + northCount;

  // 听音点：有照片就跟在照片后面排同一行；一张照片都没有时，
  // 第一块牌子顶替主位挂东墙（纯音频文件夹进门口也有个落点）
  const heroPlate = n === 0 && m > 0 ? 0 : -1;
  const restAudios = heroPlate >= 0 ? audios.slice(1) : audios;
  const northAudioCount = Math.ceil(restAudios.length / 2);
  const southAudioCount = restAudios.length - northAudioCount;

  const photoRowLen = (from, to) => {
    if (to <= from) return 0;
    return sumRange(sizes, from, to) + (to - from - 1) * gap;
  };
  const audioRowLen = (k) => (k ? k * PLATE_W + (k - 1) * PLATE_GAP : 0);
  const rowLen = (from, to, k) => {
    const p = photoRowLen(from, to);
    const a = audioRowLen(k);
    return p + a + (p > 0 && a > 0 ? PLATE_SEP : 0);
  };

  const needNorth = rowLen(northFrom, southFrom, northAudioCount);
  const needSouth = rowLen(southFrom, n, southAudioCount);
  const len = Math.max(MIN_HALL_LEN, needNorth + 2 * MARGIN, needSouth + 2 * MARGIN);

  const x0 = HALL_X;
  const x1 = x0 + len;
  const zNorth = WALL_T / 2 + 0.02;
  const zSouth = HALL_D - WALL_T / 2 - 0.02;

  const arts = [];
  const makeArt = (i, wall, position, rotationY, hero = false) => {
    const p = pieces[i];
    const durText = p.video ? fmtDuration(p.duration) : '';
    arts.push({
      id: `my-art-${String(i + 1).padStart(2, '0')}`,
      title: p.title,
      artist: name,
      year: '',
      image: p.image,
      sortYear: 0,
      description: p.video ? (durText ? `循环播放 · ${durText}` : '循环播放') : (p.description || ''),
      // 详情浮层右侧的信息栏：视频件标注成影像装置，顺便给原始像素尺寸
      technique: p.video ? '影像装置' : '',
      dimensions: p.video ? `${p.w}×${p.h}` : '',
      wall,
      position,
      size: sizes[i],
      rotation: { y: rotationY, z: 0 },
      hue: 0.5,
      hero,
      video: Boolean(p.video),
    });
  };

  const stations = [];
  const makeStation = (a, wall, cx, z, rotationY, y = PLATE_Y) => {
    stations.push({
      key: a.key,
      title: a.title,
      duration: fmtDuration(a.duration),
      wall,
      position: { x: r3(cx), y: r3(y), z: r3(z) },
      rotation: { y: rotationY, z: 0 },
      size: { width: PLATE_W, height: PLATE_H },
    });
  };

  // 东墙主位：画心贴西边 0.17m（和南北墙同一套贴墙距离），正对门洞
  if (n > 0) {
    makeArt(0, 'east', { x: r3(x1 - WALL_T / 2 - 0.02), y: HANG_Y, z: HALL_D / 2 }, -Math.PI / 2, true);
  } else if (heroPlate >= 0) {
    // 纯音频：第一块牌子当主位，站在门厅就能看见
    makeStation(
      audios[heroPlate], 'east',
      x1 - WALL_T / 2 - 0.02, HALL_D / 2, -Math.PI / 2, HERO_PLATE_Y,
    );
  }

  // 一行里先排照片、隔一截、再排站牌；整行在墙的长度里居中
  const placeRow = (from, to, wall, z, audioList) => {
    const rowTotal = rowLen(from, to, audioList.length);
    if (rowTotal <= 0) return;
    let cursor = x0 + (len - rowTotal) / 2;

    for (let i = from; i < to; i++) {
      const cx = cursor + sizes[i].width / 2;
      cursor += sizes[i].width + gap;
      makeArt(i, wall, { x: r3(cx), y: HANG_Y, z }, wall === 'north' ? 0 : Math.PI);
    }
    if (to > from && audioList.length) cursor += PLATE_SEP;
    for (const a of audioList) {
      const cx = cursor + PLATE_W / 2;
      cursor += PLATE_W + PLATE_GAP;
      makeStation(a, wall, cx, z, wall === 'north' ? 0 : Math.PI);
    }
  };
  placeRow(northFrom, southFrom, 'north', zNorth, restAudios.slice(0, northAudioCount));
  placeRow(southFrom, n, 'south', zSouth, restAudios.slice(northAudioCount));

  // 长凳：北墙那半程一张（面向北），南墙那半程一张（面向南）
  const benches = [];
  if (northCount >= 2) {
    benches.push({ x: r3(x0 + len * 0.3), z: 2.4, rotY: 0, facing: 0, w: 1.9, d: 0.52, seatY: 0.46 });
  }
  if (n - southFrom >= 2) {
    benches.push({
      x: r3(x0 + len * 0.7), z: HALL_D - 2.4, rotY: 0, facing: Math.PI,
      w: 1.9, d: 0.52, seatY: 0.46,
    });
  }

  const gallery = {
    id: 'gallery',
    kind: 'gallery',
    name,
    center: { x: r3(x0 + len / 2), z: HALL_D / 2 },
    size: { w: r3(len), d: HALL_D },
    height: HEIGHT,
    ambientIntensity: 0.68,
    materials: { ...PALETTE },
    lights: [
      ...coveLights('hall', Math.min(12, Math.max(2, Math.ceil(len / 7))), x0, len),
      ...wallLights('hall', x0, x1),
    ],
    artLight: { base: 8.5, hero: 11.5, max: SPOT_MAX },
    benches,
    arts,
    // 听音点（纯音频文件夹的产物）：room.js 给每块牌子建一张能重绘的贴图
    audioStations: stations,
    signs: [],
    furniture: [
      { kind: 'planter', x: r3(x1 - 0.9), z: 0.9 },
      { kind: 'planter', x: r3(x1 - 0.9), z: HALL_D - 0.9 },
    ],
  };

  const entrance = {
    id: 'entrance',
    kind: 'entrance',
    name: '入口',
    center: { x: ENTRY_W / 2, z: ENTRY_D / 2 },
    size: { w: ENTRY_W, d: ENTRY_D },
    height: HEIGHT,
    ambientIntensity: 0.5,
    materials: { ...PALETTE },
    lights: entranceLights(),
    arts: [],
    signs: [
      // 楼层导览图（画着你这间厅）挂在北墙
      {
        kind: 'directory',
        wall: 'north',
        position: { x: 3.0, y: 1.85, z: 0.18 },
        rotation: { y: 0, z: 0 },
        size: { width: 2.6, height: 1.75 },
      },
      // 外门（纯装饰，背面就是建筑外墙）
      {
        kind: 'frontdoors',
        wall: 'west',
        position: { x: 0.2, y: 1.6, z: ENTRY_D / 2 },
        rotation: { y: Math.PI / 2, z: 0 },
        size: { width: 3.4, height: 3.2 },
      },
    ],
    furniture: [
      { kind: 'counter', x: 3.0, z: 0.9, w: 2.2, d: 0.72, h: 1.05, rotY: 0 },
      { kind: 'umbrella', x: 0.8, z: 6.2 },
      { kind: 'planter', x: 5.2, z: 6.2 },
    ],
  };

  return {
    spawn: { x: 3.0, z: ENTRY_D / 2, yaw: -Math.PI / 2 },
    wallThickness: WALL_T,
    opening: { ...OPEN },
    rooms: [entrance, gallery],
  };
}
