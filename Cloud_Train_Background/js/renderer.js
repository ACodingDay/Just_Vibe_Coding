// ============================================================
// renderer.js — WebGL 2 渲染器
// 逻辑与源码 CloudTrainRenderer.#start 一致，改写为纯 JS：
// 两块 FBO 交替做帧间 feedback，场景 shader 绘制到离屏纹理，
// 后处理 shader（曝光/色相/暗角/开场揭示）输出到画布。
// ============================================================
'use strict';

function startCloudTrain(canvas, state, wakeRef, hooks) {
  hooks = hooks || {};
  const el = canvas;
  const gl = el.getContext('webgl2', {alpha:false, antialias:false, depth:false});
  if (!gl) throw new Error('需要 WebGL 2 支持（WebGL 2 is required）');
  const programs = [], textures = [], buffers = [], fbos = [];
  let raf = 0, last = 0, time = 0, w = 0, h = 0, read = 0, history = false, dead = false, watchdog = 0;
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
    programs.forEach(p => gl.deleteProgram(p)); textures.forEach(t => gl.deleteTexture(t));
    buffers.forEach(b => gl.deleteBuffer(b)); fbos.forEach(f => gl.deleteFramebuffer(f));
  }
  try {
    // 与源码一致：前景保留五次采样，但把时间展开压缩为三分之一
    const scene = program(SHADER_FRAGMENT.replace('t+4.*float(i)/float(n)/60.', 't+(4./3.)*float(i)/float(n)/60.'));
    const post = program(SHADER_IMAGE);
    const locations = (p, names) => Object.fromEntries(names.map(k => [k, gl.getUniformLocation(p, k)]));
    const tintKeys = ['skyTint','smokeTint','trainTint'];
    const a = locations(scene, ['iResolution','iTime','iChannel0','iChannel1','uFeedback','zoom','offset','amplitude','uDetail','intro','introFeather', ...tintKeys]);
    const b = locations(post, ['resolution','scene','vignette','exposure','saturation','hue','temperature','intro','introFeather']);
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
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    // 系统开启「减少动态效果」时冻结动画（无障碍默认行为）；
    // 用户勾选「忽略系统减少动态效果」后可强制播放
    const rmFrozen = () => media.matches && !state.current.ignoreReducedMotion;
    function request() { if (!dead && !raf && !document.hidden) raf = requestAnimationFrame(draw); }
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
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    function updatePixelSize() {
      const d = Math.min(devicePixelRatio || 1, 1.5) * scale;
      pixelWidth = Math.max(1, Math.min(maxViewport[0], Math.round(cssWidth * d)));
      pixelHeight = Math.max(1, Math.min(maxViewport[1], Math.round(cssHeight * d)));
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
    bindTexture(0, noise); targets.forEach((t, i) => bindTexture(i + 1, t));
    gl.useProgram(scene); gl.uniform1i(a.iChannel0, 0); gl.uniform1i(a.iChannel1, 1);
    gl.useProgram(post); gl.uniform1i(b.scene, 2);
    function draw(now) {
      raf = 0; const s = state.current;
      if (!s.introEnabled || rmFrozen()) introProgress = 1;
      else if (!s.paused) introProgress = Math.min(1, introProgress + Math.min((now - (last || now)) / 1000, .05) / s.introDuration);
      if (introProgress >= 1 && hooks.onIntroDone) { const cb = hooks.onIntroDone; hooks.onIntroDone = null; cb(); }
      if (!s.paused && !rmFrozen()) time += Math.min((now - (last || now)) / 1000, .05) * s.speed;
      last = now;
      const nw = pixelWidth, nh = pixelHeight;
      if (w !== nw || h !== nh) {
        w = nw; h = nh; el.width = w; el.height = h; history = false;
        targets.forEach((t, i) => {
          bindTexture(i + 1, t); activate(i + 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[i] ?? null);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
          gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        });
        gl.useProgram(scene); gl.uniform3f(a.iResolution, w, h, 1);
        gl.useProgram(post); gl.uniform2f(b.resolution, w, h);
        gl.viewport(0, 0, w, h);
      }
      const write = 1 - read;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[write] ?? null); gl.useProgram(scene);
      gl.uniform1i(a.iChannel1, read + 1);
      for (const key of tintKeys) tint(a[key], s[key]);
      scalar(a.zoom, s.zoom); scalar(a.offset, s.offset); scalar(a.amplitude, s.amplitude); scalar(a.uDetail, s.detail);
      scalar(a.intro, introProgress); scalar(a.introFeather, s.introFeather); scalar(a.iTime, time);
      scalar(a.uFeedback, history && introProgress >= 1 ? s.feedback : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(post);
      gl.uniform1i(b.scene, write + 1);
      scalar(b.intro, 1); scalar(b.introFeather, s.introFeather);
      scalar(b.vignette, s.vignette); scalar(b.exposure, s.exposure);
      scalar(b.saturation, s.saturation); scalar(b.hue, s.hue); scalar(b.temperature, s.temperature);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      read = write; history = true;
      if (!s.paused && !rmFrozen() && (s.speed !== 0 || introProgress < 1)) request();
    }
    const reset = () => {
      cancelAnimationFrame(raf); raf = 0; last = 0; history = false;
      if (scale !== state.current.resolution) { scale = state.current.resolution; updatePixelSize(); }
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
