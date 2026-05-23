# 🧹 DeskClean - 桌面文件整理助手

一款基于 **Tauri 2** 的 Windows 桌面文件可视化管理工具，在应用内对桌面文件进行分类展示与逻辑分组，让杂乱桌面一目了然 ✨

> 📌 DeskClean 不会实际移动磁盘文件，所有整理操作均在应用窗口内完成。

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 🦀 后端框架 | **Tauri 2** (Rust) |
| ⚛️ 前端框架 | **React 18** + **TypeScript** |
| 🎨 UI 组件 | **shadcn/ui** + **Tailwind CSS** |
| ⚡ 构建工具 | **Vite** |
| 🔌 核心插件 | `tauri-plugin-store` (持久化存储)、`tauri-plugin-autostart` (开机自启) |

## ✨ 主要功能

- 📂 **桌面扫描** — 自动扫描桌面文件并提取图标
- 🗂️ **智能分类** — 按文件类型自动分组（文档、图片、视频、压缩包等）
- 🖱️ **拖拽整理** — 支持拖拽文件到自定义抽屉分类
- 🎨 **中国风主题** — 6 种预设配色（科技蓝、翠青、鎏金、胭脂、莺儿、浅苋菜紫）
- 🎉 **一键整理** — 撒花动画 + 抽屉折叠，整理过程可视化
- 🌐 **国际化** — 支持 i18n 文本切换
- 🚀 **开机自启** — 可选开机自动运行

## 📦 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run tauri dev

# 构建生产版本
npm run tauri build
```

## 📁 项目结构

```
deskclean-tauri-app/
├── src/                    # 前端源码
│   ├── components/         # 通用组件 (UI / AppBar / NavCard)
│   ├── pages/              # 页面 (首页 / 整理 / 设置 / 关于 / 会员)
│   ├── hooks/              # 自定义 Hooks
│   ├── providers/          # Context Providers (主题)
│   ├── services/           # IPC 通信 & 持久化存储
│   ├── i18n/               # 国际化配置
│   └── styles/             # 全局样式
├── src-tauri/              # Rust 后端
│   ├── src/                # 核心模块
│   │   ├── desktop_icons   # 桌面图标扫描与提取
│   │   ├── file_ops        # 文件操作
│   │   ├── lnk_parse       # 快捷方式解析
│   │   ├── icon_extract    # 图标提取
│   │   ├── rules           # 分类规则引擎
│   │   └── autostart       # 开机自启
│   ├── capabilities/       # Tauri 权限配置
│   └── icons/              # 应用图标资源
├── public/                 # 静态资源
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 📄 License

MIT
