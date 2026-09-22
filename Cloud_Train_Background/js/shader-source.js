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

// 后处理着色器：色相 / 色温 / 饱和度 / 曝光 / 暗角 / 开场横向揭示
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

// 公共顶点着色器：全屏三角形
const SHADER_VERTEX = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0,1);}`;
