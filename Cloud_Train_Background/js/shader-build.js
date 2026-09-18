// ============================================================
// shader-build.js — shader 组装
// 在 SHADER_ORIGINAL 上做染色（直选色）与开场分层揭示两轮文本替换，
// 产出最终片元着色器 SHADER_FRAGMENT。
// 原样提取自 Rice-dog/code-codex explorer-element.ts（commit 0902983a）。
// ============================================================
'use strict';

// 天空改为直选色：选中色即天空色
function cloudTrainColorizeSource(source) {
  let result = source.replace('return vec4(0.58, 0.7, 1.0, 1.);', 'return vec4(skyTint, 1.);');
  const trainStart = result.indexOf('col = mix(col, vec3(0.18');
  const smokeStart = result.indexOf('// loco smoke');
  if(trainStart < 0 || smokeStart < 0) throw new Error('Train color source markers missing');
  // 列车改为直选色：trainRecolor 保留各部件明度、统一应用选中色的色相
  result = result.slice(0, trainStart) + result.slice(trainStart, smokeStart)
    .replace(/vec3\(([^()]*)\)/g, 'trainRecolor(vec3($1))') + result.slice(smokeStart);
  result = result.replace('if(y < 0.0) col = vec3(1.0, 0.94, 0.91);', 'if(y < 0.0) col = vec3(1.0, 0.94, 0.91)*smokeTint;')
    .replace('if(y < - 0.02) col = vec3(0.92, 0.85, 0.82);', 'if(y < - 0.02) col = vec3(0.92, 0.85, 0.82)*smokeTint;');
  return 'uniform vec3 skyTint, smokeTint, trainTint;\n' +
    'vec3 trainRecolor(vec3 base){\n' +
    '  float y = dot(base, vec3(.299,.587,.114));\n' +
    '  return clamp(trainTint * (y / max(dot(trainTint, vec3(.299,.587,.114)), 1e-4)), 0.0, 1.0);\n' +
    '}\n' + result;
}

// Reveal real depth layers, not rectangular screen bands. At intro=1 the
// original layer boundaries and material compositing are unchanged.
function cloudTrainOpeningSource(source) {
  return `uniform float intro, introFeather;
float openingLayer(float start) {
  if (intro >= 1.) return 1.;
  float width = mix(.08, .24, clamp(introFeather / .6, 0., 1.));
  return smoothstep(start, min(start + width, 1.), intro);
}
` + source
    .replace('#define layer(dh, v)  if (uv.y < h + midlevel - (dh) ) return vec4(v, 1.);',
      '#define layer(dh, v) { float p=openingLayer(dist>=10. ? .08+.60*(100.-dist)/90. : (dist>1.5 ? .78 : .88)); if(dist!=matchedDepth && uv.y < h + midlevel - (dh)) { matchedDepth=dist; accumulated.rgb+=(1.-accumulated.a)*p*(v); accumulated.a+=(1.-accumulated.a)*p; if(accumulated.a>=1.) return accumulated; } }')
    .replaceAll('float midlevel;', 'vec4 accumulated=vec4(0.); float matchedDepth=-1.; float midlevel;')
    .replace('return vec4(0.95, 0.80, 0.77, 0.);',
      'return vec4(accumulated.a>0. ? accumulated.rgb/accumulated.a : vec3(0.95,0.80,0.77),accumulated.a);')
    .replace('return vec4(skyTint, 1.);',
      'return vec4(accumulated.rgb+(1.-accumulated.a)*mix(vec3(.008,.035,.051),skyTint,openingLayer(0.)), 1.);')
    .replace('vec3 col = bg.rgb;', 'vec3 col = bg.rgb; vec3 openingBackground = col;')
    .replace('col = mix(col, fg.rgb, fg.a);',
      'col = mix(openingBackground, col, openingLayer(.70)); col = mix(col, fg.rgb, fg.a);');
}

function cloudTrainTintRgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return [1, 1, 1];
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
}

// 最终片元着色器 = 原始场景 shader，经染色 + 开场揭示两轮替换后，
// 注入 zoom / offset / amplitude / detail 等动态 uniform 与 main 入口。
const SHADER_FRAGMENT = '#version 300 es\nprecision highp float;\nuniform vec3 iResolution;uniform float iTime,uFeedback,zoom,offset,amplitude,uDetail;uniform sampler2D iChannel0,iChannel1;out vec4 result;\n'+cloudTrainOpeningSource(cloudTrainColorizeSource(SHADER_ORIGINAL)).replace('texture(iChannel1, uv).rgb, 0.3','texture(iChannel1, uv).rgb, uFeedback').replace('vec2 uv = fragCoord/iResolution.y;', 'vec2 uv = (fragCoord/iResolution.y - .5*iResolution.xy/iResolution.y)/zoom + .5*iResolution.xy/iResolution.y; uv.y -= offset;').replaceAll('(fbm(uv2, 8) - 0.5)*disp','(fbm(uv2, 8) - 0.5)*disp*amplitude').replaceAll('i < detail;', 'i < min(detail, int(uDetail));')+'\nvoid main(){mainImage(result,gl_FragCoord.xy);}';
