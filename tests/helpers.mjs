// e2e 公共设施：启动参数 / 基地址 / 截图目录 / 本地展厅素材。
// 浏览器一律走 SwiftShader（无 GPU 的机器上也能画），TMPDIR 挪出 /tmp 根目录
// （Chromium 在 /tmp 直接建共享内存会被这台机器拒掉）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/art-museum/';

const tmpBase = process.env.TMPDIR && process.env.TMPDIR !== '/tmp'
  ? process.env.TMPDIR
  : path.join(os.tmpdir(), 'art-museum-e2e');
fs.mkdirSync(tmpBase, { recursive: true });
process.env.TMPDIR = tmpBase;

export const SHOTS = path.join(HERE, '.shots');
fs.mkdirSync(SHOTS, { recursive: true });

const LAUNCH_ARGS = [
  '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
];
export function launch(opts = {}) {
  return chromium.launch({ args: LAUNCH_ARGS, ...opts });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ready = (p) =>
  p.waitForFunction(() => window.__artMuseum?.stats, null, { timeout: 90000 });
export const shot = (name) => path.join(SHOTS, name);

// ---- 本地展厅素材（跑测试时现搭，不往仓库里放二进制图片） ----
const TMP = path.join(HERE, '.tmp');
const PHOTO_SRC = ['barbizon-03.webp', 'dawn-01.webp', 'dawn-02.webp', 'dutch-01.webp', 'night-05.webp'];

export function fixturePhotos() {
  const dir = path.join(TMP, 'photos');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const name of PHOTO_SRC) {
    fs.copyFileSync(path.join(ROOT, 'public/art/640', name), path.join(dir, name));
  }
  return dir;
}

export function fixtureMedia() {
  const dir = path.join(TMP, 'media-gallery');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const copy = (from, to) => fs.copyFileSync(path.join(ROOT, from), path.join(dir, to));
  copy('public/art/640/dawn-02.webp', '01-dawn.webp');
  copy('public/art/640/night-05.webp', '02-night.webp');
  copy('tests/fixtures/media/03-clip.webm', '03-clip.webm');
  fs.writeFileSync(path.join(dir, '04-note.wav'), toneWav(440, 15));
  return dir;
}

// 两个展厅素材都搭一遍（幂等，单跑某个用例时也会自己搭）
export function ensureFixtures() { fixturePhotos(); fixtureMedia(); }

// 16bit 单声道 PCM WAV：一段正弦，够 <audio> 探出时长、够按 E 播放
function toneWav(freq, seconds, hz = 8000) {
  const n = Math.round(hz * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i += 1) {
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / hz) * 8000), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(hz, 24); head.writeUInt32LE(hz * 2, 28);
  head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// 汇总式断言：{ 名字: 布尔 } → 打印 + 退出码，所有用例共用同一套收尾
export function verdict(checks) {
  console.log(JSON.stringify(checks, null, 1));
  const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(bad.length ? `FAIL: ${bad.join(', ')}` : 'ALL PASS');
  return bad.length;
}
