// 状态管理模块
import { addLog } from './logger.js';
import { PROCESSES } from './config.js';

const { invoke } = window.__TAURI__.core;

// ═══ 周期性状态轮询 ═══
let statusInterval = null;

export function startStatusPolling() {
  if (statusInterval) return;
  checkAllStatus(); // 立即执行一次
  statusInterval = setInterval(checkAllStatus, 5000);
}

export function stopStatusPolling() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
}

// ═══ 单个进程状态检测 ═══

// 检测指定进程是否运行，更新状态灯和 toggle 可用性
// processIndex: PROCESSES 数组中的索引
export async function initStatus(processIndex) {
  const proc = PROCESSES[processIndex];
  if (!proc || !proc.hasOptimize) return false;

  const status = document.getElementById(`proc-status-${processIndex}`);
  const toggle = document.getElementById(`proc-toggle-${processIndex}`);
  if (!status || !toggle) return false;

  try {
    const isRunning = await invoke('is_process_running', { processName: proc.name });

    if (isRunning) {
      status.classList.add('status-init');
      toggle.disabled = false;
      return true;
    } else {
      status.classList.remove('status-init');
      toggle.disabled = true;
      toggle.checked = false;
      return false;
    }
  } catch (error) {
    console.error(`检测 ${proc.name} 状态失败:`, error);
    toggle.disabled = true;
    toggle.checked = false;
    return false;
  }
}

// ═══ 全量状态检测 ═══

export async function checkAllStatus() {
  const optimizeProcesses = PROCESSES
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.hasOptimize);

  try {
    const results = await Promise.all(
      optimizeProcesses.map(p => initStatus(p.index))
    );

    return results;
  } catch (error) {
    addLog(`状态检测出错: ${error.message}`);
    return optimizeProcesses.map(() => false);
  }
}

// ═══ 优化开关 ═══

export async function toggleFeature(processIndex) {
  const proc = PROCESSES[processIndex];
  if (!proc) return;

  const toggle = document.getElementById(`proc-toggle-${processIndex}`);
  const status = document.getElementById(`proc-status-${processIndex}`);
  if (!toggle || !status) return;

  const isInitState = status.classList.contains('status-init');

  if (toggle.checked) {
    if (!isInitState) {
      toggle.checked = false;
      addLog(`${proc.name} 进程未运行，无法启用优化`);
      return;
    }

    try {
      const [success, message] = await invoke('fix_process_cpu_and_affinity', {
        processName: proc.name,
      });

      if (success) {
        status.classList.remove('status-init');
        status.classList.add('status-active');
        addLog(`${proc.name} 已启用优化: ${message}`);
      } else {
        toggle.checked = false;
        addLog(`${proc.name} 优化设置失败: ${message}`);
      }
    } catch (error) {
      toggle.checked = false;
      console.error(`设置 ${proc.name} 优化失败:`, error);
      addLog(`${proc.name} 优化设置出错: ${error.message}`);
    }
  } else {
    try {
      const [success, message] = await invoke('restore_process', {
        processName: proc.name,
      });

      if (success) {
        addLog(`${proc.name} 已恢复原始状态: ${message}`);
      } else {
        addLog(`${proc.name} 恢复失败: ${message}`);
      }
    } catch (error) {
      console.error(`恢复 ${proc.name} 失败:`, error);
      addLog(`${proc.name} 恢复出错: ${error.message}`);
    }

    status.classList.remove('status-active');
    await initStatus(processIndex);
  }
}

// ═══ 刷新（带防抖）═══

let refreshTimeout = null;
export async function refreshAllStatus() {
  if (refreshTimeout) {
    addLog('请勿频繁刷新，请等待1秒...');
    return;
  }

  const refreshBtn = document.getElementById('refreshBtn2');
  if (refreshBtn) refreshBtn.disabled = true;
  addLog('正在刷新进程状态...');

  await checkAllStatus();
  addLog('状态刷新完成');

  if (refreshBtn) refreshBtn.disabled = false;

  refreshTimeout = setTimeout(() => {
    refreshTimeout = null;
  }, 1000);
}
