// ============================================================
// config.js — 设置定义与存取
// 默认值 / 控件清单 / 染色项与源码 CLOUD_TRAIN_DEFAULTS /
// CLOUD_TRAIN_CONTROLS / CLOUD_TRAIN_TINTS 一致。
// ============================================================
'use strict';

const CLOUD_TRAIN_DEFAULTS = {speed:.4,resolution:.75,feedback:.3,vignette:1,zoom:.8,offset:0,amplitude:.6,detail:8,exposure:1,saturation:1,hue:0,temperature:0,skyTint:"#94b3ff",smokeTint:"#ffffff",trainTint:"#7a3033",introEnabled:true,introDuration:3,introFeather:.15,paused:false,ignoreReducedMotion:false};
const CLOUD_TRAIN_CONTROLS = [
["introDuration","开场时长（秒）",.5,10,.1],
["introFeather","开场羽化宽度",.02,.6,.01],
["speed","行进速度",0,5,.01],
["zoom","视角缩放",.5,2,.01],
["offset","垂直位置",-.5,.5,.01],
["amplitude","云层起伏",0,2,.01],
["detail","噪声细节",1,8,1],
["exposure","曝光亮度",.2,2,.01],
["saturation","色彩饱和度",0,2,.01],
["hue","整体色相",-180,180,1],
["temperature","冷暖色温",-1,1,.01],
["resolution","渲染比例",.25,1,.05],
["feedback","帧间拖影",0,.85,.01],
["vignette","暗角强度",0,1,.01],
];
const CLOUD_TRAIN_TINTS = [["skyTint","天空染色"],["smokeTint","烟雾染色"],["trainTint","列车染色"]];
const SAVED_SETTINGS_KEY = "cloud-train-saved-settings:v1";

function normalizeSettings(value) {
  const r = { ...CLOUD_TRAIN_DEFAULTS };
  if (!value || typeof value !== 'object') return r;
  for (const [key, , min, max] of CLOUD_TRAIN_CONTROLS) {
    const v = typeof value[key] === 'number' ? value[key] : parseFloat(value[key]);
    if (Number.isFinite(v)) r[key] = Math.min(max, Math.max(min, v));
  }
  r.detail = Math.round(r.detail);
  for (const [key] of CLOUD_TRAIN_TINTS) {
    if (typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key])) r[key] = value[key];
  }
  for (const k of ['introEnabled', 'paused', 'ignoreReducedMotion']) {
    if (typeof value[k] === 'boolean') r[k] = value[k];
  }
  return r;
}

let __saved = null;
try { __saved = JSON.parse(localStorage.getItem(SAVED_SETTINGS_KEY)); } catch { /* 存储不可用时用出厂默认 */ }
const settings = normalizeSettings(__saved);
// 迁移：旧乘法体系以白色为默认（=不染色），直选色体系下白色是有效选择，
// 因此把存档中的旧默认白色替换为新体系的出厂配色（烟雾保持乘法，白色仍是不染色）
if (__saved) {
  if (__saved.skyTint === '#ffffff') settings.skyTint = CLOUD_TRAIN_DEFAULTS.skyTint;
  if (__saved.trainTint === '#ffffff') settings.trainTint = CLOUD_TRAIN_DEFAULTS.trainTint;
}
