// 导入模块
import { addLog, clearLog } from './logger.js';
import { toggleFeature, checkAllStatus, refreshAllStatus } from './status.js';

const { invoke } = window.__TAURI__.core;

// E1: 关闭管理员提示 Toast
function dismissAdminAlert() {
    const toast = document.getElementById('adminAlert');
    if (toast) toast.remove();
}

// 主题切换由 DaisyUI theme-controller 组件自动处理（checkbox value="dark"）
function toggleTheme() {}

// 打开设置（预留功能）
function openSettings() {
    addLog('设置功能待开发...');
}

// 等待页面 DOM 加载完成
window.addEventListener('DOMContentLoaded', async () => {
    const dev = await invoke('is_dev');

    // 生产环境禁用右键菜单（防止页面出现浏览器默认上下文菜单）
    if (!dev) {
        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    // E1: 检测管理员身份，dev 模式常驻显示或非管理员时显示 Toast 提示
    try {
        const elevated = await invoke('is_elevated');
        if (dev || !elevated) {
            const toastDiv = document.createElement('div');
            toastDiv.id = 'adminAlert';
            toastDiv.className = 'toast toast-center toast-bottom z-50 pointer-events-none';
            toastDiv.innerHTML = `
                <div class="alert alert-warning shadow-lg pointer-events-auto" style="grid-template-columns: max-content 1fr max-content; grid-auto-flow: column">
                    <span class="inline-block size-5 bg-current shrink-0" style="mask-image: url('./static/warning.svg'); mask-size: contain; mask-repeat: no-repeat; mask-position: center"></span>
                    <span class="flex-1 text-xs text-center">请以管理员身份运行</span>
                    <button class="btn btn-ghost btn-xs btn-circle">✕</button>
                </div>
            `;
            toastDiv.querySelector('button').addEventListener('click', dismissAdminAlert);
            document.body.appendChild(toastDiv);
            addLog('⚠ 未以管理员身份运行，核心功能将无法生效');
        }
    } catch (error) {
        console.error('管理员检测失败:', error);
        addLog(`管理员检测出错: ${error}`);
    }

    // 等待 app.html 内容加载完成
    const appDiv = document.getElementById('app');
    let retries = 0;
    const maxRetries = 50; // 最多等待 5 秒

    while (!document.querySelector('#card1') && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }

    if (document.querySelector('#card1')) {
        // 绑定事件（innerHTML 注入的 inline handler 在 production build 中不生效）
        document.getElementById('refreshBtn').addEventListener('click', refreshAllStatus);
        document.getElementById('clearBtn').addEventListener('click', clearLog);
        document.getElementById('settingsBtn').addEventListener('change', openSettings);
        document.getElementById('toggle1').addEventListener('change', () => toggleFeature(1));
        document.getElementById('toggle2').addEventListener('change', () => toggleFeature(2));

        addLog('正在检测进程状态...');
        await checkAllStatus();
    } else {
        addLog('页面元素加载超时，请刷新页面');
    }

    // Footer: 注入年份和版本号
    const yearEl = document.getElementById('footerYear');
    const versionEl = document.getElementById('appVersion');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    if (versionEl) {
        try {
            const ver = await invoke('app_version');
            versionEl.textContent = `v${ver}`;
        } catch {
            versionEl.textContent = 'v0.0.0';
        }
    }
});
