// ============================================================
// panel.js — 设置面板
// 面板顶部是主题选择器：切换 = 更新 settings.theme 后 boot()，
// 重编译 program 并重播开场揭示（即主题转场）。滑杆与染色行由
// 「全局参数表 + 当前主题专属表」动态生成，主题切换时重建；
// 另处理单项重置、开关、记住设置、一键重置（确认弹窗）与重播。
// 依赖：config.js 的 settings / cloudTrainControlRows / CLOUD_TRAIN_THEMES、
//       main.js 的 boot / wakeRef、picker.js 的 openPicker / closePicker /
//       pickerBox（均只在事件触发时调用，加载顺序在后无碍）。
// ============================================================
'use strict';

const controlsBox = document.getElementById('controls');
const tintsBox = document.getElementById('tint-controls');
const controlsLegend = controlsBox.querySelector('legend');
const tintsLegend = tintsBox.querySelector('legend');

// 主题选择器：列出注册表内全部主题
const themeSelect = document.getElementById('ctl-theme');
for (const t of CLOUD_TRAIN_THEMES) {
  const opt = document.createElement('option');
  opt.value = t.id; opt.textContent = t.name;
  themeSelect.appendChild(opt);
}
themeSelect.value = settings.theme;
themeSelect.addEventListener('change', () => {
  if (themeSelect.value === settings.theme) return;
  closePicker(false); // 放弃未确认的取色预览，避免其回退写到新主题没有的键
  settings.theme = themeSelect.value;
  buildThemeControls();
  boot();
});

// 按当前主题重建滑杆与染色行（全局参数 + 主题专属参数）
function buildThemeControls() {
  const theme = getCloudTrainTheme(settings.theme);
  controlsBox.innerHTML = ''; tintsBox.innerHTML = '';
  controlsBox.appendChild(controlsLegend); // innerHTML 清空会连 legend 移除，重新挂回
  tintsBox.appendChild(tintsLegend);
  controlsLegend.textContent = '列车与' + theme.name;
  for (const [key, zh, min, max, step] of cloudTrainControlRows(settings.theme)) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label for="ctl-${key}"><span class="zh">${zh}</span><button type="button" class="mini-reset" title="恢复该项默认">重置</button></label><output id="out-${key}">${settings[key]}</output>` +
      `<input type="range" id="ctl-${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}">`;
    controlsBox.appendChild(row);
    row.querySelector('input').addEventListener('input', ev => {
      settings[key] = parseFloat(ev.target.value);
      document.getElementById('out-' + key).textContent = settings[key];
      wakeRef.current();
    });
    // 单项重置：仅把这一个滑杆恢复默认，不影响其他参数
    row.querySelector('.mini-reset').addEventListener('click', ev => {
      ev.preventDefault(); // 阻止 label 转发点击
      settings[key] = CLOUD_TRAIN_DEFAULTS[key];
      document.getElementById('ctl-' + key).value = settings[key];
      document.getElementById('out-' + key).textContent = settings[key];
      wakeRef.current();
    });
  }
  for (const [key, zh] of theme.tints) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label for="ctl-${key}"><span class="zh">${zh}</span><button type="button" class="mini-reset" title="恢复该项默认">重置</button></label>` +
      `<div class="swatch" id="ctl-${key}" style="background:${settings[key]}" title="点击选择颜色"></div>`;
    tintsBox.appendChild(row);
    row.querySelector('.swatch').addEventListener('click', () => openPicker(key));
    // 单项重置：仅把这一个染色恢复默认，不影响其他参数
    row.querySelector('.mini-reset').addEventListener('click', ev => {
      ev.preventDefault(); // 阻止 label 转发点击打开取色器
      settings[key] = CLOUD_TRAIN_DEFAULTS[key];
      document.getElementById('ctl-' + key).style.background = CLOUD_TRAIN_DEFAULTS[key];
      wakeRef.current();
    });
  }
}
buildThemeControls();

document.getElementById('ctl-introEnabled').addEventListener('change', ev => { settings.introEnabled = ev.target.checked; wakeRef.current(); });
document.getElementById('ctl-paused').addEventListener('change', ev => { settings.paused = ev.target.checked; wakeRef.current(); });
// 系统级「减少动态效果」提示与忽略开关
const rmHint = document.getElementById('rm-hint');
function updateRmHint() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  rmHint.hidden = !(reduced && !settings.ignoreReducedMotion);
}
document.getElementById('ctl-ignoreReducedMotion').addEventListener('change', ev => {
  settings.ignoreReducedMotion = ev.target.checked; wakeRef.current(); updateRmHint();
});
updateRmHint();
function syncUI() {
  themeSelect.value = settings.theme;
  for (const [key] of cloudTrainControlRows(settings.theme)) {
    document.getElementById('ctl-' + key).value = settings[key];
    document.getElementById('out-' + key).textContent = settings[key];
  }
  for (const [key] of getCloudTrainTheme(settings.theme).tints) document.getElementById('ctl-' + key).style.background = settings[key];
  document.getElementById('ctl-introEnabled').checked = settings.introEnabled;
  document.getElementById('ctl-paused').checked = settings.paused;
  document.getElementById('ctl-ignoreReducedMotion').checked = settings.ignoreReducedMotion;
  updateRmHint();
}
document.getElementById('btn-replay').addEventListener('click', () => boot());
// 记住当前设置：存入 localStorage（含主题与各主题专属参数），之后每次打开自动恢复
document.getElementById('btn-save').addEventListener('click', () => {
  if (!pickerBox.hidden) closePicker(true); // 取色器预览中的颜色一并提交后再记住
  try { localStorage.setItem(SAVED_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 隐私模式等场景下静默失败 */ }
  const btn = document.getElementById('btn-save');
  btn.textContent = '已记住 ✓';
  setTimeout(() => { btn.textContent = '记住当前设置'; }, 1600);
});
// 重置：先弹居中确认框，确认后清除已记录参数（v1/v2 一并清除）并回到出厂默认
const modalMask = document.getElementById('modal-mask');
document.getElementById('btn-reset').addEventListener('click', () => { modalMask.hidden = false; });
document.getElementById('modal-cancel').addEventListener('click', () => { modalMask.hidden = true; });
modalMask.addEventListener('click', ev => { if (ev.target === modalMask) modalMask.hidden = true; });
document.getElementById('modal-ok').addEventListener('click', () => {
  modalMask.hidden = true;
  if (!pickerBox.hidden) closePicker(false); // 放弃取色器预览，避免其回退覆盖重置结果
  try { localStorage.removeItem(SAVED_SETTINGS_KEY); localStorage.removeItem(LEGACY_SETTINGS_KEY); } catch { /* 同上 */ }
  const prevTheme = settings.theme;
  Object.assign(settings, CLOUD_TRAIN_DEFAULTS);
  if (settings.theme !== prevTheme) buildThemeControls(); // 主题随重置回到默认时重建控件区
  syncUI();
  boot();
});
document.getElementById('panel-head').addEventListener('click', () => {
  document.getElementById('panel').classList.toggle('collapsed');
  document.getElementById('panel-toggle').textContent =
    document.getElementById('panel').classList.contains('collapsed') ? '▴' : '▾';
});
