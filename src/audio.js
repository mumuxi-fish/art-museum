// 声音：全部用 Web Audio 合成，不引入任何音频文件
//
// 三部分：
//   环境音  低通后的布朗噪声，极低音量，带缓慢起伏 —— 让人感觉空间是"活的"
//   脚步声  噪声爆发 + 低频落地感，按地面材质换滤波频率，每次略有随机
//   交互音  坐下/起身的木头声、打开展签的一声轻响
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
    }
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : 0.3, ctx.currentTime, 0.5);
  } else if (ctx && enabled) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  }
  onStateChange?.({ enabled: on, muted });
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
