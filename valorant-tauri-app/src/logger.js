// 日志系统模块
let logMessages = [];
const MAX_LOGS = 6;

export function addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    logMessages.unshift(`[${timestamp}] ${message}`);
    
    if (logMessages.length > MAX_LOGS) {
        logMessages = logMessages.slice(0, MAX_LOGS);
    }
    
    const log = document.getElementById('log');
    log.innerHTML = logMessages.join('<br>');
}

export function clearLog() {
    logMessages = [];
    const log = document.getElementById('log');
    log.innerHTML = '';
    addLog('日志已清空');
}
