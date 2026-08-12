# 🌐 NetClumsy - 网络包劣化工具

基于 **[jagt/clumsy](https://github.com/jagt/clumsy)** 功能参考、使用 **Rust + GPUI** 技术栈全量重写的 Windows 网络包劣化工具（中文界面）。在真实网络环境下模拟延迟、丢包、节流、限带宽、重复、乱序、篡改、断连，用于测试应用的网络容错能力 🛠️

> 📌 本项目重写自 [jagt/clumsy](https://github.com/jagt/clumsy)（MIT License，Copyright (c) 2013-2023 Chen Tao and contributors），核心包处理能力基于 WinDivert 内核驱动，行为语义与原始版本保持一致。

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 🦀 开发语言 | **Rust** (single binary) |
| 🎨 UI 框架 | **GPUI**（Zed 的 GPU 加速原生 UI 框架） |
| 🧩 UI 组件 | **gpui-component**（60+ 跨平台组件） |
| 🔌 核心依赖 | **windivert** crate + 官方签名 WinDivert 驱动 |

## ✨ 主要功能

- 🐢 **Lag 延迟** — 按设定毫秒数押后放行匹配的包
- 🚫 **Drop 丢包** — 按概率丢弃匹配的包
- 🌊 **Throttle 节流** — 随机触发"节流时段"模拟突发拥塞 / 粘包
- 📉 **Bandwidth 限带宽** — 滑动窗口统计，超限包直接丢弃
- 🔁 **Duplicate 重复** — 按概率把包复制成 N 份（主要针对 UDP）
- 🔀 **Out of order 乱序** — 按概率交换 / 押后相邻包（主要针对 UDP）
- 🔧 **Tamper 篡改** — 按概率 XOR 破坏 payload，可开关 Redo Checksum
- 💥 **Set TCP RST 断连** — 强制置 RST 标志直接掐断连接
- 🌐 **中文界面** — 界面与效果参数全汉化（替代原版硬编码英文）
- 📋 **过滤器预设** — 内置 WSL2 场景预设（8012 端口双向 / 上行 / 下行 / 排除回环），支持手动过滤表达式
- 📊 **实时统计** — 包速率与匹配计数实时显示，方向开关（Inbound / Outbound）与原版一致

## ⚠️ 注意事项

1. **必须以管理员权限运行** — WinDivert 内核驱动需要提权
2. **回环包只在 outbound 方向可见** — WinDivert 固有限制，行为与原版一致
3. **Throttle ≠ 持续限速** — 模拟持续低带宽请用 Bandwidth
4. **Duplicate / Out of order 对 TCP 意义不大** — TCP 协议自动去重与重排，这两个效果主要针对 UDP

## 🚀 开发

```bash
# 环境准备（Windows 10+）
.\script\install-window.ps1   # 安装 GPUI 依赖工具链

# 构建依赖环境变量
$env:WINDIVERT_PATH = "C:\path\to\windivert"   # 需包含 DLL / LIB / SYS

# 运行
cargo run

# 构建发布版本
cargo build --release
```

## 📁 项目结构

```
netclumsy-gpui-app/
├── src/                    # 应用源码
│   ├── main.rs             # 入口（提权 manifest + GPUI 初始化）
│   ├── engine/             # 包处理引擎（windivert）
│   │   ├── filter.rs       # 过滤器解析与预设
│   │   ├── effects/        # 8 个效果模块（lag / drop / throttle / ...）
│   │   └── stats.rs        # 实时统计
│   └── ui/                 # GPUI 界面组件
│       ├── main_window.rs  # 主窗口布局
│       ├── effect_panel.rs # 效果参数面板
│       └── components/     # 通用组件
├── docs/                   # 使用备忘与设计文档
├── windivert/              # WinDivert DLL / LIB / SYS（官方签名）
├── Cargo.toml
└── README.md
```

## 📄 License

本项目遵循根仓库的 MIT License（见 [LICENSE](../LICENSE)）。重写时保留了 [jagt/clumsy](https://github.com/jagt/clumsy) 的版权声明：**Copyright (c) 2013-2023 Chen Tao and contributors**。WinDivert 采用 LGPLv3 动态链接分发。
