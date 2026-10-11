// ============================================================
// ascii-atlas.js — 字形图集生成器（ASCII 路线 P2）
// 方案见本目录 README.md §3.2：把 N 级字符梯度按等宽字体光栅化为
// 单通道覆盖度图集，供 P3 字形放大 pass 在 GPU 上按格取样。
// 布局（单行 N tile）：每 tile = [pad | glyphW | pad]，pad 默认 1px
// 空白，保证 LINEAR 采样在 tile 边缘不混入相邻字形（借鉴
// ascii.rest mount.js 的 slot + 1px 空白做法；本实现再把绘制区
// 裁剪到内容区，过高的字形也不得入 pad）。
// 字号按「字形宽充满内容区」推算——同 ascii.rest 的 w/0.6 思路，
// 但以 measureText 实测 advance 不写死系数；等宽字体行高 1.2em
// 恰好 ≈ 内容区高（1:2 格宽高比），字形填满格子。
// 输出 data 为 R8 布局 Uint8Array（width×height，每字节=覆盖度 0..255），
// P3 直接 gl.texImage2D(gl.R8, ...) 上传；canvas 仅供预览/校验。
// 梯度只含 ASCII（避开 ascii.rest 提到的 Android 等宽字体缺
// box-drawing 字形的坑）。
// ============================================================
'use strict';

// 16 级字符梯度：按覆盖度递增排列。顺序由 tools/atlas-preview.html
// 实测校验（须单调不减），勿凭感觉调整——首版 " .:-~=+*xX#%&$M@"
// 即被实测抓出 ":" 密于 "-"、"&" 密于 "$" 两处逆序，据测重排为下值
// （ui-monospace/Consolas 一类等宽字体；P4 提供可切换预设）。
const ASCII_RAMP = ' .-:~=*+xX#$%M&@';

// 预设梯度（P4 面板「字符梯度」下拉的取值表）：
//   std     = 上方实测校准的 16 级；
//   classic = 传统 " .:-=+*#%@" 经同字体实测修正的顺序（':' 密于 '-'）；
//   minimal = 极简 5 级。
// 覆盖度随字体而异，换字体/增删字符后用 tools/atlas-preview.html 复测单调性。
const ASCII_RAMPS = { std: ASCII_RAMP, classic: ' .-:=+*#%@', minimal: ' .:*@' };

function buildAsciiAtlas(options) {
  options = options || {};
  const ramp = String(options.ramp || ASCII_RAMP);
  const levels = Math.min(options.levels || ramp.length, ramp.length);
  const glyphW = options.glyphW || 16;   // 内容区物理像素宽
  const glyphH = options.glyphH || 32;   // 内容区物理像素高（1:2 对应格宽高比）
  const pad = options.pad === undefined ? 1 : options.pad;
  const fontFamily = options.fontFamily ||
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

  const tileW = glyphW + pad * 2;
  const tileH = glyphH + pad * 2;
  const width = tileW * levels;
  const height = tileH;

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // 字号：实测等宽 advance，让字形宽恰好充满内容区
  ctx.font = '100px ' + fontFamily;
  const advance100 = ctx.measureText('M').width || 60;
  const fontSize = glyphW / (advance100 / 100);

  ctx.font = fontSize + 'px ' + fontFamily;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';

  for (let i = 0; i < levels; i++) {
    const ch = ramp[i];
    if (ch === ' ') continue;
    const x0 = i * tileW + pad;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, pad, glyphW, glyphH); // 裁剪到内容区：过高字形不污染 pad
    ctx.clip();
    ctx.fillText(ch, x0 + glyphW / 2, pad + glyphH / 2);
    ctx.restore();
  }

  // 读回 alpha → R8 布局（pad 列保持 0）；统计每级覆盖度（内容区均值 0..1）
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  const coverage = new Float32Array(levels);
  for (let i = 0; i < levels; i++) {
    const x0 = i * tileW + pad;
    let sum = 0;
    for (let y = 0; y < height; y++) {
      const row = (y * width + x0) * 4;
      for (let x = 0; x < glyphW; x++) {
        const a = rgba[row + x * 4 + 3];
        data[y * width + x0 + x] = a;
        sum += a;
      }
    }
    coverage[i] = sum / (glyphW * glyphH * 255);
  }
  return { levels, ramp: ramp.slice(0, levels), tileW, tileH, width, height, pad, glyphW, glyphH, data, coverage, canvas };
}

// 梯度单调性校验：覆盖度应随级别非降（容忍光栅化噪声，默认 -0.005）。
// 返回逆序对的 [i-1, i] 列表，空数组 = 通过。
function checkRampMonotonic(coverage, tolerance) {
  const t = tolerance === undefined ? 0.005 : tolerance;
  const bad = [];
  for (let i = 1; i < coverage.length; i++)
    if (coverage[i] < coverage[i - 1] - t) bad.push([i - 1, i]);
  return bad;
}
