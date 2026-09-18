// 校验拆分前后关键产物一致 + 全部 JS 语法检查，结果写入文件
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

// 3) 加载拆分后的 config / shader-source / shader-build
const mine = fs.readFileSync(BASE + 'js/config.js', 'utf8')
  + '\n' + fs.readFileSync(BASE + 'js/shader-source.js', 'utf8')
  + '\n' + fs.readFileSync(BASE + 'js/shader-build.js', 'utf8');
const myCtx = Function(mine + ';return {D:CLOUD_TRAIN_DEFAULTS,C:CLOUD_TRAIN_CONTROLS,T:CLOUD_TRAIN_TINTS,SO:SHADER_ORIGINAL,SI:SHADER_IMAGE,SV:SHADER_VERTEX,SF:SHADER_FRAGMENT};')();

let fail = 0;
// ignoreReducedMotion 是本拆分版新增设置项，与原版对比时剔除
const stripAdded = o => { const { ignoreReducedMotion, ...rest } = o; return rest; };
function cmp(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  lines.push((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) fail++;
}
cmp('CLOUD_TRAIN_DEFAULTS(剔除新增项)', origCfgCtx.D, stripAdded(myCtx.D));
cmp('CLOUD_TRAIN_CONTROLS', origCfgCtx.C, myCtx.C);
cmp('CLOUD_TRAIN_TINTS', origCfgCtx.T, myCtx.T);
cmp('SHADER_ORIGINAL', origShaderCtx.SO, myCtx.SO);
cmp('SHADER_IMAGE', origShaderCtx.SI, myCtx.SI);
cmp('SHADER_VERTEX', origShaderCtx.SV, myCtx.SV);
cmp('SHADER_FRAGMENT(最终组装结果)', origShaderCtx.SF, myCtx.SF);

// 4) 其余 JS 模块语法检查
for (const f of ['renderer.js', 'panel.js', 'picker.js', 'main.js']) {
  const r = spawnSync(process.execPath, ['--check', BASE + 'js/' + f], { encoding: 'utf8' });
  lines.push((r.status === 0 ? 'PASS' : 'FAIL') + '  syntax: ' + f + (r.status === 0 ? '' : '\n' + r.stderr));
  if (r.status !== 0) fail++;
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
