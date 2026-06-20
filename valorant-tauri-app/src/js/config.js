// 统一进程配置（单一数据源）
export const PROCESSES = [
  {
    name: "SGuard64.exe",
    desc: "ACE-Guard Client",
    path: "C:/Program Files/AntiCheatExpert/SGuard/x64/SGuard64.exe",
    hasOptimize: true,
    hasMonitor: true,
  },
  {
    name: "SGuardSvc64.exe",
    desc: "ACE-Guard Service",
    path: "C:/Program Files/AntiCheatExpert/SGuard/x64/SGuardSvc64.exe",
    hasOptimize: true,
    hasMonitor: true,
  },
  {
    name: "SGuardUpdate64.exe",
    desc: "ACE-Guard Updater",
    path: "C:/Program Files/AntiCheatExpert/SGuard/x64/SGuardUpdate64.exe",
    hasOptimize: false,
    hasMonitor: true,
  },
];
