// ============================================================
// picker.js — 自定义取色器
// 替代浏览器原生弹窗：选色只实时预览，点「确认」才应用，
// 「X」或 Esc 视为取消并回退到打开前的颜色。
// 依赖：config.js 的 settings / CLOUD_TRAIN_TINTS、main.js 的 wakeRef。
// ============================================================
'use strict';

const hsv2rgb = (h, s, v) => [5, 3, 1].map(n => {
  const k = (n + h / 60) % 6;
  return Math.round(255 * (v - v * s * Math.max(Math.min(k, 4 - k, 1), 0)));
});
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60); if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
const rgb2hex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
const hex2rgb = hex => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });

const pickerBox = document.getElementById('picker');
const pickerControls = document.getElementById('controls');
const pickerTitle = document.getElementById('picker-title');
const sv = document.getElementById('picker-sv');
const dot = document.getElementById('picker-dot');
const pickerSwatch = document.getElementById('picker-swatch');
const hueEl = document.getElementById('picker-hue');
const rEl = document.getElementById('picker-r'), gEl = document.getElementById('picker-g'), bEl = document.getElementById('picker-b');
let pickerKey = null, pH = 0, pS = 0, pV = 1, pickerStartHex = '#ffffff';

function renderPicker(fromInputs) {
  const [r, g, b] = hsv2rgb(pH, pS, pV);
  const hex = rgb2hex(r, g, b);
  pickerSwatch.style.background = hex;
  dot.style.left = (pS * 100) + '%';
  dot.style.top = ((1 - pV) * 100) + '%';
  sv.style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${pH},100%,50%))`;
  if (!fromInputs) { rEl.value = r; gEl.value = g; bEl.value = b; }
  // 实时预览：选色过程中背景同步变化
  if (pickerKey) {
    settings[pickerKey] = hex;
    document.getElementById('ctl-' + pickerKey).style.background = hex;
    wakeRef.current();
  }
}
function setPickerFromRgb(r, g, b, fromInputs) {
  const hsv = rgb2hsv(r, g, b);
  if (hsv.s > 0) pH = hsv.h; // 纯灰/白/黑保持原色相
  pS = hsv.s; pV = hsv.v;
  hueEl.value = pH;
  renderPicker(fromInputs);
}
function openPicker(key) {
  if (pickerKey && pickerKey !== key) closePicker(false); // 切换染色前，先回退上一个未确认的修改
  pickerKey = key;
  pickerStartHex = settings[key];
  pickerTitle.textContent = (CLOUD_TRAIN_TINTS.find(t => t[0] === key) || ['', ''])[1] || '调整颜色';
  const { r, g, b } = hex2rgb(settings[key]);
  setPickerFromRgb(r, g, b, false);
  pickerControls.hidden = true; // 取色器占据滑杆列表的位置
  pickerBox.hidden = false;
}
// 关闭：commit=true 确认保留；否则回退到打开时的颜色
function closePicker(commit) {
  if (!pickerKey) return;
  if (!commit) {
    settings[pickerKey] = pickerStartHex;
    document.getElementById('ctl-' + pickerKey).style.background = pickerStartHex;
    wakeRef.current();
  }
  pickerKey = null;
  pickerBox.hidden = true;
  pickerControls.hidden = false;
}
// SV 面板：按下并拖动取饱和度/亮度
let svDrag = false;
function svPick(ev) {
  const rect = sv.getBoundingClientRect();
  pS = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
  pV = Math.min(1, Math.max(0, 1 - (ev.clientY - rect.top) / rect.height));
  renderPicker(false);
}
sv.addEventListener('pointerdown', ev => { svDrag = true; sv.setPointerCapture(ev.pointerId); svPick(ev); });
sv.addEventListener('pointermove', ev => { if (svDrag) svPick(ev); });
sv.addEventListener('pointerup', () => { svDrag = false; });
hueEl.addEventListener('input', () => { pH = parseInt(hueEl.value); renderPicker(false); });
for (const el of [rEl, gEl, bEl]) el.addEventListener('input', () => {
  const clamp = x => Math.min(255, Math.max(0, Math.round(parseFloat(x) || 0)));
  setPickerFromRgb(clamp(rEl.value), clamp(gEl.value), clamp(bEl.value), true);
});
// 吸管从屏幕取色（Chromium 支持 EyeDropper API 时显示）
const eyeBtn = document.getElementById('picker-eyedropper');
if (typeof EyeDropper !== 'undefined') {
  eyeBtn.addEventListener('click', async () => {
    try {
      const res = await new EyeDropper().open();
      const { r, g, b } = hex2rgb(res.sRGBHex);
      setPickerFromRgb(r, g, b, false);
    } catch { /* 用户取消取色 */ }
  });
} else eyeBtn.style.display = 'none';
// 「确认」保留当前颜色；「X」或 Esc 视为取消，颜色跳回打开前的状态
document.getElementById('picker-ok').addEventListener('click', () => closePicker(true));
document.getElementById('picker-close').addEventListener('click', () => closePicker(false));
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !pickerBox.hidden) closePicker(false); });
