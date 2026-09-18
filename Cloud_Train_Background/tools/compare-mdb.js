// 对比用户提供的 Shadertoy 候选源码与项目内 SHADER_ORIGINAL
'use strict';
const fs = require('fs');
const BASE = 'C:/Users/Administrator/Projects/Just_Vibe_Coding/Cloud_Train_Background/';
const out = [];

const cand = fs.readFileSync(BASE + 'tools/mdb-candidate.glsl', 'utf8');
const src = fs.readFileSync(BASE + 'js/shader-source.js', 'utf8');
const m = src.match(/const SHADER_ORIGINAL = `([\s\S]*?)`;/);
if (!m) throw new Error('SHADER_ORIGINAL not found');
const orig = Function('return `' + m[1] + '`;')();

out.push('orig_len=' + orig.length + ' cand_len=' + cand.length);
out.push('exact_equal=' + (orig === cand));

// 忽略空白差异（行尾空白、空行数量、行首缩进的 tab/空格）后逐行比较
const norm = s => s.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 0);
const a = norm(orig), b = norm(cand);
out.push('normalized_lines orig=' + a.length + ' cand=' + b.length);
if (a.join('\n') === b.join('\n')) {
  out.push('NORMALIZED_EQUAL=true');
} else {
  out.push('NORMALIZED_EQUAL=false');
  let diffs = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { out.push('line ' + (i + 1) + ':\n  orig: ' + JSON.stringify(a[i]) + '\n  cand: ' + JSON.stringify(b[i])); if (++diffs > 20) { out.push('...'); break; } }
  }
}

// shader-build 依赖的关键标记是否都在候选源码里
for (const marker of [
  'return vec4(0.58, 0.7, 1.0, 1.);',
  'col = mix(col, vec3(0.18',
  '// loco smoke',
  '#define layer(dh, v)',
  'float midlevel;',
  'vec3 col = bg.rgb;',
  'col = mix(col, fg.rgb, fg.a);',
  'texture(iChannel1, uv).rgb, 0.3',
  'vec2 uv = fragCoord/iResolution.y;',
  '(fbm(uv2, 8) - 0.5)*disp',
  'i < detail;',
]) {
  out.push((cand.includes(marker) ? 'MARKER-OK   ' : 'MARKER-MISS ') + JSON.stringify(marker));
}
fs.writeFileSync(BASE + 'tools/mdb-compare.txt', out.join('\n') + '\n', 'utf8');
