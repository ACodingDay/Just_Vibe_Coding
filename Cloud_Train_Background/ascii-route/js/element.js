// ============================================================
// element.js — <ascii-art> 自定义元素（借鉴 ascii.rest 的封装架构）
// 架构借鉴 ascii.rest（MIT，@bas3line）的 src/ascii.ts：把一整幅动画封成
// 一个「单标签、属性驱动、生命周期自洽」的可嵌入组件；渲染核心仍用本目录
// 的 GPU 字形 pass（renderer.js / shader-source.js），不改渲染路径。
//
// 与 ascii.rest 的对应关系：
//   <ascii-art piece="donut">        →  <ascii-art theme="clouds">（本项目 piece=主题）
//   options='{"text":"hi"}' (JSON)   →  options='{"speed":.8,"asciiCell":12}'
//   fps / label / mono               →  fps（帧率上限）/ label / mono（磷屏绿）
//   connected/disconnected/attr 生命周期 + queueMicrotask 合批 → 同款
//   无 palette 时降级 <pre>          →  无 WebGL2 时降级为可读文本提示
//
// 依赖（均须先于本文件加载）：config.js（normalizeSettings / CLOUD_TRAIN_DEFAULTS）、
//   themes/registry.js（getCloudTrainTheme）、renderer.js（startCloudTrain）。
//
// 用法：
//   <ascii-art theme="ocean" cell="12" fps="30" color="phosphor" label="字符画大海"></ascii-art>
//   <ascii-art options='{"theme":"clouds","speed":1.2,"asciiGamma":1.4}'></ascii-art>
//   元素填满自身盒子，宿主需给定尺寸（如 height:60vh）——与壁纸容器同理。
//
// 暴露的 JS 接口（供宿主页/面板驱动，替代原来的全局 settings/boot/wakeRef）：
//   el.settings      当前实例的设置对象（可直接改字段后调用 el.wake()）
//   el.reboot()      重建渲染器（切换主题等需要重编译 program 时用）
//   el.wake()        仅重置/续帧（改了 settings 里的滑杆类参数后用，等价旧 wakeRef）
//   el.measuredFps   最近 1 秒窗口实测绘制帧率
//   事件 ascii-stats（{cols,rows,cellW,cellH}）、ascii-intro-done、ascii-fps（{fps}）
// ============================================================
'use strict';

(function () {
  // :where 给这些规则零特异性，宿主页面自己的样式永远优先（同 ascii.rest 的做法）
  const STYLE =
    ':where(ascii-art){display:block;overflow:hidden;position:relative}' +
    ':where(ascii-art>canvas){display:block;width:100%;height:100%}' +
    ':where(ascii-art>pre){margin:0;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:inherit;white-space:pre-wrap}';

  const OBSERVED = ['theme', 'piece', 'fps', 'cell', 'color', 'mono', 'label', 'options', 'paused', 'intro'];

  // 同一批属性变更只启动一次：微任务合批（借鉴 ascii.rest 的 soon()）——
  // 元素升级时每个属性都会各触发一次 attributeChangedCallback，合并成一次 mount
  const queued = new WeakSet();
  function soon(el, start) {
    if (queued.has(el)) return;
    queued.add(el);
    queueMicrotask(() => {
      queued.delete(el);
      if (el.isConnected) start();
    });
  }

  const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement);

  class AsciiArt extends Base {
    static get observedAttributes() { return OBSERVED; }

    constructor() {
      super();
      this._stop = null;
      this._run = 0;
      this._settings = null;
      this._wakeRef = { current: () => {} };
      this._frames = 0;
      this._fps = 0;
      this._fpsTickAt = 0;
    }

    connectedCallback() { soon(this, () => this._start()); }

    disconnectedCallback() {
      this._run++;
      if (this._stop) { this._stop(); this._stop = null; }
      this._wakeRef = { current: () => {} };
    }

    attributeChangedCallback() {
      if (this.isConnected) soon(this, () => this._start());
    }

    // ---- 对外接口 ----
    get settings() { return this._settings; }
    get measuredFps() { return this._fps; }
    reboot() { if (this.isConnected) this._start(); }
    wake() { this._wakeRef.current(); }

    // 便捷属性 → 设置对象：显式属性优先于 options JSON，二者都经 normalizeSettings
    // 校验/夹取（复用 config.js 的取值范围与枚举白名单，脏数据不会进渲染器）
    _computeSettings() {
      const opts = {};
      const optionsAttr = this.getAttribute('options');
      if (optionsAttr) {
        try { Object.assign(opts, JSON.parse(optionsAttr)); }
        catch (e) { console.warn('<ascii-art> options 不是合法 JSON，已忽略：', e); }
      }
      const theme = this.getAttribute('theme') || this.getAttribute('piece');
      if (theme) opts.theme = theme;
      const fps = this.getAttribute('fps');
      if (fps !== null && fps !== '' && !Number.isNaN(+fps)) opts.fpsCap = String(+fps);
      const cell = this.getAttribute('cell');
      if (cell !== null && cell !== '' && !Number.isNaN(+cell)) opts.asciiCell = +cell;
      const color = this.getAttribute('color');
      if (color === 'color' || color === 'phosphor') opts.asciiColor = color;
      if (this.hasAttribute('mono')) opts.asciiColor = 'phosphor';
      if (this.hasAttribute('paused')) opts.paused = this.getAttribute('paused') !== 'false';
      if (this.getAttribute('intro') === 'false') opts.introEnabled = false;
      return normalizeSettings(opts);
    }

    _start() {
      const run = ++this._run;
      // 切换属性时先停旧实例（ascii.rest 同款：this.#stop?.() 后再挂载）
      if (this._stop) { this._stop(); this._stop = null; }
      this._wakeRef = { current: () => {} };
      this._frames = 0; this._fps = 0; this._fpsTickAt = performance.now();

      const settings = this._computeSettings();
      this._settings = settings;

      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label',
        this.getAttribute('label') || (getCloudTrainTheme(settings.theme).title + '（ASCII 字符动画）'));
      this.replaceChildren(canvas);

      try {
        this._stop = startCloudTrain(canvas, { current: settings }, this._wakeRef, {
          onStats: (cols, rows, cw, ch) => {
            this.dispatchEvent(new CustomEvent('ascii-stats', { detail: { cols, rows, cellW: cw, cellH: ch } }));
          },
          onIntroDone: () => { this.dispatchEvent(new CustomEvent('ascii-intro-done')); },
          onFrame: () => {
            this._frames++;
            const now = performance.now();
            if (now - this._fpsTickAt >= 1000) {
              this._fps = Math.round(this._frames * 1000 / (now - this._fpsTickAt));
              this._frames = 0; this._fpsTickAt = now;
              this.dispatchEvent(new CustomEvent('ascii-fps', { detail: { fps: this._fps } }));
            }
          },
        });
      } catch (e) {
        // WebGL2 不可用 / 着色器编译失败：ascii.rest 在无 palette 时降级到 <pre> 文本；
        // 本项目没有 CPU 渲染路径，改为在元素内放一段可读文本（保留 label 供读屏），
        // 不把异常抛到全局，页面上多实例时一个失败不牵连其余
        if (run !== this._run) return;
        console.warn('<ascii-art> 渲染失败，已降级为文本提示：', e);
        const pre = document.createElement('pre');
        pre.textContent = '[ ASCII 动画不可用：' + (e && e.message ? e.message : String(e)) + ' ]';
        this.replaceChildren(pre);
        this._stop = null;
      }
    }
  }

  function define(tag) {
    tag = tag || 'ascii-art';
    if (typeof customElements === 'undefined') return;
    if (customElements.get(tag)) return;
    const style = document.createElement('style');
    style.textContent = tag === 'ascii-art' ? STYLE : STYLE.replaceAll('ascii-art', tag);
    document.head.append(style);
    if (tag === 'ascii-art') customElements.define(tag, AsciiArt);
    else customElements.define(tag, class extends AsciiArt {});
  }

  define('ascii-art');

  // 供宿主页脚本化使用（如设置面板绑定某个实例）
  if (typeof window !== 'undefined') { window.AsciiArt = AsciiArt; window.defineAsciiArt = define; }
})();
