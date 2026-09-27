// 校验拆分前后关键产物一致 + 全部 JS 语法检查，结果写入文件
// 主题化重构后：config 表以「全局 + 云海专属」合并视图与原版比较（次序无关），
// SHADER_FRAGMENT 以 buildFragment('clouds') 产出，仍要求与原版逐字节一致
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');

const ORIG = 'C:/Users/Administrator/Downloads/cloud-train-background-main/cloud-train-background-main/index.html';
const BASE = 'C:/Users/Administrator/Projects/Just_Vibe_Coding/Cloud_Train_Background/';
const OUT = BASE + 'tools/verify-result.txt';

const lines = [];
const orig = fs.readFileSync(ORIG, 'utf8');

// 1) 从原文件截取 shader 组装段并求值
const i1 = orig.indexOf('// ======== shader 源码与组装');
const i2 = orig.indexOf('// ======== 渲染器（逻辑与源码');
if (i1 < 0 || i2 < 0) throw new Error('original section markers not found');
const origShaderCtx = Function(orig.slice(i1, i2) + ';return {SO:SHADER_ORIGINAL,SI:SHADER_IMAGE,SV:SHADER_VERTEX,SF:SHADER_FRAGMENT};')();

// 2) 从原文件截取设置定义段并求值
const j1 = orig.indexOf('// ======== 设置定义');
const j2 = orig.indexOf('// ======== shader 源码与组装');
const origCfgCtx = Function(orig.slice(j1, j2) + ';return {D:CLOUD_TRAIN_DEFAULTS,C:CLOUD_TRAIN_CONTROLS,T:CLOUD_TRAIN_TINTS};')();

// 3) 加载拆分后的 themes / config / shader-source / shader-build（与 index.html 同序）
const mine = fs.readFileSync(BASE + 'js/themes/subject-train.js', 'utf8')
  + '\n' + fs.readFileSync(BASE + 'js/themes/clouds.js', 'utf8')
  + '\n' + fs.readFileSync(BASE + 'js/themes/ocean.js', 'utf8')
  + '\n' + fs.readFileSync(BASE + 'js/themes/registry.js', 'utf8')
  + '\n' + fs.readFileSync(BASE + 'js/config.js', 'utf8')
  + '\n' + fs.readFileSync(BASE + 'js/shader-source.js', 'utf8')
  + '\n' + fs.readFileSync(BASE + 'js/shader-build.js', 'utf8');
const myCtx = Function(mine + ';return {D:CLOUD_TRAIN_DEFAULTS,G:CLOUD_TRAIN_GLOBAL_CONTROLS,TH:THEME_CLOUDS,THO:THEME_OCEAN,T:CLOUD_TRAIN_TINTS,SO:SHADER_ORIGINAL,SI:SHADER_IMAGE,SV:SHADER_VERTEX,SF:buildFragment("clouds"),SFO:buildFragment("ocean")};')();

let fail = 0;
// 主题化重构新增的设置项，与原版对比时剔除：
// theme=主题选择、ignoreReducedMotion=拆分版新增、其余为大海主题专属键
const stripAdded = o => {
  const { ignoreReducedMotion, theme, wave, foam, gulls, oceanSkyTint, seaTint, foamTint, ...rest } = o;
  return rest;
};
// 默认值与控件表按 key 排序后比较：主题化后各主题专属项归入各自描述符，顺序有调整
const objByKey = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
const rowsByKey = rows => JSON.stringify([...rows].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
function cmp(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  lines.push((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) fail++;
}
cmp('CLOUD_TRAIN_DEFAULTS(剔除新增项,按key排序)', objByKey(origCfgCtx.D), objByKey(stripAdded(myCtx.D)));
cmp('CLOUD_TRAIN_CONTROLS(全局+云海合并,按key排序)', rowsByKey(origCfgCtx.C), rowsByKey([...myCtx.G, ...myCtx.TH.controls]));
cmp('CLOUD_TRAIN_TINTS(云海部分)', origCfgCtx.T, myCtx.TH.tints);
cmp('SHADER_ORIGINAL', origShaderCtx.SO, myCtx.SO);
cmp('SHADER_IMAGE', origShaderCtx.SI, myCtx.SI);
cmp('SHADER_VERTEX', origShaderCtx.SV, myCtx.SV);
cmp('SHADER_FRAGMENT(最终组装结果)', origShaderCtx.SF, myCtx.SF);
// 大海主题为原创内容，无原版可比；校验组装产物基本完整（含场景函数与专属 uniform）
const oceanOk = typeof myCtx.SFO === 'string'
  && myCtx.SFO.includes('vec4 background(') && myCtx.SFO.includes('vec4 foreground(')
  && myCtx.SFO.includes('uWave') && myCtx.SFO.includes('seaTint') && myCtx.SFO.includes('openingLayer');
lines.push((oceanOk ? 'PASS' : 'FAIL') + '  SHADER_FRAGMENT_OCEAN(大海组装产物)');
if (!oceanOk) fail++;

// 4) 其余 JS 模块语法检查
for (const f of ['config.js', 'themes/subject-train.js', 'themes/clouds.js', 'themes/ocean.js', 'themes/registry.js', 'shader-build.js', 'renderer.js', 'panel.js', 'picker.js', 'main.js']) {
  const path = BASE + 'js/' + f;
  const r = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  let ok = r.status === 0, detail = r.stderr;
  if (r.error) {
    // 部分运行环境禁止 spawn 子进程（EBUSY），退回 new Function 编译级语法检查
    try { new Function(fs.readFileSync(path, 'utf8')); ok = true; detail = ''; }
    catch (e) { ok = false; detail = String(e); }
  }
  lines.push((ok ? 'PASS' : 'FAIL') + '  syntax: ' + f + (ok ? '' : '\n' + detail));
  if (!ok) fail++;
}

// 5) index.html 引用的文件都存在
const html = fs.readFileSync(BASE + 'index.html', 'utf8');
const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
for (const ref of refs) {
  const ok = fs.existsSync(BASE + ref);
  lines.push((ok ? 'PASS' : 'FAIL') + '  asset exists: ' + ref);
  if (!ok) fail++;
}

lines.push(fail === 0 ? 'ALL EQUAL / ALL OK' : 'MISMATCH: ' + fail);
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
process.exit(fail === 0 ? 0 : 1);
