# 🧹 CleanMyWin — Windows 系统清理工具

基于 **Tauri 2** 的 Windows 垃圾文件扫描与清理工具，一键释放磁盘空间，支持自定义规则 ✨

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 🦀 后端框架 | **Tauri 2** (Rust) |
| ⚛️ 前端框架 | **React 19** + **TypeScript** |
| 🎨 UI 组件 | **shadcn/ui** + **Tailwind CSS** |
| ⚡ 构建工具 | **Vite** |
| 🔌 核心插件 | `tauri-plugin-store` (持久化)、`tauri-plugin-dialog` (文件选择)、`tauri-plugin-log` |

## ✨ 主要功能

- 🔍 **深度扫描** — 内置 20+ 条清理规则，覆盖系统缓存、浏览器缓存、微信/QQ/WPS 等应用垃圾
- ⚡ **一键清理** — 流式清理 + 实时进度反馈，支持移入回收站（可恢复）
- 📋 **规则管理** — 内置规则勾选启用/禁用，按风险等级排序
- ✏️ **自定义规则** — 支持用户新增扫描路径、匹配模式、风险标签、清理类型
- 📂 **文件夹选择** — 集成系统原生文件夹选择器，避免手动输入路径错误
- 🎨 **主题切换** — 支持亮色/暗色/科技蓝主题
- 📊 **累计统计** — 持久化记录累计清理次数与释放空间

## 📦 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm tauri dev

# 构建生产版本
pnpm tauri build
```

## 📁 项目结构

```
cleanmywin-tauri-app/
├── src/                    # 前端源码
│   ├── components/         # 通用组件 (UI / MainContent / Sidebar / scan)
│   ├── pages/              # 页面 (Home / Cleanup / Scan / Custom / Settings)
│   ├── hooks/              # 自定义 Hooks (useScanRules)
│   ├── lib/                # 工具函数 (format)
│   ├── types/              # TypeScript 类型定义
│   └── styles/             # 全局样式
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── rules/          # 规则引擎 (types / loader)
│   │   ├── scanner/        # 扫描器 (engine)
│   │   └── lib.rs          # 命令注册
│   ├── capabilities/       # Tauri 权限配置
│   └── icons/              # 应用图标资源
├── public/                 # 静态资源 (base_rules.json / lottie)
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 📄 License

MIT
