// 导入模块
import { addLog, clearLog } from "./logger.js";
import {
  toggleFeature,
  checkAllStatus,
  refreshAllStatus,
  startStatusPolling,
} from "./status.js";
import { PROCESSES } from "./config.js";

const { invoke } = window.__TAURI__.core;

// ═══ Tab 切换 ═══
function switchTab(tabId) {
  const tabs = [
    document.getElementById("tab-content-1"),
    document.getElementById("tab-content-2"),
    document.getElementById("tab-content-3"),
  ];
  const btns = [
    document.getElementById("tabBtn1"),
    document.getElementById("tabBtn2"),
    document.getElementById("tabBtn3"),
  ];

  tabs.forEach((t) => t.classList.add("hidden"));
  btns.forEach((b) => {
    b.classList.remove("tab-active");
    b.setAttribute("aria-selected", "false");
  });

  const idx = parseInt(tabId) - 1;
  tabs[idx].classList.remove("hidden");
  btns[idx].classList.add("tab-active");
  btns[idx].setAttribute("aria-selected", "true");
}

// ═══ 数据驱动渲染 ═══

function renderProcessList() {
  const ul = document.querySelector('[data-component="process-list"]');
  if (!ul) return;
  ul.innerHTML = "";

  PROCESSES.forEach((proc, i) => {
    if (!proc.hasOptimize) return;

    const li = document.createElement("li");
    li.id = `card-${i}`;
    li.className = "flex items-center px-4 py-3.5";
    li.innerHTML = `
      <div id="proc-status-${i}" class="status-dot w-3 h-3 rounded-full shrink-0 mr-3"></div>
      <div class="tooltip tooltip-right mr-auto" data-tip="${proc.desc}">
        <h3 class="font-medium text-sm">${proc.name}</h3>
      </div>
      <label class="cursor-pointer shrink-0">
        <input type="checkbox" id="proc-toggle-${i}" class="toggle toggle-error" />
      </label>
    `;
    ul.appendChild(li);

    // 绑定优化开关事件
    li.querySelector(`#proc-toggle-${i}`).addEventListener("change", () =>
      toggleFeature(i),
    );
  });
}

function renderMonitorList() {
  const ul = document.querySelector('[data-component="monitor-list"]');
  if (!ul) return;
  ul.innerHTML = "";

  PROCESSES.forEach((proc, i) => {
    if (!proc.hasMonitor) return;

    const li = document.createElement("li");
    li.className = "flex items-center px-4 py-3.5";
    li.innerHTML = `
      <h3 class="font-medium text-sm mr-auto tooltip tooltip-top tooltip-path"
          data-tip="${proc.path}">${proc.name}</h3>
      <label class="cursor-pointer shrink-0">
        <input type="checkbox" id="monitor-toggle-${i}" class="toggle toggle-info" />
      </label>
    `;
    ul.appendChild(li);

    // 绑定监听开关事件
    const toggle = li.querySelector(`#monitor-toggle-${i}`);
    toggle.addEventListener("change", () =>
      handleMonitorToggle(proc.name, toggle.checked, toggle),
    );
  });
}

// ═══ 监听日志（虚拟列表）═══
let monitorInterval = null;

function getActiveMonitors() {
  const active = [];
  PROCESSES.forEach((proc, i) => {
    if (!proc.hasMonitor) return;
    const toggle = document.getElementById(`monitor-toggle-${i}`);
    if (toggle && toggle.checked) active.push(proc.name);
  });
  return active;
}

const FILE_OP_MAP = {
  Create: "创建",
  CreateNewFile: "新建文件",
  Read: "读取",
  Write: "写入",
  SetInfo: "修改属性",
  SetDelete: "标记删除",
  Delete: "删除",
  DeletePath: "删除路径",
  Rename: "重命名",
  RenamePath: "重命名路径",
  SetLink: "设置链接",
  SetLinkPath: "设置链接路径",
};

const OP_BADGE_MAP = {
  Create: "badge-success",
  CreateNewFile: "badge-success",
  Read: "badge-info",
  Write: "badge-warning",
  SetInfo: "badge-warning",
  SetDelete: "badge-error",
  Delete: "badge-error",
  DeletePath: "badge-error",
  Rename: "badge-accent",
  RenamePath: "badge-accent",
  SetLink: "badge-info",
  SetLinkPath: "badge-info",
};

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── 虚拟列表状态 ──
const ROW_HEIGHT = 33;
const VIRTUAL_BUFFER = 3;
let monitorLogs = []; // 按时间倒序（最新在前）
let vsPrevLen = 0;
let vsScrollTop = 0;
let vsContainer = null;
let notificationInterval = null;

function startMonitorPolling() {
  if (monitorInterval) return;
  pollMonitorLog();
  monitorInterval = setInterval(pollMonitorLog, 2000);
  startNotificationPolling();
}

function stopMonitorPolling() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  stopNotificationPolling();
}

async function pollNotifications() {
  try {
    const msgs = await invoke("drain_notifications");
    for (const msg of msgs) {
      addLog(msg);
    }
  } catch (err) {
    console.error("获取通知失败:", err);
  }
}

function startNotificationPolling() {
  if (notificationInterval) return;
  pollNotifications();
  notificationInterval = setInterval(pollNotifications, 2000);
}

function stopNotificationPolling() {
  if (notificationInterval) {
    clearInterval(notificationInterval);
    notificationInterval = null;
  }
}

function initVirtualScroll() {
  if (vsContainer) return;
  vsContainer = document.getElementById("monitorLogScroll");
  if (!vsContainer) return;
  vsContainer.addEventListener("scroll", () => {
    vsScrollTop = vsContainer.scrollTop;
    renderVirtualRows();
  }, { passive: true });
  // ResizeObserver：窗口大小变化时重新计算可见行数
  new ResizeObserver(() => renderVirtualRows()).observe(vsContainer);
}

function renderVirtualRows() {
  const body = document.getElementById("monitorLogBody");
  if (!body || !vsContainer) return;

  const total = monitorLogs.length;
  if (total === 0) {
    body.innerHTML =
      '<tr><td colspan="5" class="text-center text-base-content/40 py-8">暂无监听日志</td></tr>';
    return;
  }

  const viewHeight = vsContainer.clientHeight;
  const visibleCount = Math.ceil(viewHeight / ROW_HEIGHT) + 1;
  const startIndex = Math.max(
    0,
    Math.floor(vsScrollTop / ROW_HEIGHT) - VIRTUAL_BUFFER,
  );
  const endIndex = Math.min(
    total,
    startIndex + visibleCount + VIRTUAL_BUFFER * 2,
  );

  const topPad = startIndex * ROW_HEIGHT;
  const bottomPad = (total - endIndex) * ROW_HEIGHT;

  let html = "";
  if (topPad > 0) {
    html += `<tr aria-hidden="true"><td colspan="5" style="height:${topPad}px;padding:0;border:none"></td></tr>`;
  }
  for (let i = startIndex; i < endIndex; i++) {
    const e = monitorLogs[i];
    const opLabel = FILE_OP_MAP[e.operation] || escapeHtml(e.operation);
    const opBadge = OP_BADGE_MAP[e.operation] || "";
    const countSuffix = (e.count && e.count > 1) ? ` ×${e.count}` : "";
    html += `<tr>
            <td>${e.id}</td>
            <td>${escapeHtml(e.process_name)}</td>
            <td><span class="badge badge-soft badge-xs ${opBadge}">${opLabel}${countSuffix}</span></td>
            <td class="max-w-[260px] truncate" title="${escapeHtml(e.file_path)}">${escapeHtml(e.file_path)}</td>
            <td>${formatTime(e.timestamp)}</td>
        </tr>`;
  }
  if (bottomPad > 0) {
    html += `<tr aria-hidden="true"><td colspan="5" style="height:${bottomPad}px;padding:0;border:none"></td></tr>`;
  }
  body.innerHTML = html;
}

async function pollMonitorLog() {
  try {
    const logs = await invoke("get_monitor_log");
    // 后端按时间正序（旧→新），反转为倒序（新→旧）
    monitorLogs = logs.reverse();

    // 新条目到达时补偿滚动位置，避免视图跳动
    if (vsContainer && monitorLogs.length > vsPrevLen && vsPrevLen > 0) {
      const newCount = monitorLogs.length - vsPrevLen;
      vsContainer.scrollTop += newCount * ROW_HEIGHT;
      vsScrollTop = vsContainer.scrollTop;
    }
    vsPrevLen = monitorLogs.length;

    renderVirtualRows();
  } catch (err) {
    console.error("获取监听日志失败:", err);
  }
}

const monitorToggleLocks = new Map();

async function handleMonitorToggle(processName, enabled, toggleEl) {
  // 重入锁：同一进程的请求正在处理中则忽略
  if (monitorToggleLocks.get(processName)) return;
  monitorToggleLocks.set(processName, true);

  try {
    if (enabled) {
      const [ok, msg] = await invoke("start_monitoring", { processName });
      if (ok) {
        addLog(`已开启 ${processName} 文件 I/O 监听`);
      } else {
        if (toggleEl) toggleEl.checked = false;
        addLog(`开启监听失败: ${msg}`);
      }
    } else {
      const [ok, msg] = await invoke("stop_monitoring", { processName });
      if (ok) {
        addLog(`已关闭 ${processName} 文件 I/O 监听`);
      } else {
        if (toggleEl) toggleEl.checked = true;
        addLog(`关闭监听失败: ${msg}`);
      }
    }
    const active = getActiveMonitors();
    if (active.length > 0) {
      startMonitorPolling();
    } else {
      stopMonitorPolling();
    }
  } catch (err) {
    addLog(`监听操作失败: ${err}`);
    if (toggleEl) toggleEl.checked = !enabled;
  } finally {
    monitorToggleLocks.delete(processName);
  }
}

// ── Toast 通知 ──
function showToast(message, type = "info") {
  const toastDiv = document.createElement("div");
  toastDiv.className = "toast toast-end toast-bottom z-50";
  toastDiv.innerHTML = `
        <div class="alert alert-${type} shadow-lg flex items-center gap-2">
            <span class="text-xs">${message}</span>
        </div>
    `;
  document.body.appendChild(toastDiv);
  setTimeout(() => {
    toastDiv.style.transition = "opacity 0.3s";
    toastDiv.style.opacity = "0";
    setTimeout(() => toastDiv.remove(), 300);
  }, 3000);
}

async function exportMonitorLog() {
  if (monitorLogs.length === 0) {
    showToast("暂无监听日志可导出", "warning");
    return;
  }
  try {
    const [ok, msg] = await invoke("export_monitor_log");
    if (ok) {
      showToast("导出日志成功", "success");
      addLog(`监听日志已导出: ${msg}`);
    } else {
      showToast(`导出失败: ${msg}`, "error");
      addLog(`导出失败: ${msg}`);
    }
  } catch (err) {
    showToast(`导出失败: ${err}`, "error");
    addLog(`导出失败: ${err}`);
  }
}

// E1: 关闭管理员提示 Toast
function dismissAdminAlert() {
  const toast = document.getElementById("adminAlert");
  if (toast) toast.remove();
}

// 等待页面 DOM 加载完成
window.addEventListener("DOMContentLoaded", async () => {
  const dev = await invoke("is_dev");

  // 全局禁止鼠标右键菜单
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // E1: 检测管理员身份，dev 模式常驻显示或非管理员时显示 Toast 提示
  try {
    const elevated = await invoke("is_elevated");
    if (dev || !elevated) {
      const toastDiv = document.createElement("div");
      toastDiv.id = "adminAlert";
      toastDiv.className =
        "toast toast-center toast-bottom z-50 pointer-events-none";
      toastDiv.innerHTML = `
                <div class="alert alert-warning shadow-lg pointer-events-auto flex items-center gap-2">
                    <span class="inline-block size-5 bg-current shrink-0" style="mask-image: url('../static/warning.svg'); mask-size: contain; mask-repeat: no-repeat; mask-position: center"></span>
                    <span class="flex-1 text-xs text-center">请以管理员身份运行</span>
                    <button class="btn btn-ghost btn-xs btn-circle">✕</button>
                </div>
            `;
      toastDiv
        .querySelector("button")
        .addEventListener("click", dismissAdminAlert);
      document.body.appendChild(toastDiv);
      addLog("⚠ 未以管理员身份运行，核心功能将无法生效");
    }
  } catch (error) {
    console.error("管理员检测失败:", error);
    addLog(`管理员检测出错: ${error}`);
  }

  // 等待 app.html 内容加载完成
  const appDiv = document.getElementById("app");
  let retries = 0;
  const maxRetries = 50; // 最多等待 5 秒

  while (!document.querySelector("#tabBtn1") && retries < maxRetries) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    retries++;
  }

  if (document.querySelector("#tabBtn1")) {
    // 数据驱动渲染列表
    renderProcessList();
    renderMonitorList();

    // 绑定 Tab 切换事件
    document
      .getElementById("tabBtn1")
      .addEventListener("click", () => switchTab("1"));
    document
      .getElementById("tabBtn2")
      .addEventListener("click", () => switchTab("2"));
    document
      .getElementById("tabBtn3")
      .addEventListener("click", () => switchTab("3"));

    // 绑定操作按钮事件
    document
      .getElementById("refreshBtn2")
      .addEventListener("click", refreshAllStatus);
    document.getElementById("clearBtn").addEventListener("click", clearLog);
    document
      .getElementById("exportMonitorBtn")
      .addEventListener("click", exportMonitorLog);

    // 初始化监听日志虚拟列表
    initVirtualScroll();

    addLog("正在检测进程状态...");
    await checkAllStatus();

    // 启动周期性状态轮询
    startStatusPolling();
  } else {
    addLog("页面元素加载超时，请刷新页面");
  }

  // Footer: 注入年份和版本号
  const yearEl = document.getElementById("footerYear");
  const versionEl = document.getElementById("appVersion");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  if (versionEl) {
    try {
      const ver = await invoke("app_version");
      versionEl.textContent = `v${ver}`;
    } catch {
      versionEl.textContent = "v0.0.0";
    }
  }
});
