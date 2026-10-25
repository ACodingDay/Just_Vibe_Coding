// ============================================================
// renderer.js — WebGL 2 渲染器（ASCII 路线版）
// 由主版本 js/renderer.js 派生（主目录保留原实现，便于逐文件对比）。
// P1 改造：渲染粒度与显示分辨率解耦——
//   场景 shader / 两块反馈 FBO / iResolution 绑定「字符格网格」
//   （cols = ceil(cssW/8)，rows = ceil(cssH/16)，格宽高比 2:1），
//   场景成本从此钉在格数上（方案与数字见 ../ascii-route/README.md §2.2）；
//   画布仍按 min(dpr,1.5)×resolution 分配，本阶段暂以 SHADER_IMAGE
//   把网格 FBO 线性放大到屏幕（P3 将替换为字形放大 pass），
//   反馈拖影随之变为字符级余晖（terminal 风格，预期加分）。
// 逻辑与源码 CloudTrainRenderer.#start 一致的部分保持原样：
// 两块 FBO 交替做帧间 feedback，后处理输出到画布。
// ============================================================
'use strict';

// 每格 CSS 像素默认尺寸（2:1 对应等宽字体 0.6em 宽 × 1.2 行高）；
// 实际格子尺寸由面板滑杆 settings.asciiCell 驱动（updatePixelSize 读取）
const ASCII_CELL_W = 8, ASCII_CELL_H = 16;

function startCloudTrain(canvas, state, wakeRef, hooks) {
  hooks = hooks || {};
  const el = canvas;
  const gl = el.getContext('webgl2', {alpha:false, antialias:false, depth:false});
  if (!gl) throw new Error('需要 WebGL 2 支持（WebGL 2 is required）');
  const programs = [], textures = [], buffers = [], fbos = [];
  // w/h = 画布显示尺寸；gw/gh = 字符格网格尺寸（场景 shader 真正运行的地方）
  // onscreen：借鉴 ascii.rest mount.ts 的 IntersectionObserver 行为——画布滚出
  // 视口即停绘（壁纸常驻场景几乎恒为 true，但封装成可嵌入组件后离屏停绘能省电）；
  // io 在函数作用域声明，便于 clean() 统一断开
  let raf = 0, last = 0, time = 0, w = 0, h = 0, gw = 0, gh = 0, read = 0, history = false, dead = false, watchdog = 0, onscreen = true, io = null;
  let introProgress = state.current.paused ? 1 : 0;
  function program(src) {
    const p = gl.createProgram(); programs.push(p);
    for (const [type, source] of [[gl.VERTEX_SHADER, SHADER_VERTEX], [gl.FRAGMENT_SHADER, src]]) {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const e = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(e || 'Shader error');
      }
      gl.attachShader(p, s); gl.deleteShader(s);
    }
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'Link error');
    return p;
  }
  function texture() {
    const t = gl.createTexture(); textures.push(t); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }
  function clean() {
    dead = true; cancelAnimationFrame(raf); clearInterval(watchdog);
    if (io) io.disconnect();
    programs.forEach(p => gl.deleteProgram(p)); textures.forEach(t => gl.deleteTexture(t));
    buffers.forEach(b => gl.deleteBuffer(b)); fbos.forEach(f => gl.deleteFramebuffer(f));
  }
  try {
    // 与源码一致：前景保留五次采样，但把时间展开压缩为三分之一
    // shader 按当前主题构建（boot 时 settings.theme 已定），该替换作用于共享 mainHead
    let frag = buildFragment(state.current.theme)
      .replace('t+4.*float(i)/float(n)/60.', 't+(4./3.)*float(i)/float(n)/60.');
    // 性能（精确变换，渲染结果不变）：烟雾 h=fbm2(uv2,8) 只被 uv.x<0.49 分支消费，
    // 挪入分支后右半屏每像素省 32 次纹理采样。与主版本同一 boot 级替换（拼块保持
    // 与上游 mdb 原版逐字节一致，在 verify-split.js 校验范围之外）；失配仅回退为未优化
    frag = frag.replace(/h = fbm2\(uv2, 8\) - 0\.55;\r?\n[ \t]*\r?\n[ \t]*if\(uv\.x < 0\.49\)\{/,
      'if(uv.x < 0.49){\n        h = fbm2(uv2, 8) - 0.55;');
    if (!frag.includes('if(uv.x < 0.49){\n        h = fbm2(uv2, 8) - 0.55;')) console.warn('cloud-train: 冒烟分支门控替换失配（拼块文本变了？）');
    const scene = program(frag);
    // P3：输出端从线性放大（SHADER_IMAGE，保留未删）换成字形放大 pass
    const post = program(SHADER_ASCII_IMAGE);
    const locations = (p, names) => Object.fromEntries(names.map(k => [k, gl.getUniformLocation(p, k)]));
    // uniform 清单由当前主题描述符提供，行为与原硬编码列表一致
    const theme = getCloudTrainTheme(state.current.theme);
    const tintKeys = theme.tintUniforms;
    const a = locations(scene, [...theme.sceneUniforms, ...tintKeys]);
    const b = locations(post, ['resolution','scene','atlas','grid','cellPx','tileGeom','atlasPad','levels','glyphGain','uMode','uGamma','uDither','vignette','exposure','saturation','hue','temperature','intro','introFeather']);
    const quad = gl.createBuffer(); buffers.push(quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // 恢复原始确定性噪声（xorshift，种子 93451）
    const noise = texture(); const data = new Uint8Array(1024 * 1024); let seed = 93451;
    for (let i = 0; i < data.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; data[i] = seed & 255; }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1024, 1024, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const targets = [texture(), texture()];
    for (const t of targets) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      fbos.push(gl.createFramebuffer());
    }
    // 字形图集纹理（内容由 rebuildAtlas 按「格子尺寸 × 梯度预设」生成并
    // R8 上传，常驻单元 3；UNPACK_ALIGNMENT=1 容忍图集宽度非 4 倍数）
    const atlasTex = texture();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    // 系统开启「减少动态效果」时冻结动画（无障碍默认行为）；
    // 用户勾选「忽略系统减少动态效果」后可强制播放
    const rmFrozen = () => media.matches && !state.current.ignoreReducedMotion;
    function request() { if (!dead && !raf && !document.hidden && onscreen) raf = requestAnimationFrame(draw); }
    const uniformCache = new Map();
    function scalar(location, value) {
      if (location && uniformCache.get(location) !== value) { gl.uniform1f(location, value); uniformCache.set(location, value); }
    }
    function tint(location, value) {
      if (location && uniformCache.get(location) !== value) { gl.uniform3f(location, ...cloudTrainTintRgb(value)); uniformCache.set(location, value); }
    }
    const bounds = el.getBoundingClientRect();
    let cssWidth = bounds.width, cssHeight = bounds.height;
    let pixelWidth = 1, pixelHeight = 1, scale = state.current.resolution;
    let gridWidth = 1, gridHeight = 1;
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    function updatePixelSize() {
      const d = Math.min(devicePixelRatio || 1, 1.5) * scale;
      pixelWidth = Math.max(1, Math.min(maxViewport[0], Math.round(cssWidth * d)));
      pixelHeight = Math.max(1, Math.min(maxViewport[1], Math.round(cssHeight * d)));
      // P1 核心：网格按 CSS 像素 ceil 划分，与 dpr / resolution 无关——
      // ceil 保证边缘格不缺失；格子尺寸由面板滑杆驱动（P4，1:2 格宽高比），
      // 分辨率越高解耦收益越大
      const cw = Math.min(24, Math.max(4, Number(state.current.asciiCell) || 8));
      gridWidth = Math.max(1, Math.min(maxViewport[0], Math.ceil(cssWidth / cw)));
      gridHeight = Math.max(1, Math.min(maxViewport[1], Math.ceil(cssHeight / (cw * 2))));
    }
    updatePixelSize();
    // 每张纹理独占一个纹理单元；缩放上传与渲染共享此缓存
    let activeUnit = -1;
    const boundTextures = new Map();
    function bindTexture(unit, t) {
      if (boundTextures.get(unit) === t) return;
      if (activeUnit !== unit) { gl.activeTexture(gl.TEXTURE0 + unit); activeUnit = unit; }
      gl.bindTexture(gl.TEXTURE_2D, t); boundTextures.set(unit, t);
    }
    function activate(unit) { if (activeUnit !== unit) { gl.activeTexture(gl.TEXTURE0 + unit); activeUnit = unit; } }
    bindTexture(0, noise); targets.forEach((t, i) => bindTexture(i + 1, t)); bindTexture(3, atlasTex);
    gl.useProgram(scene); gl.uniform1i(a.iChannel0, 0); gl.uniform1i(a.iChannel1, 1);
    gl.useProgram(post); gl.uniform1i(b.scene, 2); gl.uniform1i(b.atlas, 3);
    // 图集按「格子尺寸 × 梯度预设」生成（P4）：任一变更即重建 + 重上传 +
    // 刷新几何 uniform；glyphW 按显示域每格物理像素上限（cell×dpr 上限）取值，
    // scale<1 时由 LINEAR 下采样兜底。glyphGain 按最密字形实测覆盖度归一
    // （min(覆盖度×gain,1) 截断，亮部色相不被裁剪）
    let atlas = null, atlasKey = '';
    function rebuildAtlas(force) {
      const cell = Math.min(24, Math.max(4, Number(state.current.asciiCell) || 8));
      const rampId = String(state.current.asciiRamp || 'std');
      const key = cell + '|' + rampId;
      if (!force && key === atlasKey) return;
      atlasKey = key;
      const glyphW = Math.max(6, Math.min(64, Math.round(cell * Math.min(devicePixelRatio || 1, 1.5))));
      atlas = buildAsciiAtlas({ ramp: ASCII_RAMPS[rampId] || ASCII_RAMP, glyphW, glyphH: glyphW * 2 });
      activate(3);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, atlas.width, atlas.height, 0, gl.RED, gl.UNSIGNED_BYTE, atlas.data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.useProgram(post);
      gl.uniform4f(b.tileGeom, atlas.tileW, atlas.tileH, atlas.glyphW, atlas.glyphH);
      gl.uniform1f(b.atlasPad, atlas.pad); gl.uniform1f(b.levels, atlas.levels);
      gl.uniform1f(b.glyphGain, 1 / Math.max(atlas.coverage[atlas.levels - 1], .05));
    }
    rebuildAtlas(true);
    function draw(now) {
      raf = 0; const s = state.current;
      // 帧率上限（P4，0=不限）：跳帧期间时间不推进（last 仅在真实绘制帧更新），
      // 动画速度与刷新率解耦；暂停/冻结时不续帧，交给底部条件收尾
      const cap = Number(s.fpsCap) || 0;
      if (cap && last && !s.paused && !rmFrozen() && now - last < 1000 / cap - 2) {
        raf = requestAnimationFrame(draw);
        return;
      }
      if (!s.introEnabled || rmFrozen()) introProgress = 1;
      else if (!s.paused) introProgress = Math.min(1, introProgress + Math.min((now - (last || now)) / 1000, .05) / s.introDuration);
      if (introProgress >= 1 && hooks.onIntroDone) { const cb = hooks.onIntroDone; hooks.onIntroDone = null; cb(); }
      if (!s.paused && !rmFrozen()) time += Math.min((now - (last || now)) / 1000, .05) * s.speed;
      last = now;
      const nw = pixelWidth, nh = pixelHeight;
      if (w !== nw || h !== nh) {
        w = nw; h = nh; el.width = w; el.height = h;
        gl.useProgram(post); gl.uniform2f(b.resolution, w, h);
        if (gw) gl.uniform2f(b.cellPx, w / gw, h / gh);
      }
      // 反馈 FBO / iResolution 重分配只跟网格走：仅显示尺寸变化（dpr、
      // resolution 滑杆）不再重分配 FBO，省一次纹理上传；窗口尺寸变化不足
      // 一格时网格不变，同样跳过。拖影重置仍由 reset() 统一负责
      const ngw = gridWidth, ngh = gridHeight;
      if (gw !== ngw || gh !== ngh) {
        gw = ngw; gh = ngh; history = false;
        targets.forEach((t, i) => {
          bindTexture(i + 1, t); activate(i + 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[i] ?? null);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
          gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        });
        gl.useProgram(scene); gl.uniform3f(a.iResolution, gw, gh, 1);
        gl.useProgram(post);
        gl.uniform2f(b.grid, gw, gh);
        if (w) gl.uniform2f(b.cellPx, w / gw, h / gh);
        if (hooks.onStats) hooks.onStats(gw, gh, Math.round(cssWidth / gw), Math.round(cssHeight / gh));
      }
      const write = 1 - read;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[write] ?? null); gl.useProgram(scene);
      gl.viewport(0, 0, gw, gh);
      gl.uniform1i(a.iChannel1, read + 1);
      for (const key of tintKeys) tint(a[key], s[key]);
      // 参数 uniform 由主题描述符声明映射（全局 zoom/offset 与主题专属参数同机制）
      for (const [u, key] of theme.paramUniforms) scalar(a[u], s[key]);
      scalar(a.intro, introProgress); scalar(a.introFeather, s.introFeather); scalar(a.iTime, time);
      scalar(a.uFeedback, history && introProgress >= 1 ? s.feedback : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(post);
      gl.viewport(0, 0, w, h);
      gl.uniform1i(b.scene, write + 1);
      scalar(b.intro, 1); scalar(b.introFeather, s.introFeather);
      scalar(b.uMode, s.asciiColor === 'phosphor' ? 1 : 0);
      scalar(b.uGamma, Math.min(2.5, Math.max(.4, Number(s.asciiGamma) || 1)));
      scalar(b.uDither, s.asciiDither ? 1 : 0);
      scalar(b.vignette, s.vignette); scalar(b.exposure, s.exposure);
      scalar(b.saturation, s.saturation); scalar(b.hue, s.hue); scalar(b.temperature, s.temperature);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      read = write; history = true;
      if (hooks.onFrame) hooks.onFrame();
      if (!s.paused && !rmFrozen() && (s.speed !== 0 || introProgress < 1)) request();
    }
    const reset = () => {
      cancelAnimationFrame(raf); raf = 0; last = 0; history = false;
      scale = state.current.resolution;
      updatePixelSize();
      rebuildAtlas(false);
      request();
    };
    wakeRef.current = reset;
    // 看门狗：预览环境可能节流/漏发 rAF 或 visibilitychange，兜底重启绘制循环
    watchdog = setInterval(() => {
      const s = state.current;
      if (!dead && !raf && !document.hidden && !s.paused && !rmFrozen() && (s.speed !== 0 || introProgress < 1)) request();
    }, 1500);
    let dprQuery;
    const dprChanged = () => {
      if (dprQuery) dprQuery.removeEventListener('change', dprChanged);
      dprQuery = matchMedia('(resolution: ' + (devicePixelRatio || 1) + 'dppx)');
      dprQuery.addEventListener('change', dprChanged);
      updatePixelSize(); reset();
    };
    dprChanged();
    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      cssWidth = entry.contentRect.width; cssHeight = entry.contentRect.height;
      updatePixelSize(); reset();
    });
    resize.observe(el);
    // 离屏停绘（借鉴 ascii.rest mount.ts）：滚出视口 → onscreen=false，request()
    // 不再续帧；滚回视口 → 清零 last（避免帧率上限逻辑按陈旧时间戳跳帧）并立即续帧。
    // 时间推进本就被 min(dt,.05) 夹住，重新可见不会跳变
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(entries => {
        onscreen = entries[entries.length - 1].isIntersecting;
        if (onscreen) { last = 0; request(); }
      });
      io.observe(el);
    }
    document.addEventListener('visibilitychange', reset);
    media.addEventListener('change', reset);
    request();
    return () => {
      resize.disconnect();
      if (dprQuery) dprQuery.removeEventListener('change', dprChanged);
      document.removeEventListener('visibilitychange', reset);
      media.removeEventListener('change', reset);
      wakeRef.current = () => {};
      clean();
    };
  } catch (e) { clean(); throw e; }
}
