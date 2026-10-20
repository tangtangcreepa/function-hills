// 生成应用图标 build/icon.png（512×512，函数丘陵主题：浅灰圆角底 + 两座函数山丘 + 太阳）
// 用法：node scripts/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;
const SS = 4; // 4×4 超采样抗锯齿

// ---- 颜色工具（0~1 浮点）----
function hex(c) { return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]; }
function lerpColor(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

// 圆角矩形 SDF（负数在内，正数在外）；u/v∈[0,1]
function roundedRectSDF(u, v, inset, r) {
  const hw = 0.5 - inset, hh = 0.5 - inset;
  const dx = Math.abs(u - 0.5) - (hw - r);
  const dy = Math.abs(v - 0.5) - (hh - r);
  const ax = Math.max(dx, 0), ay = Math.max(dy, 0);
  return Math.min(Math.max(dx, dy), 0) + Math.sqrt(ax * ax + ay * ay) - r;
}

// 采样单个点，返回 [r,g,b,a]（a 为 0 或 1）
function samplePoint(u, v) {
  const inset = 0.03, radius = 0.22;
  const sdf = roundedRectSDF(u, v, inset, radius);
  if (sdf > 0) return [0, 0, 0, 0]; // 圆角外透明

  // 背景：上浅下略深的淡灰
  let col = lerpColor(hex(0xf9f9f9), hex(0xe6e6e6), clamp((v - 0.06) / 0.9, 0, 1));

  // 太阳（右上）
  const sunU = 0.72, sunV = 0.25, sunR = 0.115;
  const dSun = Math.hypot(u - sunU, v - sunV);
  if (dSun < sunR) col = lerpColor(hex(0xffe28a), hex(0xf4b73f), dSun / sunR);

  // 后山（浅蓝）
  const backTop = 0.60 - 0.11 * Math.sin(3.0 * u - 0.6);
  if (v > backTop) {
    const t = clamp((v - backTop) / (0.94 - backTop), 0, 1);
    col = lerpColor(hex(0xa9d6e4), hex(0x67a5bc), t);
  }

  // 前山（绿色，主视觉）
  const frontTop = 0.80 - 0.09 * Math.cos(2.6 * u - 0.2) - 0.03 * Math.sin(5.0 * u);
  if (v > frontTop) {
    const t = clamp((v - frontTop) / (0.94 - frontTop), 0, 1);
    col = lerpColor(hex(0x70c27f), hex(0x3c8c5c), t);
  }

  // 圆角边缘描边
  if (sdf > -0.012) col = hex(0xc9c9c9);

  return [col[0], col[1], col[2], 1];
}

// ---- 渲染 + 超采样 ----
const img = new Float64Array(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, covered = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / SIZE;
        const v = (y + (sy + 0.5) / SS) / SIZE;
        const c = samplePoint(u, v);
        r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; covered += c[3];
      }
    }
    const o = (y * SIZE + x) * 4;
    const alpha = covered / (SS * SS);
    img[o] = alpha > 0 ? (r / covered) : 0;
    img[o + 1] = alpha > 0 ? (g / covered) : 0;
    img[o + 2] = alpha > 0 ? (b / covered) : 0;
    img[o + 3] = alpha;
  }
}

// ---- 编码 PNG ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // 位深
ihdr[9] = 6; // 颜色类型：RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  const rowBase = y * (1 + SIZE * 4);
  raw[rowBase] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const o = (y * SIZE + x) * 4;
    const p = rowBase + 1 + x * 4;
    raw[p] = Math.round(img[o] * 255);
    raw[p + 1] = Math.round(img[o + 1] * 255);
    raw[p + 2] = Math.round(img[o + 2] * 255);
    raw[p + 3] = Math.round(img[o + 3] * 255);
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'icon.png');
fs.writeFileSync(outPath, png);
console.log('已生成图标：' + outPath + '（' + png.length + ' 字节）');
