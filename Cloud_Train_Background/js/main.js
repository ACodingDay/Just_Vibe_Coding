// ============================================================
// main.js — 装配入口
// 启动渲染器并在开场动画结束后淡入设置面板；渲染失败时展示错误。
// 依赖：config.js（settings）、renderer.js（startCloudTrain）。
// ============================================================
'use strict';

const canvas = document.getElementById('cloud-train');
const errBox = document.getElementById('err');
const panel = document.getElementById('panel');
const wakeRef = { current: () => {} };
let cleanup;
function boot() {
  if (cleanup) { cleanup(); cleanup = undefined; }
  errBox.style.display = 'none';
  panel.classList.remove('shown'); // 开场动画期间隐藏面板，播完再淡入
  try {
    cleanup = startCloudTrain(canvas, { current: settings }, wakeRef, {
      onIntroDone: () => panel.classList.add('shown'),
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
