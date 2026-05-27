// 状态管理模块
import { addLog } from './logger.js';

const { invoke } = window.__TAURI__.core;

// 切换功能状态
export async function toggleFeature(cardId) {
    const toggle = document.getElementById('toggle' + cardId);
    const status = document.getElementById('status' + cardId);
    const card = document.getElementById('card' + cardId);
    const featureName = card.querySelector('h3').textContent;
    
    // 检查是否为 init 状态（进程正在运行）
    const isInitState = status.classList.contains('status-init');
    
    if (toggle.checked) {
        if (!isInitState) {
            // 不是 init 状态，说明进程未运行，不执行操作
            toggle.checked = false;
            addLog(`${featureName} 进程未运行，无法启用优化`);
            return;
        }
        
        try {
            // 调用 rust 的函数 - 设置进程的 CPU 亲和性和优先级
            // 新的返回类型为 (bool, String)
            const result = await invoke('fix_process_cpu_and_affinity', { processName: `"${featureName}"` });
            const success = result[0];
            const message = result[1];
            
            if (success) {
                // 移除 init 状态，切换为 active 状态
                status.classList.remove('status-init', 'bg-blue-500');
                status.classList.add('status-active', 'bg-green-500');
                addLog(`${featureName} 已启用优化: ${message}`);
            } else {
                // 操作失败，恢复 toggle 状态
                toggle.checked = false;
                addLog(`${featureName} 优化设置失败: ${message}`);
            }
        } catch (error) {
            // 发生错误，恢复 toggle 状态
            toggle.checked = false;
            console.error(`设置 ${featureName} 优化失败:`, error);
            addLog(`${featureName} 优化设置出错: ${error.message}`);
        }
    } else {
        // 恢复为默认状态
        status.classList.remove('status-active');
        status.classList.remove('bg-green-500');
        status.classList.add('bg-slate-600');
        addLog(`${featureName} 已取消优化`);
        
        // 重新检测进程状态
        await initStatus(cardId);
    }
}

// 初始化状态灯 - 返回更改结果
async function initStatus(cardId) {
    const card = document.getElementById('card' + cardId);
    const status = document.getElementById('status' + cardId);
    const featureName = card.querySelector('h3').textContent;
    
    try {
        // 调用 rust 的函数 - 传入进程名（带双引号）
        // Rust 端的 #[tauri::command] 宏会自动将参数名从 snake_case (process_name) 转换为 camelCase (processName)，所以 JavaScript 端需要使用 processName 来匹配。
        const isRunning = await invoke('is_process_running', { processName: `"${featureName}"` });
        
        // 设置 init 状态（蓝色表示检测到正在运行）
        if (isRunning) {
            status.classList.add('status-init', 'bg-blue-500');
            status.classList.remove('bg-slate-600');
            return true;
        } else {
            status.classList.remove('status-init', 'bg-blue-500');
            status.classList.add('bg-slate-600');
            return false;
        }
    } catch (error) {
        console.error(`检测 ${featureName} 状态失败:`, error);
        return false;
    }
}

// 检测所有状态并记录日志（复用逻辑）
export async function checkAllStatus() {
    try {
        // 并行初始化所有卡片的状态
        const results = await Promise.all([
            initStatus(1),
            initStatus(2)
        ]);
        
        // 根据结果显示日志
        const card1Name = document.querySelector('#card1 h3').textContent;
        const card2Name = document.querySelector('#card2 h3').textContent;
        
        if (results[0]) {
            addLog(`检测到 ${card1Name} 正在运行`);
        }
        if (results[1]) {
            addLog(`检测到 ${card2Name} 正在运行`);
        }
        
        if (!results[0] && !results[1]) {
            addLog('未检测到相关进程');
        }
        
        return results;
    } catch (error) {
        addLog(`状态检测出错: ${error.message}`);
        return [false, false];
    }
}

// 刷新所有状态（带防抖）
let refreshTimeout = null;
export async function refreshAllStatus() {
    // 防抖：如果在1秒内重复点击则忽略
    if (refreshTimeout) {
        addLog('请勿频繁刷新，请等待1秒...');
        return;
    }
    
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.disabled = true;
    addLog('正在刷新进程状态...');
    
    await checkAllStatus();
    addLog('状态刷新完成');
    
    refreshBtn.disabled = false;
    
    // 设置防抖定时器
    refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
    }, 1000);
}