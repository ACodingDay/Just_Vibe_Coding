// ============================================================
// config.js — 设置定义与存取
// 全局参数所有主题共享；主题专属滑杆/染色/默认值由各主题描述符
// （js/themes/*.js）自带，本文件负责汇总默认值、归一化与存档迁移。
// 全局 + 云海专属的合并视图与源码 CLOUD_TRAIN_DEFAULTS /
// CLOUD_TRAIN_CONTROLS / CLOUD_TRAIN_TINTS 一致。
// 依赖：js/themes/registry.js 的 CLOUD_TRAIN_THEMES（加载顺序在前）。
// ============================================================
'use strict';

// 全局参数（任何主题都有效）：主题选择 / 速度视角 / 后处理 / 开场 / 播放控制
const CLOUD_TRAIN_GLOBAL_DEFAULTS = {theme:'clouds',speed:.4,resolution:.75,feedback:.3,vignette:1,zoom:.8,offset:0,exposure:1,saturation:1,hue:0,temperature:0,introEnabled:true,introDuration:3,introFeather:.15,paused:false,ignoreReducedMotion:false};
const CLOUD_TRAIN_GLOBAL_CONTROLS = [
["introDuration","开场时长（秒）",.5,10,.1],
["introFeather","开场羽化宽度",.02,.6,.01],
["speed","行进速度",0,5,.01],
["zoom","视角缩放",.5,2,.01],
["offset","垂直位置",-.5,.5,.01],
["exposure","曝光亮度",.2,2,.01],
["saturation","色彩饱和度",0,2,.01],
["hue","整体色相",-180,180,1],
["temperature","冷暖色温",-1,1,.01],
["resolution","渲染比例",.25,1,.05],
["feedback","帧间拖影",0,.85,.01],
["vignette","暗角强度",0,1,.01],
];

// 全部主题的染色项平铺（取色器按 key 查标题用）
const CLOUD_TRAIN_TINTS = CLOUD_TRAIN_THEMES.flatMap(t => t.tints);

// 出厂默认值 = 全局 + 各主题专属
const CLOUD_TRAIN_DEFAULTS = (() => {
  const d = { ...CLOUD_TRAIN_GLOBAL_DEFAULTS };
  for (const t of CLOUD_TRAIN_THEMES) Object.assign(d, t.defaults);
  return d;
})();

// 面板滑杆行 = 全局参数 + 指定主题的专属参数
function cloudTrainControlRows(themeId) {
  return [...CLOUD_TRAIN_GLOBAL_CONTROLS, ...getCloudTrainTheme(themeId).controls];
}

const SAVED_SETTINGS_KEY = "cloud-train-saved-settings:v2";
const LEGACY_SETTINGS_KEY = "cloud-train-saved-settings:v1";

function normalizeSettings(value) {
  const r = { ...CLOUD_TRAIN_DEFAULTS };
  if (!value || typeof value !== 'object') return r;
  if (typeof value.theme === 'string' && CLOUD_TRAIN_THEMES.some(t => t.id === value.theme)) r.theme = value.theme;
  for (const [key, , min, max, step] of [CLOUD_TRAIN_GLOBAL_CONTROLS, ...CLOUD_TRAIN_THEMES.map(t => t.controls)].flat()) {
    const v = typeof value[key] === 'number' ? value[key] : parseFloat(value[key]);
    if (Number.isFinite(v)) r[key] = Math.min(max, Math.max(min, v));
    if (step >= 1) r[key] = Math.round(r[key]); // 整数步进参数（噪声细节/色相）防脏数据
  }
  for (const [key] of CLOUD_TRAIN_TINTS) {
    if (typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key])) r[key] = value[key];
  }
  for (const k of ['introEnabled', 'paused', 'ignoreReducedMotion']) {
    if (typeof value[k] === 'boolean') r[k] = value[k];
  }
  return r;
}

// 读取存档：优先 v2；无 v2 时读取 v1 并按 v2 结构升迁
function cloudTrainReadSaved() {
  try {
    const v2 = localStorage.getItem(SAVED_SETTINGS_KEY);
    if (v2 != null) return { value: JSON.parse(v2), legacy: false };
    const v1 = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (v1 != null) return { value: JSON.parse(v1), legacy: true };
  } catch { /* 存储不可用时用出厂默认 */ }
  return { value: null, legacy: false };
}
const __saved = cloudTrainReadSaved();
const settings = normalizeSettings(__saved.value);
if (__saved.legacy && __saved.value) {
  // v1 迁移：旧乘法体系以白色为默认（=不染色），直选色体系下白色是有效选择，
  // 因此把存档中的旧默认白色替换为新体系的出厂配色（烟雾保持乘法，白色仍是不染色）
  if (__saved.value.skyTint === '#ffffff') settings.skyTint = CLOUD_TRAIN_DEFAULTS.skyTint;
  if (__saved.value.trainTint === '#ffffff') settings.trainTint = CLOUD_TRAIN_DEFAULTS.trainTint;
  // 立即落盘到 v2 并移除 v1，避免「一键重置」清掉 v2 后旧存档又复活
  try {
    localStorage.setItem(SAVED_SETTINGS_KEY, JSON.stringify(settings));
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  } catch { /* 隐私模式等场景下静默失败，内存中的迁移结果仍生效 */ }
}
