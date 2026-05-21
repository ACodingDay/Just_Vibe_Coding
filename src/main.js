// 导入模块
import { addLog, clearLog } from './logger.js';
import { toggleFeature, checkAllStatus, refreshAllStatus } from './status.js';

// 切换主题
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // 切换 data-theme 属性，DaisyUI 会自动处理主题样式
    html.setAttribute('data-theme', newTheme);
    
    addLog(`已切换到${newTheme === 'dark' ? '暗色' : '亮色'}主题`);
}

// 打开设置（预留功能）
function openSettings() {
    addLog('设置功能待开发...');
}

// 挂载到全局作用域（供 HTML 内联事件使用）
window.toggleFeature = toggleFeature;
window.clearLog = clearLog;
window.refreshAllStatus = refreshAllStatus;
window.toggleTheme = toggleTheme;
window.openSettings = openSettings;

// 初始化主题
function initTheme() {
    // DaisyUI 会根据 data-theme 属性自动应用主题样式
    // 无需手动添加背景类
}

// 等待页面 DOM 加载完成
window.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    
    // 等待 app.html 内容加载完成
    const appDiv = document.getElementById('app');
    let retries = 0;
    const maxRetries = 50; // 最多等待 5 秒
    
    while (!document.querySelector('#card1') && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    if (document.querySelector('#card1')) {
        addLog('正在检测进程状态...');
        await checkAllStatus();
    } else {
        addLog('页面元素加载超时，请刷新页面');
    }
});
