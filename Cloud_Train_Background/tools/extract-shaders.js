// 从参考项目 index.html 中提取三个 shader 字符串常量，生成 js/shader-source.js
'use strict';
const fs = require('fs');
const path = require('path');

const ORIG = 'C:/Users/Administrator/Downloads/cloud-train-background-main/cloud-train-background-main/index.html';
const OUT_DIR = 'C:/Users/Administrator/Projects/Just_Vibe_Coding/Cloud_Train_Background/js';

const src = fs.readFileSync(ORIG, 'utf8');

function grab(name) {
  const marker = 'const ' + name + ' = ';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('cannot find ' + name);
  // 从字符串起始引号开始手动扫描，处理转义
  let i = start + marker.length;
  const quote = src[i]; // " 或 '
  i++;
  let outStr = '';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') { outStr += src[i] + src[i + 1]; i += 2; continue; }
    if (ch === quote) break;
    outStr += ch; i++;
  }
  return Function('return ' + quote + outStr + quote)();
}

const SO = grab('SHADER_ORIGINAL');
const SI = grab('SHADER_IMAGE');
const SV = grab('SHADER_VERTEX');

for (const [n, v] of [['SHADER_ORIGINAL', SO], ['SHADER_IMAGE', SI], ['SHADER_VERTEX', SV]]) {
  console.log(n, 'len=', v.length, 'backtick=', v.includes('`'), 'dollar-brace=', v.includes('${'), 'backslash=', v.includes('\\'));
}

// 转成模板字符串：内容为真实换行，可读性更好；转义反引号 / ${} / 反斜杠保证字面值不变
function tpl(v) {
  return '`' + v.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
}

const out = `// ============================================================
// shader 源码常量（原样提取自 Rice-dog/code-codex explorer-element.ts）
// Original supplied shader credited to mdb. No redistribution license was supplied.
// Preserve the source project's deterministic noise and previous-frame feedback assumptions.
// Tint within each material, before compositing and feedback. White is identity.
// ============================================================
'use strict';

// 原始场景着色器：分层云海 + 悬索桥 + 列车 + 蒸汽（fbm 噪声，多层视差）
const SHADER_ORIGINAL = ${tpl(SO)};

// 后处理着色器：色相 / 色温 / 饱和度 / 曝光 / 暗角 / 开场横向揭示
const SHADER_IMAGE = ${tpl(SI)};

// 公共顶点着色器：全屏三角形
const SHADER_VERTEX = ${tpl(SV)};
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'shader-source.js'), out);
console.log('written:', path.join(OUT_DIR, 'shader-source.js'));
