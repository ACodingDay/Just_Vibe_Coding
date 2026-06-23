# 🧹 CleanMyWin — Windows 系统清理工具

基于 **Tauri 2** 的 Windows 垃圾文件扫描与清理工具，一键释放磁盘空间，支持自定义规则 ✨

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 🦀 后端框架 | **Tauri 2** (Rust) |
| ⚛️ 前端框架 | **React 19** + **TypeScript** |
| 🎨 UI 组件 | **shadcn/ui** (Radix UI) + **Tailwind CSS 4** |
| ⚡ 构建工具 | **Vite** |
| 🔌 核心插件 | `tauri-plugin-store` (持久化)、`tauri-plugin-dialog` (文件选择)、`tauri-plugin-single-instance` (单实例) |
| 🧩 Rust 依赖 | `walkdir` (遍历)、`globset` (模式匹配)、`trash` (回收站)、`sysinfo` (系统信息)、`winreg` (注册表)、`chrono` (日期) |

## ✨ 主要功能

- 🔍 **深度扫描** — 内置 43 条清理规则，覆盖系统缓存、浏览器缓存、开发工具、微信/QQ/WPS 等应用垃圾
- ⚡ **流式清理** — 分组扫描 + 逐文件清理，实时进度反馈，支持移入回收站（可恢复）
- 📋 **规则管理** — 内置规则勾选启用/禁用，按风险等级（低/中/高）排序，支持全选/反选
- ✏️ **自定义规则** — 支持用户新增扫描路径、glob 匹配模式、风险标签、清理类型（删除文件 / 清空目录 / 执行命令 / 清空回收站 / 移入回收站）
- 📂 **文件夹选择** — 集成系统原生文件夹选择器，避免手动输入路径错误
- 🎨 **主题切换** — 亮色/暗色模式 + 3 种主题配色（余烬暖、科技蓝、清新绿）
- 📊 **累计统计** — 持久化记录累计清理次数与释放空间
- 🔔 **系统托盘** — 支持关闭窗口时最小化到系统托盘，防止误退出
- 🛡️ **中断保护** — 扫描/清理中关闭窗口弹出确认框，防止误操作

## 🗂️ 清理规则分类

| 分类 | 数量 | 示例 |
|------|------|------|
| 🧹 系统清理 | 20+ | 临时文件、回收站、Windows 更新缓存、DNS 缓存、NVIDIA 缓存、缩略图缓存、事件日志、注册表残留等 |
| 🌐 浏览器清理 | 3 | Chrome/Edge/IE 缓存、未完成下载 |
| ⚙️ 高级清理 | 5+ | 预读取文件、字体缓存、休眠文件等 |
| 🛠️ 开发工具 | 5+ | VS Code 扩展、pnpm 存储、Conda 包缓存、Conda 环境 |
| 📱 应用清理 | 3+ | 微信/QQ/WPS 缓存、ACLOS 游戏录像 |
| ✏️ 用户自定义 | 不限 | 支持自行添加 |

## 📦 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm tauri dev

# 构建生产版本
pnpm tauri build
```

## 🏷️ 版本管理

版本号统一在 `package.json` 中维护，通过 npm 命令升级并自动同步到 Rust 侧：

```bash
# 升级补丁版本 (0.1.3 → 0.1.4)，自动同步 Cargo.toml + tauri.conf.json
npm version patch

# 升级次版本 (0.1.3 → 0.2.0)
npm version minor

# 升级主版本 (0.1.3 → 1.0.0)
npm version major
```

> `postversion` 钩子会自动执行 `scripts/sync-version.mjs`，无需手动调用。

## 📁 项目结构

```
cleanmywin/
├── src/                       # 前端源码 (React + TypeScript)
│   ├── components/            # 通用组件
│   │   ├── ui/                # shadcn/ui 基础组件
│   │   ├── scan/              # 扫描规则表格 / 工具栏
│   │   └── settings/          # 设置面板（外观 / 通知 / 关于）
│   ├── pages/                 # 页面
│   │   ├── HomePage.tsx       # 主页（使用天数 / 快速扫描）
│   │   ├── CleanupPage.tsx    # 系统清理（流式扫描+清理）
│   │   ├── ScanPage.tsx       # 扫描规则管理
│   │   ├── CustomPage.tsx     # 自定义规则编辑
│   │   └── SettingsPage.tsx   # 设置
│   ├── hooks/                 # 自定义 Hooks (主题 / 动画 / 规则)
│   ├── lib/                   # 工具函数 (格式化 / 工具)
│   └── types/                 # TypeScript 类型定义
├── src-tauri/                 # Rust 后端
│   ├── src/
│   │   ├── rules/             # 规则引擎 (types / loader)
│   │   ├── scanner/           # 扫描器 (engine — 文件扫描 / 清理 / 注册表)
│   │   └── lib.rs             # 命令注册 + 系统托盘 + 窗口管理
│   ├── capabilities/          # Tauri 权限配置
│   ├── icons/                 # 应用图标资源
│   └── tauri.conf.json        # Tauri 配置（窗口 / 打包 / NSIS）
├── public/                    # 静态资源
│   ├── base_rules.json        # 43 条内置清理规则
│   └── lottie/                # Lottie 动画
├── scripts/                   # 构建脚本
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 📄 License

MIT
