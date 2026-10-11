// ============================================================
// themes/subject-train.js — 共享主体块与 mainImage 骨架
// 本项目各主题共用同一「主体」：列车 + 烟雾 + 桥（GLSL_SUBJECT_TRAIN），
// 以及 mainImage 骨架（GLSL_MAIN_HEAD / GLSL_MAIN_TAIL）与公共噪声函数
// （GLSL_HELPERS）。与任一主题的 scene 按下列顺序拼接，必须与原单体
// SHADER_ORIGINAL 逐字节一致：
//   GLSL_HELPERS + <主题 scene> + GLSL_MAIN_HEAD + GLSL_SUBJECT_TRAIN + GLSL_MAIN_TAIL
// 原始 shader 作者 mdb，出处与许可见 themes/clouds.js 头部注释。
// ============================================================
'use strict';

// 公共函数：确定性噪声 / fbm / 盒遮罩 / 云层宏
const GLSL_HELPERS = `float noise(vec2 x){
    vec2 f = fract(x);
    vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
    vec2 du = 30.0*f*f*(f*(f-2.0)+1.0);
    
    vec2 p = floor(x);
	float a = texture(iChannel0, (p+vec2(0.0, 0.0))/1024.0).x;
	float b = texture(iChannel0, (p+vec2(1.0,0.0))/1024.0).x;
	float c = texture(iChannel0, (p+vec2(0.0,1.0))/1024.0).x;
	float d = texture(iChannel0, (p+vec2(1.0,1.0))/1024.0).x;

    
	return a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y;
}

float fbm(vec2 x, int detail){
    float a = 0.0;
    float b = 1.0;
    float t = 0.0;
    for(int i = 0; i < detail; i++){
        float n = noise(x);
        a += b*n;
        t += b;
        b *= 0.7;
        x *= 2.0; 
    
    }
    return a/t;
}

float fbm2(vec2 x, int detail){
    float a = 0.0;
    float b = 1.0;
    float t = 0.0;
    for(int i = 0; i < detail; i++){
        float n = noise(x);
        a += b*n;
        t += b;
        b *= 0.9;
        x *= 2.0; 
    
    }
    return a/t;
}

float box(vec2 uv, float x1, float x2, float y1, float y2){
    return (uv.x > x1 && uv.x < x2 && uv.y > y1 && uv.y < y2)?1.0:0.0;
} 

#define dot2(v) dot(v, v)
#define layer(dh, v)  if (uv.y < h + midlevel - (dh) ) return vec4(v, 1.);
`;

// mainImage 开头：uv 与时间、背景/前景云采样循环、合成起点、主体前的公共声明
const GLSL_MAIN_HEAD = `void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord/iResolution.y;
    //uv.x += iTime;
    float t = iTime*4.0;
    vec4 bg = background(uv, t);
    
    vec4 fg = vec4(0.);
    int n = 5;
    if (uv.y < 0.5)
    for (int i = 0; i < n; i++){
        fg += foreground(uv, t+4.*float(i)/float(n)/60.) / (float(n));
    }
    
    vec3 col = bg.rgb;
    // train /////////////////////////////////////////////////////////////////////
    float k;
    float midlevel;
    float h;
    float disp;
    float dist;
    vec2 uv2;
    uv.y -= 0.2;
`;

// 共享主体：列车（// choo choo）+ 蒸汽烟雾（// loco smoke）+ 悬索桥（//bridge）
const GLSL_SUBJECT_TRAIN = `    // choo choo
    k = 1.0;
    uv2 = fract(uv*9.0);
    float wagon = 1.0;
    wagon *= 1.0 - step(0.45, uv.x);
    wagon *= 1.0 - step(0.115, uv.y);
    wagon *= step(0.103, uv.y);
    wagon *= step(0.05, 1.0 - abs(uv2.x*2.0 - 1.0));
    
    float join = 1.0; 
    join *= 1.0 - step(0.45, uv.x);
    join *= 1.0 - step(0.11, uv.y);
    join *= step(0.107, uv.y);
    
    
    float roof = 1.0;
    roof *= 1.0 - step(0.45, uv.x);
    roof *= 1.0 - step(0.117, uv.y);
    roof *= step(0.11, uv.y);
    roof *= step(0.15, 1.0 - abs(uv2.x*2.0 - 1.0));
    
    float loco = box(uv, 0.45, 0.5, 0.103, 0.112);
    float chem1 = box(uv, 0.49, 0.495, 0.103, 0.12);
    float chem2 = box(uv, 0.488, 0.496, 0.12, 0.123);
    float locoRoof = box(uv, 0.443, 0.47, 0.11, 0.117);
    
    float wheel = 1.0 - step(0.00004, dot2(uv - vec2(0.457, 0.106)));
    wheel += 1.0 - step(0.00002, dot2(uv - vec2(0.487, 0.105)));
    wheel += 1.0 - step(0.00002, dot2(uv - vec2(0.497, 0.105)));
    
    if (uv.x < 0.45 && uv.y > 0.025 && uv.y < 0.2){
        wheel += 1.0 - step(0.002, dot2(uv2 - vec2(0.2, 0.95)));
        wheel += 1.0 - step(0.002, dot2(uv2 - vec2(0.8, 0.95)));
    }
    col = mix(col, vec3(0.18, 0.12, 0.15), join);
    col =  mix(col, vec3(0.48, 0.19, 0.20), wagon);
    col = mix(col, vec3(0.18, 0.12, 0.15), roof);
    
    col = mix(col, vec3(0.38, 0.19, 0.20), loco);
    col = mix(col, vec3(0.38, 0.19, 0.20), chem1);
    col = mix(col, vec3(0.18, 0.12, 0.15), locoRoof);
    col = mix(col, vec3(0.18, 0.12, 0.15), chem2 + wheel);
    // loco smoke //////
    
    dist = 5.0;
    uv2 = uv + vec2(t/dist + 3.5, 0.0);
    uv2.x -= t/dist*0.2;
    h = fbm2(uv2, 8) - 0.55;
    
    if(uv.x < 0.49){
        float x = -uv.x + 0.49;
        float y = abs(uv.y + h*0.4 - 0.16*sqrt(x) - 0.12) - 0.8*x*exp(-x*10.0);
        if(y < 0.0) col = vec3(1.0, 0.94, 0.91);
        if(y < - 0.02) col = vec3(0.92, 0.85, 0.82);
    }
    
    //bridge ///////
    dist = 5.0;
    uv2 = uv + vec2(t/dist + 32.5, 0.0);
    uv2.x = fract(uv2.x*3.0);
    k = 1.0;
    k *= smoothstep(0.001, 0.003, abs(uv2.y - pow(uv2.x - 0.5, 2.0)*0.15 - 0.12));
    k *= min(step(0.05, 1.0 - abs(uv2.x*2.0 - 1.0))
         +   step(0.17, uv2.y), 1.0);
    k *= min(smoothstep(0.02, 0.05, 1.0 - abs(uv2.x*2.0 - 1.0))
         +   step(0.177, uv2.y), 1.0);
         
    k *= min(step(0.1, uv2.y)
           + smoothstep(-0.09, -0.085, -uv2.y - 0.001/(1.0 - abs(uv2.x*2.0 - 1.0))), 1.0);
           
    k *= min(smoothstep(0.05, 0.2, 1.0 - abs(fract(uv2.x*16.0)*2.0 - 1.0))
         +   step(0.12, uv2.y - pow(uv2.x - 0.5, 2.0)*0.15)
         +   step(-0.1, -uv2.y), 1.0);
    col = mix(vec3(0.29, 0.09, 0.08)*smoothstep(-0.08, 0.08, uv.y), col, k);
`;

// mainImage 收尾：前景云盖在主体之上 + 帧间 feedback 混合
const GLSL_MAIN_TAIL = `    
    
    
    col = mix(col, fg.rgb, fg.a);

    // Output to screen
    uv = fragCoord/iResolution.xy;
    col = mix(col, texture(iChannel1, uv).rgb, 0.3);
    fragColor = vec4(col,1.0);
}

`;
