// 声音：全部用 Web Audio 合成，不引入任何音频文件
//
// 四部分：
//   环境音  低通后的布朗噪声，极低音量，带缓慢起伏 —— 让人感觉空间是"活的"
//   脚步声  噪声爆发 + 低频落地感，按地面材质换滤波频率，每次略有随机
//   交互音  坐下/起身的木头声、打开展签的一声轻响
//   背景音乐 舒缓的生成式 pad + 稀疏钟声，详见文件末尾的"音乐"段（B 键开关）
//
// 浏览器要求用户手势之后才能出声，所以 AudioContext 是懒创建的，
// 第一次点击或按键时才 resume。用 convolver + 合成脉冲响应做一个大厅混响，
// 这是"像在空荡的展厅里"最关键的一层。

let ctx = null;
let master = null;
let wet = null;
let ambientGain = null;
let ambientNodes = null;
let noiseBuffer = null;
let irBuffer = null;
let enabled = false;
let muted = false;
let onStateChange = null;

// 音乐（详见文件末尾）
let musicOn = true;        // B 键，默认开
let musicGain = null;
let padFilter = null;
let bellBus = null;
let musicTimer = null;
let nextChordAt = 0;
let nextBellAt = 0;
let chordIdx = 0;
let chordActiveUntil = 0;   // 当前还有声音的和弦到哪一秒为止
let genLevel = null;        // 生成式（pad+钟）的总闸，切到文件曲时压到 0
let fileNode = null;        // 正在放的文件曲 { src, gain }
let trackIdx = 0;           // 当前曲目，0 = 生成式 pad
let trackLoading = false;
let trackSeq = 0;           // 每次切换 +1，用来丢弃过期的加载结果
const bufferCache = new Map();     // url -> AudioBuffer，LRU（解码后很占内存）
const inflight = new Map();        // url -> 正在下载解码的 Promise
const liveChords = new Set();      // 还在响的和弦，切走时要掐掉
const MAX_TRACK_BUFFERS = 3;       // 缓存几首：3 × ~35MB，再多手机上要出事

// 调试用：挂在 master 上的分析节点，测音量/验证在不在响
let analyser = null;
let rmsBuf = null;

function makeNoiseBuffer(seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // 布朗噪声：白噪声积分，低频更足，听着更像"空间"而不是"嘶嘶声"
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

// 合成一段衰减噪声当脉冲响应，做大厅混响
function makeImpulse(seconds = 1.6, decay = 3.2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function initAudio(opts = {}) {
  onStateChange = opts.onStateChange || null;
  const unlock = () => {
    ensureContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const convolver = ctx.createConvolver();
  irBuffer = makeImpulse();
  convolver.buffer = irBuffer;

  wet = ctx.createGain();
  wet.gain.value = 0.2;
  wet.connect(convolver);
  convolver.connect(master);

  noiseBuffer = makeNoiseBuffer();

  // 分析节点：只读不发声，用来实测音量（调试钩子 __artMuseum.audio）
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  rmsBuf = new Float32Array(analyser.fftSize);
  master.connect(analyser);

  return ctx;
}

function bus(dry = 1) {
  const g = ctx.createGain();
  g.gain.value = dry;
  g.connect(master);
  g.connect(wet);
  return g;
}

// 环境音：一条常驻的低频噪声
function startAmbient() {
  if (ambientNodes) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 110;
  lp.Q.value = 0.5;

  ambientGain = ctx.createGain();
  ambientGain.gain.value = 0.16;

  // 极慢的起伏，避免听起来像一条死掉的白噪声
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.05;
  lfo.connect(lfoGain);
  lfoGain.connect(ambientGain.gain);

  src.connect(lp);
  lp.connect(ambientGain);
  ambientGain.connect(bus(0.4));
  src.start();
  lfo.start();
  ambientNodes = { src, lfo };
}

export function setAudioEnabled(on) {
  if (on) {
    ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    if (!enabled) {
      startAmbient();
      enabled = true;
      // 只在"从关到开"这一下起音乐，重复调用不会打断已经排好的和弦
      if (trackIdx > 0) void switchToTrack(trackIdx, 4);   // 文件曲：重新载入起播
      else if (musicOn) startMusic(4);
    }
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : 0.3, ctx.currentTime, 0.5);
  } else if (ctx && enabled) {
    stopMusic(0.6);
    stopFileTrack(0.6);
    killMusicTimer();
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  }
  onStateChange?.({ enabled: on, muted, musicOn });
  return true;
}

export function toggleMute() {
  muted = !muted;
  if (ctx && enabled) {
    master.gain.setTargetAtTime(muted ? 0 : 0.3, ctx.currentTime, 0.12);
  }
  onStateChange?.({ enabled, muted });
  return muted;
}

export function isMuted() {
  return muted;
}

// 脚步声。floorType 决定滤波频率：木地板闷一点，石材亮一点
export function footstep(floorType = 'checker') {
  if (!ctx || !enabled || muted) return;
  const t = ctx.currentTime;
  const woody = floorType === 'wood';
  const out = bus(1);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.playbackRate.value = 0.85 + Math.random() * 0.3;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = (woody ? 820 : 1550) * (0.9 + Math.random() * 0.2);
  bp.Q.value = 0.85;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.045, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0004, t + 0.1);
  src.connect(bp); bp.connect(g); g.connect(out);
  src.start(t); src.stop(t + 0.14);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(woody ? 118 : 88, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.04, t);
  og.gain.exponentialRampToValueAtTime(0.0004, t + 0.11);
  osc.connect(og); og.connect(out);
  osc.start(t); osc.stop(t + 0.13);
}

// 坐下 / 起身：木头的一声轻响
export function sitSound() {
  if (!ctx || !enabled || muted) return;
  const t = ctx.currentTime;
  const out = bus(1);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.playbackRate.value = 0.5;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 620;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.07, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0004, t + 0.22);
  src.connect(lp); lp.connect(g); g.connect(out);
  src.start(t); src.stop(t + 0.26);
}

// 打开展签：很轻的一下
export function clickSound() {
  if (!ctx || !enabled || muted) return;
  const t = ctx.currentTime;
  const out = bus(0.6);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.playbackRate.value = 1.6;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.028, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0003, t + 0.05);
  src.connect(hp); hp.connect(g); g.connect(out);
  src.start(t); src.stop(t + 0.07);
}

export function isAudioOn() {
  return enabled && !muted;
}

// —— 音乐：舒缓的生成式背景音 ——
//
// 同样是纯合成，不放音频文件。两层：
//   pad   慢和弦垫底 —— 每个音两个 ±6 音分的正弦（轻微拍频，听着是"暖"的），
//         起音慢、释放慢，新和弦提前交叠，接缝处听不出来
//   钟声  每 5–15s 一声，取当前和弦最上两个音，快起慢落，
//         额外多送一份进大厅混响 —— 空展厅里远远的一声
//
// 没有节拍也没有旋律线：站着看画时它只该是空间的一部分，不该被"听出来"。
//
// 听感不对就改这三个（想调音量、换和弦、钟声密度）：
const MUSIC_LEVEL = 0.55;        // musicGain 目标值（后面还要乘 bus 与 master）
const TRACK_LEVEL = 0.42;        // 文件曲的目标值 —— 母带已压过，天生比 pad 响
const TRACK_RMS = 0.25;          // 文件曲归一到的响度（见 measureRms）
const NOTE_LEVEL = 0.05;         // 单个正弦的音量
const BELL_LEVEL = 0.14;         // 单声钟的音量
const CHORD_DUR = 20;            // 一个和弦响多久（秒）
const CHORD_XFADE = 6;           // 提前多久交叠下一个 → 实际每 (DUR-XFADE)s 换一次
const CHORD_FADE = 5;            // 起音（秒）
const CHORD_RELEASE = 7;         // 释放（秒）
const BELL_GAP = [5000, 15000];  // 钟声间隔区间（毫秒）

// A 小调系的五个和弦，宽排列：低音 A2–G2，顶上到 B4，中段留空
const CHORDS = [
  [45, 57, 64, 71],  // Am9   A2 A3 E4 B4
  [41, 53, 60, 67],  // Fmaj9 F2 F3 C4 G4
  [48, 55, 64, 71],  // Cmaj9 C3 G3 E4 B4
  [43, 55, 62, 71],  // G6/9  G2 G3 D4 B4
  [50, 57, 65, 69],  // Dm9   D3 A3 F4 A4
];

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 随机游走：不原地重复，听起来像是在同一个调里慢慢漂
function pickChord() {
  let i = Math.floor(Math.random() * CHORDS.length);
  if (i === chordIdx) {
    i = (i + 1 + Math.floor(Math.random() * (CHORDS.length - 1))) % CHORDS.length;
  }
  chordIdx = i;
  return CHORDS[i];
}

function ensureMusicGraph() {
  if (musicGain) return;

  // 所有音乐最终都汇到 musicGain，B 键只需要淡入淡出这一个点
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(bus(0.3));            // 干声
  const hall = ctx.createGain();          // 额外的混响份
  hall.gain.value = 0.5;
  musicGain.connect(hall);
  hall.connect(wet);

  // 生成式这一路（pad + 钟）先过 genLevel：切到文件曲时整条压成静音，
  // 已经排好的和弦不用一个个去关
  genLevel = ctx.createGain();
  genLevel.gain.value = 1;
  genLevel.connect(musicGain);

  padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 900;
  padFilter.Q.value = 0.6;
  padFilter.connect(genLevel);

  // 极慢的明暗呼吸，避免 pad 像一条焊死的合成器
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.04;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain);
  lfoGain.connect(padFilter.frequency);
  lfo.start();

  bellBus = ctx.createGain();
  bellBus.gain.value = 1;
  bellBus.connect(genLevel);
}

// 一个和弦：cg 是它的总音量包络，所有正弦都挂它下面
function scheduleChord(t, notes, dur, attack = CHORD_FADE) {
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.0001, t);
  cg.gain.exponentialRampToValueAtTime(1, t + attack);
  cg.gain.setValueAtTime(1, t + dur - CHORD_RELEASE);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  cg.connect(padFilter);
  liveChords.add(cg);
  chordActiveUntil = Math.max(chordActiveUntil, t + dur);

  for (const m of notes) {
    const f = midiToFreq(m);
    for (const cents of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * Math.pow(2, cents / 1200);
      const vg = ctx.createGain();
      vg.gain.value = NOTE_LEVEL;
      o.connect(vg);
      vg.connect(cg);
      o.start(t);
      o.stop(t + dur + 0.5);
    }
  }
  // 声音播完再松手，不然每个和弦都留一个 gain 节点在图里
  setTimeout(() => { cg.disconnect(); liveChords.delete(cg); }, (dur + 1) * 1000);
}

// 一声钟：主音 + 2.76 倍泛音（玻璃感），泛音衰减快得多
function scheduleBell(t, notes) {
  const top = notes.slice(-2);                       // 和弦最上两个音
  const m = top[Math.floor(Math.random() * top.length)] + 12;
  const f = midiToFreq(m);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(BELL_LEVEL, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
  g.connect(bellBus);

  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = f;
  o.connect(g);
  o.start(t);
  o.stop(t + 3.8);

  const pg = ctx.createGain();
  pg.gain.setValueAtTime(BELL_LEVEL * 0.5, t);
  pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  pg.connect(bellBus);

  const p = ctx.createOscillator();
  p.type = 'sine';
  p.frequency.value = f * 2.76;
  p.connect(pg);
  p.start(t);
  p.stop(t + 1.1);

  setTimeout(() => { g.disconnect(); pg.disconnect(); }, 4200);
}

// 前瞻调度：每 500ms 把未来 1.5s 内该响的排进去
function musicTick() {
  if (!ctx || !enabled) return;
  const now = ctx.currentTime;

  if (!musicOn) {
    // 关着的时候把账本归零：重开时要么接着响（上一个和弦还在窗口里），
    // 要么从"现在"起排 —— 绝不把关着这段时间一次补排出来
    nextChordAt = now + 0.1;
    nextBellAt = now + 7;
    return;
  }

  // 后台标签页会把定时器掐到一分钟一次，回来先对齐账本
  if (nextChordAt < now - 1) nextChordAt = now + 0.1;
  if (nextBellAt < now - 1) nextBellAt = now + 7;

  const horizon = now + 1.5;
  while (nextChordAt < horizon) {
    // 已经有和弦在响就用慢起音（交叠处听不出接缝）；没有就快点起，
    // 否则刚打开音乐要等 5 秒才有声，像是没生效
    const attack = chordActiveUntil > now + CHORD_FADE ? CHORD_FADE : 1.8;
    scheduleChord(nextChordAt, pickChord(), CHORD_DUR, attack);
    nextChordAt += CHORD_DUR - CHORD_XFADE;
  }
  while (nextBellAt < horizon) {
    scheduleBell(nextBellAt, CHORDS[chordIdx]);
    nextBellAt += BELL_GAP[0] + Math.random() * (BELL_GAP[1] - BELL_GAP[0]);
  }
}

function setMusicVol(level, fade) {
  if (!musicGain) return;
  const g = musicGain.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setTargetAtTime(level, ctx.currentTime, Math.max(0.08, fade / 3));
}

// 当前曲目决定 musicGain 抬到多高：生成式是 pad 的音量，文件曲另有一档
const targetLevel = () => (trackIdx === 0 ? MUSIC_LEVEL : TRACK_LEVEL);

// "把音乐准备好"：抬音量；当前是生成式时顺带把排程跑起来。
// B 键打开、首次手势、切回生成式 都走这里。
function startMusic(fade = 4) {
  if (!ctx) return;
  ensureMusicGraph();
  if (trackIdx === 0) {
    reviveGenerative(fade);
    if (!musicTimer) musicTimer = setInterval(musicTick, 500);
    if (nextChordAt <= ctx.currentTime) nextChordAt = ctx.currentTime + 0.1;
    if (nextBellAt <= ctx.currentTime) nextBellAt = ctx.currentTime + 7;
    musicTick();
  }
  setMusicVol(musicOn ? targetLevel() : 0, fade);
}

// 只把音量淡下去，排程留给 musicTick 处理（见 musicOn 分支）
function stopMusic(fade = 1.5) {
  setMusicVol(0, fade);
}

// 关掉整段音频时才连定时器一起收
function killMusicTimer() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

// B 键：只切音乐，M 仍然是总静音
export function toggleMusic() {
  musicOn = !musicOn;
  if (ctx && enabled) {
    if (musicOn) startMusic(1.5);
    else stopMusic(1.5);
  }
  onStateChange?.({ enabled, muted, musicOn });
  return musicOn;
}

export function isMusicOn() {
  return musicOn;
}

// 调试：master 上的实时 RMS（静音时约 0），用来验证"到底响没响"
export function audioRms() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(rmsBuf);
  let sum = 0;
  for (let i = 0; i < rmsBuf.length; i++) sum += rmsBuf[i] * rmsBuf[i];
  return Math.sqrt(sum / rmsBuf.length);
}

// —— 曲目：生成式之外，再放几首真正的轻音乐 ——
//
// 曲子来自 Kevin MacLeod 的 incompetech.com，CC BY 4.0（署名见帮助面板），
// 文件放在 public/music/，第一次切到才下载解码（约 6–10MB/首），解码完就缓存。
//
// 播放链路挂在 musicGain 下面，所以 B 的开关、M 的总静音、干声与大厅混响
// 全部照旧生效 —— 文件曲和生成式 pad 是同一个"音乐总音量"。
//
// 两条路互斥：切到文件曲就 killGenerative()，切回生成式就 startMusic()。
const MUSIC_FADE = 1.5;   // 切歌交叉淡化（秒）

// 署名信息。CC BY 4.0 要求"点一下就能找到"，所以放在帮助面板里
const MACLEOD = Object.freeze({
  author: 'Kevin MacLeod',
  source: 'incompetech.com',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
});

// index 0 是本地实时生成的 pad；1 之后是 public/music/ 下的文件
// URL 带内容 hash（vite.config.js 算的），换文件不会吃到旧缓存
const musicUrl = (file) => {
  const v = (typeof __ASSET_VERSIONS__ === 'object' && __ASSET_VERSIONS__) || {};
  const hash = v[`music/${file}`];
  return `music/${file}${hash ? `?v=${hash}` : ''}`;
};

const TRACKS = Object.freeze([
  { id: 'generative', title: '合成氛围', note: '本地实时生成 · A 小调慢和弦', url: null },
  { id: 'friday-morning', title: 'Friday Morning', note: '钢琴即兴', url: musicUrl('friday-morning.mp3'), credit: MACLEOD },
  { id: 'bathed-in-the-light', title: 'Bathed in the Light', note: '明亮轻盈', url: musicUrl('bathed-in-the-light.mp3'), credit: MACLEOD },
  { id: 'daybreak', title: 'Daybreak', note: '复古电钢琴', url: musicUrl('daybreak.mp3'), credit: MACLEOD },
  { id: 'gymnopedie-no-1', title: 'Gymnopedie No 1', note: '萨蒂 · 钢琴', url: musicUrl('gymnopedie-no-1.mp3'), credit: MACLEOD },
  { id: 'dreamer', title: 'Dreamer', note: '钢琴与轻打击', url: musicUrl('dreamer.mp3'), credit: MACLEOD },
]);

const announce = () => onStateChange?.({ enabled, muted, musicOn, trackIdx, trackLoading });

// 下载 + 解码。一首 4 分钟的 mp3 解码完约 35MB，所以只留最近用过的 3 首；
// 被淘汰的下次切回来再从 HTTP 缓存取、重解码（几百毫秒），不常驻内存。
// 失败既不缓存结果也不留 inflight，下次切还会重试。
function loadTrackBuffer(url) {
  if (bufferCache.has(url)) {
    const hit = bufferCache.get(url);
    bufferCache.delete(url);
    bufferCache.set(url, hit);            // LRU：摸过的排到队尾
    return Promise.resolve(hit);
  }
  if (inflight.has(url)) return inflight.get(url);

  const job = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    bufferCache.set(url, buf);
    while (bufferCache.size > MAX_TRACK_BUFFERS) {
      const oldest = bufferCache.keys().next().value;
      if (oldest === url) break;
      bufferCache.delete(oldest);
    }
    return buf;
  })().finally(() => inflight.delete(url));

  inflight.set(url, job);
  return job;
}

function fadeOutNode(node, fade) {
  const now = ctx.currentTime;
  const g = node.gain.gain;
  const cur = Math.max(0.0001, g.value);
  g.cancelScheduledValues(now);
  g.setValueAtTime(cur, now);
  g.exponentialRampToValueAtTime(0.0001, now + fade);
  try { node.src.stop(now + fade + 0.1); } catch { /* 已经停了 */ }
  setTimeout(() => { node.src.disconnect(); node.gain.disconnect(); }, (fade + 1) * 1000);
}

// 起播（或交叉淡化到）一个解码好的 buffer，无限循环
//
// 这里有个坑：incompetech 的 mp3 峰值只有 -11dBFS（Friday Morning 整首
// RMS 只有 0.023），直接接上链路算出来只有 0.0009，被 0.003 的环境底噪
// 整个盖住 —— 状态全都"对"，就是听不见。所以每首解码完先量一次响度，
// 按 TRACK_RMS 归一再放，换曲子、换响度都不用再手调。
function measureRms(buf) {
  const step = 10;                    // 每 10 个采样取一个，够准也够快
  let sum = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i += step) { sum += ch[i] * ch[i]; n++; }
  }
  const rms = Math.sqrt(sum / n);
  return rms > 1e-6 ? rms : 1;
}

function startFileTrack(buf, fade = MUSIC_FADE) {
  const now = ctx.currentTime;
  const k = TRACK_RMS / measureRms(buf);   // 归一系数
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(k, now + fade);
  src.connect(g);
  g.connect(musicGain);
  src.start(now);

  const old = fileNode;
  fileNode = { src, gain: g };
  if (old) fadeOutNode(old, fade);
}

function stopFileTrack(fade = MUSIC_FADE) {
  if (!fileNode) return;
  const n = fileNode;
  fileNode = null;
  fadeOutNode(n, fade);
}

// 切到文件曲时把生成式整条压掉：已排好的和弦一起静音，排程账本归零，
// 这样随时切回来都是"从现在重新开始"，不会突然窜出一个旧和弦
function killGenerative(fade = 0.6) {
  if (!ctx) return;
  killMusicTimer();
  const now = ctx.currentTime;
  const tc = Math.max(0.05, fade / 3);
  for (const cg of liveChords) {
    cg.gain.cancelScheduledValues(now);
    cg.gain.setTargetAtTime(0, now, tc);
  }
  if (genLevel) genLevel.gain.setTargetAtTime(0, now, tc);
  chordActiveUntil = 0;
  nextChordAt = 0;
  nextBellAt = 0;
}

function reviveGenerative(fade = 1) {
  if (genLevel) genLevel.gain.setTargetAtTime(1, ctx.currentTime, Math.max(0.05, fade / 3));
}

export function trackList() {
  return TRACKS;
}

export function currentTrack() {
  return TRACKS[trackIdx] ?? TRACKS[0];
}

export function isTrackLoading() {
  return trackLoading;
}

// 调试：把音频图的内部状态摊开，方便查"为什么没声"
export function audioDebug() {
  return {
    musicVol: musicGain ? musicGain.gain.value : null,
    genVol: genLevel ? genLevel.gain.value : null,
    filePlaying: !!fileNode,
    padTimer: !!musicTimer,
    liveChords: liveChords.size,
    trackIdx,
    enabled,
    musicOn,
    muted,
    loading: trackLoading,
    buffers: bufferCache.size,
    duration: fileNode ? fileNode.src.buffer.duration : null,
    fileGain: fileNode ? fileNode.gain.gain.value : null,
  };
}

// 下一首（尾尾相接）。返回 { ok, track, index, failed?, error? }
export async function nextTrack() {
  return switchToTrack(trackIdx + 1);
}

// 切曲目。并发安全：连按 N 时只有最后一次的结果会被采纳
export async function switchToTrack(index, fade = MUSIC_FADE) {
  const idx = ((Math.trunc(index) % TRACKS.length) + TRACKS.length) % TRACKS.length;
  const seq = ++trackSeq;
  trackIdx = idx;
  trackLoading = idx !== 0;
  announce();

  // 还没到首次手势：只记账，startAudio() 到时候会按 trackIdx 起播
  if (!ctx || !enabled) {
    trackLoading = false;
    announce();
    return { ok: true, track: TRACKS[idx], index: idx };
  }

  ensureMusicGraph();

  if (idx === 0) {
    stopFileTrack(fade);
    killGenerative(0.4);
    startMusic(fade);          // 内部会按 musicOn 决定抬不抬音量
    trackLoading = false;
    announce();
    return { ok: true, track: TRACKS[0], index: 0 };
  }

  killGenerative(0.4);         // 先掐生成式，再等下载
  const track = TRACKS[idx];
  try {
    const buf = await loadTrackBuffer(track.url);
    if (seq !== trackSeq) return { ok: false, stale: true, track: currentTrack(), index: trackIdx };
    startFileTrack(buf, fade);
    setMusicVol(musicOn ? targetLevel() : 0, fade);
    trackLoading = false;
    announce();
    return { ok: true, track, index: idx };
  } catch (err) {
    if (seq !== trackSeq) return { ok: false, stale: true, track: currentTrack(), index: trackIdx };
    // 载入失败就退回生成式，音乐不能断在半路
    trackIdx = 0;
    trackLoading = false;
    startMusic(fade);
    announce();
    return { ok: false, failed: true, track, index: idx, error: String(err?.message || err) };
  }
}
