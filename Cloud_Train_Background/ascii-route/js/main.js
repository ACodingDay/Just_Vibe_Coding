// ============================================================
// main.js — 装配入口（ASCII 路线版）
// 与主版本差异：标题/页头带 ASCII 标识；渲染器经 hooks.onStats 上报
// 字符格网格尺寸并显示在页头（P1 解耦改造的直观验证——改窗口大小、
// 改「渲染比例」滑杆时网格不变，改窗口跨过格边界时网格才变）。
// 启动渲染器并在开场动画结束后淡入设置面板；渲染失败时展示错误。
// 依赖：config.js（settings）、renderer.js（startCloudTrain）。
// ============================================================
'use strict';

const canvas = document.getElementById('cloud-train');
const errBox = document.getElementById('err');
const panel = document.getElementById('panel');
const gridInfo = document.getElementById('grid-info');
// 页头读出 = 网格尺寸 + 实测绘制帧率（onFrame 计数，1 秒窗口）——
// 帧率上限滑杆的效果直接可见（30fps 档壁纸功耗的直观依据）
let statsText = '', frameCount = 0, fpsShown = 0, fpsTickAt = performance.now();
function updateGridInfo() { if (gridInfo) gridInfo.textContent = statsText + (fpsShown ? ' · ' + fpsShown + ' fps' : ''); }
const wakeRef = { current: () => {} };
let cleanup;
function boot() {
  if (cleanup) { cleanup(); cleanup = undefined; }
  errBox.style.display = 'none';
  panel.classList.remove('shown'); // 开场动画期间隐藏面板，播完再淡入
  // 页头与标签页标题跟随主题（副标题为原项目署名，保持不变）
  const themeTitle = getCloudTrainTheme(settings.theme).title;
  document.querySelector('header h1').textContent = themeTitle + ' · ASCII';
  document.title = themeTitle + ' — Code-Codex 背景插件独立测试（ASCII 路线）';
  try {
    cleanup = startCloudTrain(canvas, { current: settings }, wakeRef, {
      onIntroDone: () => panel.classList.add('shown'),
      onStats: (cols, rows, cw, ch) => { statsText = 'ASCII 网格 ' + cols + '×' + rows + '（格 ' + cw + '×' + ch + ' CSS px）'; updateGridInfo(); },
      onFrame: () => {
        frameCount++;
        const now = performance.now();
        if (now - fpsTickAt >= 1000) { fpsShown = Math.round(frameCount * 1000 / (now - fpsTickAt)); frameCount = 0; fpsTickAt = now; updateGridInfo(); }
      },
    });
  }
  catch (e) {
    errBox.textContent = '渲染失败：' + (e && e.message ? e.message : String(e));
    errBox.style.display = 'block';
    panel.classList.add('shown'); // 渲染失败时仍要能看到设置面板排查
  }
}
// WebGL 上下文丢失（驱动重置、切换系统显示/动画设置等可能触发）：
// 停掉旧循环，等浏览器恢复上下文后自动重新初始化，避免黑屏卡死
canvas.addEventListener('webglcontextlost', ev => {
  ev.preventDefault(); // 允许浏览器稍后恢复上下文
  if (cleanup) { cleanup(); cleanup = undefined; }
});
canvas.addEventListener('webglcontextrestored', () => boot());
boot();
