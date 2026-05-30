// 模块级同步变量，供 App.tsx 和 SettingsPage.tsx 跨组件共享关闭行为设置
// 避免 onCloseRequested 中异步读 store 导致的关闭失效问题

let closeToTrayCache = false;

export function getCloseToTrayCache(): boolean {
    return closeToTrayCache;
}

export function setCloseToTrayCache(v: boolean): void {
    closeToTrayCache = v;
}

// 标记是否正在扫描/清理中，关闭窗口时用于提示
let isOperating = false;

export function getIsOperating(): boolean {
    return isOperating;
}

export function setIsOperating(v: boolean): void {
    isOperating = v;
}
