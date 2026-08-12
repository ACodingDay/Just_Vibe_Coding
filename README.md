# 🎮 Just Vibe Coding

> 普通开发者的 Vibe Coding 成果分享 —— 不追求完美，只享受用代码创造东西的过程。

---

## 🙋 关于这个仓库

这里记录的是一个普通开发者在 **Vibe Coding** 模式下的作品合集。

没有严格的架构设计，没有完整的测试覆盖，有的只是一个想法、一段对话、然后跑起来了一个东西。

**Vibe Coding** 的核心：
> 🧠 想到什么做什么 → 🤖 和 AI 结对编程 → 🚀 跑起来就是胜利

---

## 📦 项目列表

### 🎯 [valorant-tauri-app](./valorant-tauri-app/)

> Valorant 游戏进程优化工具

基于 **Tauri + Rust + Vanilla JS** 构建的 Windows 桌面应用，用于自动检测并优化 Valorant 相关进程的 CPU 亲和性与优先级，减少后台进程对游戏帧率的干扰。

| 技术栈 | 平台 | 状态 |
|--------|------|------|
| Tauri v2 + Rust + Vanilla JS | Windows | ✅ 可用 |


### 🧹 [cleanmywin-tauri-app](./cleanmywin-tauri-app/)

> Windows 系统垃圾清理工具

基于 **Tauri 2 + React + TypeScript + shadcn/ui** 构建的 Windows 桌面应用，内置 20+ 条清理规则，支持一键扫描与清理系统缓存、浏览器缓存、微信/QQ/WPS 等应用垃圾，支持自定义规则与移入回收站。

| 技术栈 | 平台 | 状态 |
|--------|------|------|
| Tauri v2 + Rust + React + TypeScript + shadcn/ui | Windows | ✅ 可用 |
### 🧹 [deskclean-tauri-app](./deskclean-tauri-app/)

> 桌面文件可视化管理 & 整理助手

基于 **Tauri 2 + React + TypeScript** 构建的 Windows 桌面应用，自动扫描桌面文件并进行智能分类展示，通过拖拽和抽屉分组实现可视化的桌面整理体验。

| 技术栈 | 平台 | 状态 |
|--------|------|------|
| Tauri v2 + Rust + React + TypeScript + shadcn/ui | Windows | 🔨 开发中 |

### 🌐 [netclumsy-gpui-app](./netclumsy-gpui-app/)

> 网络包劣化工具（clumsy 重写版）

功能参考自 [jagt/clumsy](https://github.com/jagt/clumsy)，使用 **Rust + GPUI** 全量重写的 Windows 网络包劣化工具（中文界面），基于 WinDivert 内核驱动模拟延迟、丢包、节流、限带宽、重复、乱序、篡改、断连等网络状况，用于测试应用的网络容错能力。

| 技术栈 | 平台 | 状态 |
|--------|------|------|
| Rust + GPUI + gpui-component + windivert | Windows | 🔨 开发中 |

---

## 🛠️ 开发方式

这些项目基本都遵循同一个工作流：

```
灵感 → 和 AI 描述需求 → 迭代调试 → 能跑就行 → 丢上来
```

使用的工具：
- 🤖 **AI 辅助**：Qoder / Cursor 等，感谢 DeepSeek 的大力支持。
- 🦀 **后端**：Rust + Tauri（桌面端）
- 🌐 **前端**：Vanilla JS / React + TypeScript + shadcn/ui，看项目需要
- 🪟 **平台**：主要面向 Windows

---

## 💬 写在最后

> 代码不一定优雅，但每一个项目都是真实需求驱动的产物。
>
> Vibe Coding 不是滥用 AI，而是让普通人也能把想法变成现实。

如果你也是普通开发者，欢迎一起 Vibe 🎵

---

<div align="center">

**MIT License** · 随便用，随便改

</div>
