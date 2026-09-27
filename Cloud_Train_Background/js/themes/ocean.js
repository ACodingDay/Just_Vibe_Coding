// ============================================================
// themes/ocean.js — 大海主题描述符
// 美术方向：受《潜水员戴夫》(Dave the Diver) 启发的风格化表现——
// 高饱和平涂色带、浪尖白边、明快青蓝、朵状平涂白云与海鸥剪影。
// （仅风格借鉴，不使用任何游戏素材；场景 shader 为本项目原创，无额外许可负担。）
// 渲染范式与云海一致：fbm 位移表面 + 向下填充的分层视差（近排先声明先命中，
// 画家算法），海浪＝波面下填水体；白边/白浪花由「波面下深度」与高频噪声阈值给出。
// scene 提供 background / foreground 两个函数（GLSL_MAIN_HEAD 的调用契约）；
// assemblyFn 为大海专属组装配方（直选色染色 + 场景内开场分层揭示 + 动态 uniform 注入）。
// 丁达尔光柱 / 银边 / 海面云影三个效果的概念参考自 tyndall-clouds（MIT，ProxySudo contributors），
// 均为本场景的 2D 风格化重写，未复制其代码。
// ============================================================
'use strict';

const GLSL_OCEAN_SCENE = `
// 单条海浪带的上色：d=波面下深度；白边贴波面（浪尖泡沫）并经 foamPatch 掩码成片，
// 白浪花=高频噪声阈值碎点（集中在波面附近）；p 为开场揭示进度；
// cshadow 为海面云影强度（云场投影暗化，tyndall-clouds 地面云影的 2D 风格化版）
vec3 seaRowColor(float d, vec3 body, float foamW, float capAmt, vec2 uv2, float p, float cshadow){
    vec3 c = body;
    // 泡沫只存在于波面附近的浅水带：深水像素与浪花=0 时整段噪声跳过
    if (uFoam > 0.001 && d < foamW * 6.0) {
        float foamPatch = 0.30 + 0.70 * smoothstep(0.40, 0.52, fbm(uv2 * vec2(5.0, 8.0) + vec2(11.0, 3.0), 3));
        float foam = (1.0 - smoothstep(0.0, foamW, d)) * 0.95 * min(uFoam, 1.0) * foamPatch;
        float caps = step(0.80 - 0.05 * uFoam * capAmt, fbm(uv2 * vec2(34.0, 56.0) + vec2(0.0, 41.0), 4))
                   * (1.0 - smoothstep(foamW, foamW * 6.0, d)) * min(uFoam, 1.6) * foamPatch;
        c = mix(body, foamTint, max(foam, caps));
    }
    c *= 1.0 - 0.18 * cshadow;
    return mix(vec3(.008, .035, .051), c, p);
}

// 海鸥：v 形精灵（对称双翼 + 小身体），位置向左漂移循环，扑翼相位随个体错开
float gullField(vec2 uv, float t, float count){
    float m = 0.0;
    for (int i = 0; i < 6; i++){
        float fi = float(i);
        if (fi >= count) break;
        float gw = iResolution.x / iResolution.y + 0.4;
        vec2 pos = vec2(
            fract(0.13 + fi * 0.37 - t / 45.0 * (0.55 + 0.13 * fi)) * gw - 0.2,
            0.40 + 0.16 * fract(fi * 0.61 + 0.29) + 0.012 * sin(t * 0.5 + fi * 2.4));
        vec2 q = uv - pos; q.x = abs(q.x);
        float span = 0.013 + 0.005 * fract(fi * 0.37 + 0.11);
        float wingY = sin(t * (1.1 + 0.13 * fi) + fi * 1.7) * 0.010 - 0.004 - q.x * 0.5;
        float wing = (1.0 - smoothstep(0.0028, 0.005, abs(q.y - wingY))) * step(q.x, span);
        float body = 1.0 - smoothstep(0.0, 0.006, length(q * vec2(1.0, 1.7)));
        m = max(m, max(wing, body));
    }
    return m;
}

// —— 卡通云：圆盘并集 + 云底压平（蓬松轮廓），云内做底灰顶白的体积渐变 ——
float cloudHash(float n){ return fract(sin(n) * 43758.5453123); }

// 单朵云掩码：5 个圆盘沿 x 排布（中间大两头小），y 向轻微压扁，云底 baseY 以下削平；
// feather 控制边缘软硬（云本体 0.0012 锐利，云影 0.02 羽化）
float cloudMask(vec2 uv, float cx, float baseY, float s, float seed, float feather){
    float m = 0.0;
    for (int j = 0; j < 5; j++){
        float fj = float(j);
        float fr = fj / 4.0;
        float r = s * (0.040 + 0.050 * sin(3.14159 * fr) + (cloudHash(seed + fj * 11.3) - 0.5) * 0.020);
        vec2 c = vec2(cx + (fr - 0.5) * s * 0.36,
                      baseY + r * (0.55 + 0.45 * cloudHash(seed + fj * 5.1)));
        float d = length((uv - c) * vec2(1.0, 1.15));
        m = max(m, 1.0 - smoothstep(r - feather, r + feather, d));
    }
    return m * step(baseY - 0.001, uv.y);
}

// 一排云的联合掩码：n 朵，云底错落、大小随 hash 变化，向左慢漂（视差随 dist）
float cloudRowField(vec2 uv, float t, float w, float dist, float baseY, float s, float n, float seed0, float feather){
    float m = 0.0;
    for (int j = 0; j < 4; j++){
        float fj = float(j);
        if (fj >= n) break;
        float h1 = cloudHash(seed0 + fj * 3.1);
        float h2 = cloudHash(seed0 + fj * 7.7);
        float cx = fract(fj * 0.41 + h1 * 0.17 - t / (dist * 1.5)) * w - 0.4;
        m = max(m, cloudMask(uv, cx, baseY + (h2 - 0.5) * 0.025, s * (0.8 + 0.45 * h2), seed0 + fj * 13.7, feather));
    }
    return m;
}

// 银边：放大 1.07 倍的云盘外圈，仅当该云接近太阳时发亮
// （tyndall 的 HG 前向散射银边 → 2D 化：光晕画在云体之后、被云体覆盖只露外圈）
float cloudRowHalo(vec2 uv, float t, float w, float dist, float baseY, float s, float n, float seed0, vec2 sunPos){
    float m = 0.0;
    for (int j = 0; j < 4; j++){
        float fj = float(j);
        if (fj >= n) break;
        float h1 = cloudHash(seed0 + fj * 3.1);
        float h2 = cloudHash(seed0 + fj * 7.7);
        float cx = fract(fj * 0.41 + h1 * 0.17 - t / (dist * 1.5)) * w - 0.4;
        float by = baseY + (h2 - 0.5) * 0.025;
        float sunW = 1.0 - smoothstep(0.30, 0.75, length(vec2(cx, by) - sunPos));
        m = max(m, cloudMask(uv, cx, by, s * 1.07 * (0.8 + 0.45 * h2), seed0 + fj * 13.7, 0.004) * sunW);
    }
    return m;
}

// 海面云影：两排云的场向下平移、y 向压缩 2 倍（水面透视把影子压扁）投到海面，
// 向阳侧微偏移，边缘羽化成柔和暗斑；近排影落在中景水带、远排影贴近地平线
float seaShadowField(vec2 uv, float t, float w){
    if (uv.y > 0.34) return 0.0;
    float s1 = cloudRowField(vec2(uv.x + 0.05, uv.y * 2.0 + 0.315), t, w, 90.0, 0.515, 1.0, 3.0, 31.0, 0.020);
    float s2 = cloudRowField(vec2(uv.x + 0.07, uv.y * 2.0 + 0.280), t, w, 140.0, 0.680, 0.62, 3.0, 57.0, 0.020);
    return min(1.0, s1 * 0.85 + s2 * 0.65);
}

// 丁达尔光柱的 2D 风格化：以太阳为锚点的扇形亮带，角度噪声调制出光柱纹理，
// 只向太阳下方辐射、离太阳越远越淡；gate=太阳附近有云（光需要被云缘半遮挡才显形）
float godRaysField(vec2 uv, vec2 sunPos, float t, float gate){
    vec2 sd = uv - sunPos;
    float r = length(sd);
    float fall = smoothstep(1.05, 0.10, r);
    float below = smoothstep(0.02, -0.06, sd.y);
    float ang = atan(sd.y, sd.x) + 3.14159;
    float streak = noise(vec2(ang * 5.0, t * 0.05)) * 0.70
                 + noise(vec2(ang * 13.0 + 7.0, t * 0.09)) * 0.30;
    return fall * below * smoothstep(0.35, 0.85, streak) * gate;
}

// bg 与 foreground 之间共享的海面云影强度（mainImage 先调 background 再采 foreground）
float g_shadow = 0.0;

vec4 background(vec2 uv, float t){
    float dist;
    vec2 uv2;
    float surf;
    float w = iResolution.x / iResolution.y + 0.8;

    // 海面云影只在海面高度带内计算（天空像素零成本跳过）；存全局供 foreground 复用
    g_shadow = seaShadowField(uv, t, w);

    // —— 海面五排（近→远，先命中先生效；色带由深到浅推向地平线，地平线约在 uv.y≈0.30
    //     与桥面齐平：主体块内 uv.y-=0.2，车轮/桥面在原始坐标 ≈0.303。
    //     每排在 fbm 主起伏外再叠一个低频“涌浪”项，避免各排成为平行直线。
    //     垂直预门控：波面理论上限（fbm∈[0,1] 推得）低于当前像素的排直接跳过，
    //     天空像素零成本越过整片海） ——
    dist = 2.0;
    if (uv.y < 0.075 + 0.0375 * uWave) {
        uv2 = uv + vec2(t / dist + 47.0, 0.0);
        surf = 0.050 + (fbm(uv2, 8) - 0.5) * 0.075 * uWave + (fbm(uv2 * 0.5 + vec2(5.0, 0.0), 3) - 0.5) * 0.050;
        if (uv.y < surf) return vec4(seaRowColor(surf - uv.y, seaTint * 0.72, 0.012, 1.0, uv2, openingLayer(0.58), g_shadow), 1.0);
    }

    dist = 3.5;
    if (uv.y < 0.135 + 0.0325 * uWave) {
        uv2 = uv + vec2(t / dist + 51.0, 0.0);
        surf = 0.115 + (fbm(uv2, 8) - 0.5) * 0.065 * uWave + (fbm(uv2 * 0.5 + vec2(9.0, 0.0), 3) - 0.5) * 0.040;
        if (uv.y < surf) return vec4(seaRowColor(surf - uv.y, seaTint * 0.85, 0.010, 0.8, uv2, openingLayer(0.48), g_shadow), 1.0);
    }

    dist = 6.0;
    if (uv.y < 0.200 + 0.0275 * uWave) {
        uv2 = uv + vec2(t / dist + 57.0, 0.0);
        surf = 0.185 + (fbm(uv2, 8) - 0.5) * 0.055 * uWave + (fbm(uv2 * 0.5 + vec2(15.0, 0.0), 3) - 0.5) * 0.030;
        if (uv.y < surf) return vec4(seaRowColor(surf - uv.y, seaTint, 0.008, 0.6, uv2, openingLayer(0.38), g_shadow), 1.0);
    }

    dist = 10.0;
    if (uv.y < 0.255 + 0.020 * uWave) {
        uv2 = uv + vec2(t / dist + 63.0, 0.0);
        surf = 0.245 + (fbm(uv2, 8) - 0.5) * 0.040 * uWave + (fbm(uv2 * 0.5 + vec2(21.0, 0.0), 3) - 0.5) * 0.020;
        if (uv.y < surf) return vec4(seaRowColor(surf - uv.y, mix(seaTint, vec3(0.80, 0.93, 0.97), 0.28), 0.006, 0.4, uv2, openingLayer(0.28), g_shadow), 1.0);
    }

    dist = 18.0;
    if (uv.y < 0.298 + 0.009 * uWave) {
        uv2 = uv + vec2(t / dist + 71.0, 0.0);
        surf = 0.298 + (fbm(uv2, 8) - 0.5) * 0.018 * uWave;
        if (uv.y < surf) return vec4(seaRowColor(surf - uv.y, mix(seaTint, vec3(0.80, 0.93, 0.97), 0.45), 0.003, 0.25, uv2, openingLayer(0.18), g_shadow), 1.0);
    }

    // —— 天空：直选色渐变（地平线提亮）+ 太阳 ——
    vec3 sky = mix(mix(oceanSkyTint, vec3(1.0), 0.5), oceanSkyTint, smoothstep(0.30, 0.85, uv.y));
    vec2 sunPos = vec2(iResolution.x / iResolution.y * 0.72, 0.62);
    float sr = length(uv - sunPos);
    sky += vec3(1.0, 0.97, 0.88) * (exp(-sr * 4.5) * 0.35 + (1.0 - smoothstep(0.038, 0.044, sr)) * 0.5);

    // —— 丁达尔光柱（2D 风格化）：太阳附近有云才显形，画在云后、止于海平线 ——
    vec2 sd = uv - sunPos;
    if (sd.y < 0.05 && length(sd) < 1.1 && uv.y > 0.295) {
        float gate = max(
            cloudRowField(sunPos + vec2(-0.06, 0.06), t, w, 90.0, 0.515, 1.0, 3.0, 31.0, 0.010),
            cloudRowField(sunPos + vec2(0.07, 0.13), t, w, 140.0, 0.680, 0.62, 3.0, 57.0, 0.010));
        float shafts = godRaysField(uv, sunPos, t, smoothstep(0.15, 0.85, gate)) * openingLayer(0.22);
        sky += vec3(1.0, 0.96, 0.83) * shafts * 0.22;
    }

    // —— 朵状卡通云 + 银边：halo 画在云体之后，被云体覆盖只露外圈（近排大而低、远排小而高） ——
    float reveal = openingLayer(0.10);
    float cm = cloudRowField(uv, t, w, 90.0, 0.515, 1.0, 3.0, 31.0, 0.0012);
    float halo = cloudRowHalo(uv, t, w, 90.0, 0.515, 1.0, 3.0, 31.0, sunPos);
    sky = mix(sky, vec3(1.0, 0.97, 0.86), halo * 0.45 * reveal * (1.0 - cm));
    vec3 cc = mix(vec3(0.84, 0.91, 0.96), vec3(1.0), smoothstep(0.515, 0.515 + 0.15, uv.y));
    sky = mix(sky, mix(vec3(.008, .035, .051), cc, reveal), cm);
    reveal = openingLayer(0.16);
    cm = cloudRowField(uv, t, w, 140.0, 0.680, 0.62, 3.0, 57.0, 0.0012);
    halo = cloudRowHalo(uv, t, w, 140.0, 0.680, 0.62, 3.0, 57.0, sunPos);
    sky = mix(sky, vec3(1.0, 0.97, 0.86), halo * 0.40 * reveal * (1.0 - cm));
    cc = mix(vec3(0.88, 0.93, 0.97), vec3(1.0), smoothstep(0.680, 0.680 + 0.10, uv.y));
    sky = mix(sky, mix(vec3(.008, .035, .051), cc, reveal), cm);

    // —— 海鸥 ——
    sky = mix(sky, vec3(0.16, 0.20, 0.28), gullField(uv, t, uGulls) * openingLayer(0.25));
    return vec4(mix(vec3(.008, .035, .051), sky, openingLayer(0.0)), 1.0);
}

vec4 foreground(vec2 uv, float t){
    float dist;
    vec2 uv2;
    float surf;

    // —— 近景浪两排：盖住桥墩根部；揭示进度由 mainTail 的合成 alpha 门控统一处理。
    //     垂直预门控同海排；云影复用 bg 已算好的 g_shadow（mainImage 先调 background） ——
    dist = 1.2;
    if (uv.y < 0.090 + 0.040 * uWave) {
        uv2 = uv + vec2(t / dist + 91.0, 0.0);
        surf = 0.065 + (fbm(uv2, 8) - 0.5) * 0.080 * uWave + (fbm(uv2 * 0.5 + vec2(31.0, 0.0), 3) - 0.5) * 0.050;
        if (uv.y < surf) return vec4(seaRowColor(surf - uv.y, seaTint * 0.62, 0.016, 1.0, uv2, 1.0, g_shadow), 1.0);
    }

    dist = 2.0;
    if (uv.y < 0.1625 + 0.035 * uWave) {
        uv2 = uv + vec2(t / dist + 97.0, 0.0);
        surf = 0.140 + (fbm(uv2, 8) - 0.5) * 0.070 * uWave + (fbm(uv2 * 0.5 + vec2(41.0, 0.0), 3) - 0.5) * 0.045;
        if (uv.y < surf) return vec4(seaRowColor(surf - uv.y, seaTint * 0.78, 0.012, 0.8, uv2, 1.0, g_shadow), 1.0);
    }

    return vec4(0.0, 0.0, 0.0, 0.0);
}

`;

// 染色：列车直选色（保留各部件明度、统一应用选中色相）+ 烟雾乘法（白色=不染色）；
// 天空/海水/浪花为大海专属直选色。列车/烟雾的替换标记位于共享主体块，与云海同源。
function oceanColorizeSource(source) {
  const trainStart = source.indexOf('col = mix(col, vec3(0.18');
  const smokeStart = source.indexOf('// loco smoke');
  if (trainStart < 0 || smokeStart < 0) throw new Error('Train color source markers missing');
  let result = source.slice(0, trainStart) + source.slice(trainStart, smokeStart)
    .replace(/vec3\(([^()]*)\)/g, 'trainRecolor(vec3($1))') + source.slice(smokeStart);
  result = result.replace('if(y < 0.0) col = vec3(1.0, 0.94, 0.91);', 'if(y < 0.0) col = vec3(1.0, 0.94, 0.91)*smokeTint;')
    .replace('if(y < - 0.02) col = vec3(0.92, 0.85, 0.82);', 'if(y < - 0.02) col = vec3(0.92, 0.85, 0.82)*smokeTint;');
  return 'uniform vec3 oceanSkyTint, seaTint, foamTint, smokeTint, trainTint;\n' +
    'vec3 trainRecolor(vec3 base){\n' +
    '  float y = dot(base, vec3(.299,.587,.114));\n' +
    '  return clamp(trainTint * (y / max(dot(trainTint, vec3(.299,.587,.114)), 1e-4)), 0.0, 1.0);\n' +
    '}\n' + result;
}

// 开场分层揭示（大海版）：天空即时铺底，云/海排按远→近渐次显现，
// 主体（列车+桥）在 0.66 处淡入，近景浪经合成 alpha 在 0.88 处收尾。
// 与云海版互不通用：云海版依赖对 layer 宏与云排文本的精确替换，大海排带自带 p 门控。
function oceanOpeningSource(source) {
  return `uniform float intro, introFeather;
float openingLayer(float start) {
  if (intro >= 1.) return 1.;
  float width = mix(.08, .24, clamp(introFeather / .6, 0., 1.));
  return smoothstep(start, min(start + width, 1.), intro);
}
` + source
    .replace('vec3 col = bg.rgb;', 'vec3 col = bg.rgb; vec3 openingBackground = col;')
    .replace('col = mix(col, fg.rgb, fg.a);',
      'col = mix(openingBackground, col, openingLayer(.66)); col = mix(col, fg.rgb, fg.a*openingLayer(.88));');
}

// 大海主题描述符
const THEME_OCEAN = {
  id: 'ocean',
  name: '大海',
  // 页头/标签页标题（跟随主题切换）
  title: '海上列车 · Sea Train',
  scene: GLSL_OCEAN_SCENE,
  // 场景 shader 使用的 uniform 清单（renderer 据此绑定）
  sceneUniforms: ['iResolution', 'iTime', 'iChannel0', 'iChannel1', 'uFeedback', 'zoom', 'offset', 'uWave', 'uFoam', 'uGulls', 'intro', 'introFeather'],
  // 由 settings 逐帧驱动的 uniform：[uniform 名, settings 键名]（renderer 据此推送）
  paramUniforms: [['zoom', 'zoom'], ['offset', 'offset'], ['uWave', 'wave'], ['uFoam', 'foam'], ['uGulls', 'gulls']],
  // 大海专属滑杆参数表 [键名, 标签, min, max, step]
  controls: [["wave", "浪高", 0, 2, .01], ["foam", "浪花", 0, 2, .01], ["gulls", "海鸥数量", 0, 6, 1]],
  // 染色 uniform 清单（键名与 settings 中的颜色设置一一对应；列车/烟雾与云海共享同一主体）
  tintUniforms: ['oceanSkyTint', 'seaTint', 'foamTint', 'smokeTint', 'trainTint'],
  // 染色面板行 [键名, 标签]
  tints: [["oceanSkyTint", "天空染色"], ["seaTint", "海水染色"], ["foamTint", "浪花染色"], ["smokeTint", "烟雾染色"], ["trainTint", "列车染色"]],
  // 主题专属参数出厂值（Dave 式青蓝调色板）
  defaults: { wave: 1, foam: 1, gulls: 3, oceanSkyTint: "#5fb9e6", seaTint: "#1899b4", foamTint: "#ffffff", smokeTint: "#ffffff", trainTint: "#7a3033" },
  // 大海专属组装配方：拼块 → 直选色染色 → 开场分层揭示 → 注入动态 uniform 与 main 入口
  assemblyFn(parts) {
    const source = parts.helpers + parts.scene + parts.mainHead + parts.subject + parts.mainTail;
    return '#version 300 es\nprecision highp float;\nuniform vec3 iResolution;uniform float iTime,uFeedback,zoom,offset,uWave,uFoam,uGulls;uniform sampler2D iChannel0,iChannel1;out vec4 result;\n'
      + oceanOpeningSource(oceanColorizeSource(source))
        .replace('texture(iChannel1, uv).rgb, 0.3', 'texture(iChannel1, uv).rgb, uFeedback')
        .replace('vec2 uv = fragCoord/iResolution.y;',
          'vec2 uv = (fragCoord/iResolution.y - .5*iResolution.xy/iResolution.y)/zoom + .5*iResolution.xy/iResolution.y; uv.y -= offset;')
      + '\nvoid main(){mainImage(result,gl_FragCoord.xy);}';
  }
};
