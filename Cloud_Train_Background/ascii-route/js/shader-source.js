// ============================================================
// shader 源码常量（原样提取自 Rice-dog/code-codex explorer-element.ts）
// Original supplied shader credited to mdb. No redistribution license was supplied.
// Preserve the source project's deterministic noise and previous-frame feedback assumptions.
// Tint within each material, before compositing and feedback. White is identity.
// ============================================================
'use strict';

// SHADER_ORIGINAL 现由 js/themes/* 拼块组装（加载顺序：themes/* 必须先于本文件），
// 仅保留用于 tools/verify-split.js 的逐字节一致性校验。
const SHADER_ORIGINAL = GLSL_HELPERS + THEME_CLOUDS.scene + GLSL_MAIN_HEAD + GLSL_SUBJECT_TRAIN + GLSL_MAIN_TAIL;

// 后处理着色器（P1 过渡态：把网格 FBO 线性放大到屏幕；P3 起被
// SHADER_ASCII_IMAGE 取代，保留供 A/B 对比与回退）：色相 / 色温 / 饱和度 / 曝光 / 暗角 / 开场横向揭示
const SHADER_IMAGE = `#version 300 es
precision highp float;
uniform sampler2D scene;
uniform vec2 resolution;
uniform float vignette;
uniform float exposure, saturation;
uniform float hue, temperature;
uniform float intro, introFeather;
out vec4 color;
void main(){
vec2 uv=gl_FragCoord.xy/resolution;
vec3 col=texture(scene,uv).rgb;
if(hue!=0.){
  vec3 axis=normalize(vec3(1.));
  float angle=radians(hue);
  col=col*cos(angle)+cross(axis,col)*sin(angle)+axis*dot(axis,col)*(1.-cos(angle));
}
col*=vec3(1.+temperature*.25,1.,1.-temperature*.25);
col=max(col,vec3(0.));
col=mix(vec3(dot(col,vec3(.2126,.7152,.0722))),col,saturation)*exposure;
col*=mix(1.,.5+.5*pow(max(16.*uv.x*uv.y*(1.-uv.x)*(1.-uv.y),0.),.2),vignette);
if(intro<1.){
  float eased=intro*intro*(3.-2.*intro);
  float edge=mix(-introFeather,1.+introFeather,eased);
  float reveal=1.-smoothstep(edge-introFeather,edge+introFeather,uv.x);
  col=mix(vec3(.008,.035,.051),col,reveal);
}
color=vec4(col,1.);
}
`;

// ASCII 字形输出 pass（P3，方案 §3.5）：每像素 = 定位所在格 → 场景网格
// FBO 取格中心（一格一采样）→ 调色（色相/色温/饱和/曝光，先调色后选字，
// 保证亮度与字符密度一致）→ 亮度分级 → 图集取字形 → 字形×颜色。
// glyphGain 把字级覆盖度按最密字形归一（min 截断保色相不被裁剪），
// 避免直乘覆盖度导致全画面变暗；暗角与开场揭示属显示域效果，逐像素
// 放在字形之后保持平滑。图集 UV 映射内容区（pad 之外），tile 布局见
// js/ascii-atlas.js；图集常驻纹理单元 3。
const SHADER_ASCII_IMAGE = `#version 300 es
precision highp float;
uniform sampler2D scene;
uniform sampler2D atlas;
uniform vec2 resolution;
uniform vec2 grid;
uniform vec2 cellPx;
uniform vec4 tileGeom;   // tileW, tileH, glyphW, glyphH（物理像素，含 pad）
uniform float atlasPad;
uniform float levels, glyphGain;
uniform float uMode;   // 0=彩色（场景色×字形） 1=磷屏绿（墨色恒定，字级仍随场景亮度）
uniform float uGamma;  // 字级伽马：<1 提亮暗部字级，>1 收拢亮部（P5）
uniform float uDither; // 拜耳 4×4 有序抖动开关：字级边界空间 stipple（P5）

// 紧凑拜耳构造：bayer2 给出 2×2 有序阈值，bayer4 级联出 4×4（值域 [0,1)）
float bayer2(vec2 a){ a=floor(a); return fract(a.x/2.+a.y*a.y*.75); }
float bayer4(vec2 a){ return bayer2(.5*a)*.25+bayer2(a); }
uniform float vignette;
uniform float exposure, saturation;
uniform float hue, temperature;
uniform float intro, introFeather;
out vec4 color;
void main(){
vec2 cell = floor(gl_FragCoord.xy / cellPx);
vec2 g = fract(gl_FragCoord.xy / cellPx);
vec3 col = texture(scene, (cell + .5) / grid).rgb;
if(hue!=0.){
  vec3 axis=normalize(vec3(1.));
  float angle=radians(hue);
  col=col*cos(angle)+cross(axis,col)*sin(angle)+axis*dot(axis,col)*(1.-cos(angle));
}
col*=vec3(1.+temperature*.25,1.,1.-temperature*.25);
col=max(col,vec3(0.));
col=mix(vec3(dot(col,vec3(.2126,.7152,.0722))),col,saturation)*exposure;
float lum=dot(col,vec3(.2126,.7152,.0722));
// 字级 = 伽马重映射后的亮度 × (levels-1)，叠加 ±0.5 级的拜耳抖动：
// 渐变（天空/光晕/拖影）在字级边界处形成 stipple 过渡而非色带跳变
float level=clamp(floor(pow(lum,uGamma)*(levels-1.)+(bayer4(cell)-.5)*uDither),0.,levels-1.);
vec2 uvA=vec2((level*tileGeom.x+atlasPad+g.x*tileGeom.z)/(tileGeom.x*levels),
              (atlasPad+g.y*tileGeom.w)/tileGeom.y);
float glyph=texture(atlas,uvA).r;
float ink=min(glyph*glyphGain,1.);
vec3 inkColor=mix(col,vec3(.30,1.,.55),uMode);
vec3 outc=inkColor*ink;
vec2 uv=gl_FragCoord.xy/resolution;
outc*=mix(1.,.5+.5*pow(max(16.*uv.x*uv.y*(1.-uv.x)*(1.-uv.y),0.),.2),vignette);
if(intro<1.){
  float eased=intro*intro*(3.-2.*intro);
  float edge=mix(-introFeather,1.+introFeather,eased);
  float reveal=1.-smoothstep(edge-introFeather,edge+introFeather,uv.x);
  outc=mix(vec3(.008,.035,.051),outc,reveal);
}
color=vec4(outc,1.);
}
`;

// 公共顶点着色器：全屏三角形
const SHADER_VERTEX = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0,1);}`;
