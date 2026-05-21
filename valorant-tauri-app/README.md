# Valorant Tauri App

一个基于 Tauri + Vanilla JS 构建的 Windows 桌面工具，用于优化 Valorant 游戏相关进程的 CPU 亲和性与优先级，以减少后台进程对游戏性能的干扰。

## 功能

- **进程检测**：自动检测 Valorant 相关进程是否正在运行，并以状态指示灯实时反映运行状态
- **CPU 亲和性优化**：将指定进程绑定到最后一个逻辑 CPU 核心，避免与游戏主线程争抢资源
- **进程优先级调整**：将指定进程优先级设置为 Idle（最低），减少其对游戏帧率的影响
- **权限提升**：自动申请 `SeDebugPrivilege` 调试权限，确保可以操作受保护的进程
- **实时日志**：界面内嵌日志面板，记录每次操作的结果与状态变更
- **主题切换**：支持亮色 / 暗色主题切换（基于 DaisyUI）

## 技术栈

- **前端**：Vanilla HTML / CSS / JavaScript + DaisyUI + Tailwind CSS
- **后端**：Rust + Tauri v2
- **系统调用**：Windows API（`SetProcessAffinityMask`、`SetPriorityClass`、`AdjustTokenPrivileges`）

## 使用说明

> 需要以**管理员身份**运行，否则无法修改进程属性。

1. 启动应用后，程序自动检测相关进程是否运行
2. 状态灯说明：
   - 灰色：进程未运行
   - 蓝色：进程正在运行（可启用优化）
   - 绿色：优化已生效
3. 开启对应卡片的开关即可对该进程应用 CPU 亲和性和优先级优化
4. 点击刷新按钮可重新检测当前进程状态

## 开发环境

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 运行项目

```bash
npm install
npm run tauri dev
```

## 构建

```bash
npm run tauri build
```
