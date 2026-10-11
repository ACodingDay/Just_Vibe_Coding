// ============================================================
// themes/clouds.js — 云海主题描述符
// Original supplied shader credited to mdb.
// Shadertoy 出处: https://www.shadertoy.com/view/Ndc3zl （CC BY-NC-SA 3.0）
// No redistribution license was supplied; 请勿再分发。
// scene 为 foreground / background 两个云层函数；
// assemblyFn 为云海专属组装配方（直选色染色 + 开场分层揭示 + 动态 uniform 注入）。
// ============================================================
'use strict';

// 云海场景：前景 3 层 + 背景 12 层 fbm 视差云
const GLSL_CLOUDS_SCENE = `
vec4 foreground(vec2 uv, float t){
    float midlevel;
    float h;
    float disp;
    float dist;
    vec2 uv2;
    
    uv.y -= 0.2;
    // clouds foreground //////////////////////////////////////////////////////////////
    
    // c14
    midlevel = -0.1;
    disp = 1.7;
    dist = 1.0;
    uv2 = uv + vec2(t/dist + 40.0, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.12, vec3(0.43, 0.32, 0.31));
    layer(0.08, vec3(0.55, 0.42, 0.41));
    layer(0.04, vec3(0.66, 0.42, 0.40));
    layer(0., vec3(0.77, 0.48, 0.46));
    
    // c13
    
    midlevel = 0.05;
    disp = 1.7;
    dist = 2.0;
    uv2 = uv + vec2(t/dist + 38.0, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.1, vec3(0.95, 0.66, 0.48));
    layer(0.04, vec3(0.98, 0.76, 0.64));
    layer(0., vec3(0.95, 0.80, 0.77));
    
    return vec4(0.95, 0.80, 0.77, 0.);
}

vec4 background(vec2 uv, float t){
    float midlevel;
    float h;
    float disp;
    float dist;
    vec2 uv2;
    
    // clouds ///////////////////////////////////////////////////////
    
    // c12
    midlevel = 0.3;
    disp = 0.9;
    dist = 10.0;
    uv2 = uv + vec2(t/dist + 32.5, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.14, vec3(0.48, 0.19, 0.20));
    layer(0.1, vec3(0.68, 0.28, 0.19));
    layer(0.07, vec3(0.88, 0.38, 0.24));
    layer(0., vec3(0.95, 0.45, 0.30));
    
    // c11
    midlevel = 0.35;
    disp = 1.0;
    dist = 15.0;
    uv2 = uv + vec2(t/dist + 30.0, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.04, vec3(0.98, 0.76, 0.64));
    layer(0., vec3(0.95, 0.80, 0.77));
    
    // c10
    midlevel = 0.35;
    disp = 3.5;
    dist = 20.0;
    uv2 = uv + vec2(t/dist + 27.5, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.12, vec3(0.43, 0.32, 0.31));
    layer(0.08, vec3(0.55, 0.42, 0.41));
    layer(0.04, vec3(0.66, 0.42, 0.40));
    layer(0., vec3(0.77, 0.48, 0.46));
    
    // c9
    midlevel = 0.45;
    disp = 2.0;
    dist = 25.0;
    uv2 = uv + vec2(t/dist + 23.0, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.04, vec3(0.98, 0.57, 0.36));
    layer(0., vec3(1.0, 0.62, 0.44));
    
    // c8
    midlevel = 0.5;
    disp = 2.3;
    dist = 30.0;
    uv2 = uv + vec2(t/dist + 20.5, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.12, vec3(0.41, 0.27, 0.27));
    layer(0.08, vec3(0.53, 0.35, 0.32));
    layer(0.04, vec3(0.80, 0.24, 0.17));
    layer(0., vec3(0.99, 0.29, 0.20));
    
    // c7
    midlevel = 0.5;
    disp = 2.5;
    dist = 35.0;
    uv2 = uv + vec2(t/dist + 18.0, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.1, vec3(0.88, 0.38, 0.24));
    layer(0.05, vec3(0.98, 0.42, 0.28));
    layer(0., vec3(1.0, 0.48, 0.35));
    
    // c6
    midlevel = 0.6;
    disp = 2.0;
    dist = 40.0;
    uv2 = uv + vec2(t/dist + 18.0, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.1, vec3(0.95, 0.66, 0.48));
    layer(0., vec3(1.0, 0.76, 0.60));
    
    // c5
    midlevel = 0.75;
    disp = 3.5;
    dist = 45.0;
    uv2 = uv + vec2(t/dist + 15.5, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.2, vec3(1.0, 0.55, 0.33));
    layer(0.15, vec3(0.98, 0.50, 0.24));
    layer(0.1, vec3(0.90, 0.55, 0.40));
    layer(0., vec3(1.0, 0.62, 0.44));
    
    // c4
    midlevel = 0.7;
    disp = 2.7;
    dist = 50.0;
    uv2 = uv + vec2(t/dist + 12.0, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.04, vec3(0.73, 0.36, 0.30));
    layer(0., vec3(0.80, 0.40, 0.34));
    
    // c3
    midlevel = 0.8;
    disp = 2.7;
    dist = 60.0;
    uv2 = uv + vec2(t/dist + 9.5, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.1, vec3(0.93, 0.58, 0.35));
    layer(0., vec3(1.0, 0.76, 0.60));
    
    // c2
    midlevel = 0.9;
    disp = 3.0;
    dist = 70.0;
    uv2 = uv + vec2(t/dist + 7.0, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.1, vec3(0.56, 0.25, 0.22));
    layer(0.05, vec3(0.60, 0.30, 0.27));
    layer(0., vec3(0.74, 0.35, 0.30));
    
    // c1
    midlevel = 1.0;
    disp = 5.0;
    dist = 100.0;
    uv2 = uv + vec2(t/dist + 3.5, 0.0);
    h = (fbm(uv2, 8) - 0.5)*disp;
    layer(0.1, vec3(0.92, 0.85, 0.82));
    layer(0., vec3(1.0, 0.94, 0.91));
    
    return vec4(0.58, 0.7, 1.0, 1.);
}

`;

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

// 云海主题描述符
const THEME_CLOUDS = {
  id: 'clouds',
  name: '云海',
  // 页头/标签页标题（跟随主题切换）
  title: '云间列车 · Cloud Train',
  scene: GLSL_CLOUDS_SCENE,
  // 场景 shader 使用的 uniform 清单（renderer 据此绑定）
  sceneUniforms: ['iResolution', 'iTime', 'iChannel0', 'iChannel1', 'uFeedback', 'zoom', 'offset', 'amplitude', 'uDetail', 'intro', 'introFeather'],
  // 由 settings 逐帧驱动的 uniform：[uniform 名, settings 键名]（renderer 据此推送）
  paramUniforms: [['zoom', 'zoom'], ['offset', 'offset'], ['amplitude', 'amplitude'], ['uDetail', 'detail']],
  // 云海专属滑杆参数表 [键名, 标签, min, max, step]
  controls: [["amplitude", "云层起伏", 0, 2, .01], ["detail", "噪声细节", 1, 8, 1]],
  // 染色 uniform 清单（键名与 settings 中的颜色设置一一对应）
  tintUniforms: ['skyTint', 'smokeTint', 'trainTint'],
  // 染色面板行 [键名, 标签]
  tints: [["skyTint", "天空染色"], ["smokeTint", "烟雾染色"], ["trainTint", "列车染色"]],
  // 主题专属参数出厂值
  defaults: { amplitude: .6, detail: 8, skyTint: "#94b3ff", smokeTint: "#ffffff", trainTint: "#7a3033" },
  // 云海专属组装配方：拼块 → 直选色染色 → 开场分层揭示 → 注入动态 uniform 与 main 入口
  assemblyFn(parts) {
    const source = parts.helpers + parts.scene + parts.mainHead + parts.subject + parts.mainTail;
    return '#version 300 es\nprecision highp float;\nuniform vec3 iResolution;uniform float iTime,uFeedback,zoom,offset,amplitude,uDetail;uniform sampler2D iChannel0,iChannel1;out vec4 result;\n'+cloudTrainOpeningSource(cloudTrainColorizeSource(source)).replace('texture(iChannel1, uv).rgb, 0.3','texture(iChannel1, uv).rgb, uFeedback').replace('vec2 uv = fragCoord/iResolution.y;', 'vec2 uv = (fragCoord/iResolution.y - .5*iResolution.xy/iResolution.y)/zoom + .5*iResolution.xy/iResolution.y; uv.y -= offset;').replaceAll('(fbm(uv2, 8) - 0.5)*disp','(fbm(uv2, 8) - 0.5)*disp*amplitude').replaceAll('i < detail;', 'i < min(detail, int(uDetail));')+'\nvoid main(){mainImage(result,gl_FragCoord.xy);}';
  }
};
