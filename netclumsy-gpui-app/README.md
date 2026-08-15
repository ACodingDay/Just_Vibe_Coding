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
- 📋 **过滤器预设** — exe 同目录 config.txt 加载（原版格式，随包附带 WSL2 8012 双向 / 上行 / 下行 / 排除回环等示例），支持手动过滤表达式
- 🖥️ **参数化启动** — 兼容原版 clumsy 命令行参数，另支持 --filter / --timeout / --capture / --help
- 📊 **实时统计** — 包速率与匹配计数实时显示，方向开关（Inbound / Outbound）与原版一致

## ⚠️ 注意事项

1. **必须以管理员权限运行** — WinDivert 内核驱动需要提权
2. **回环包只在 outbound 方向可见** — WinDivert 固有限制，行为与原版一致
3. **Throttle ≠ 持续限速** — 模拟持续低带宽请用 Bandwidth
4. **Duplicate / Out of order 对 TCP 意义不大** — TCP 协议自动去重与重排，这两个效果主要针对 UDP

## 🚀 开发

```bash
# 构建依赖环境变量
$env:WINDIVERT_PATH = "C:\path\to\windivert"   # 需包含 DLL / LIB / SYS

# 运行
cargo run

# 命令行参数（兼容原版 clumsy，带参数启动自动开始过滤）
cargo run -- --lag on --lag-time 200 --filter "tcp and tcp.DstPort == 8012"
cargo run -- --drop on --drop-chance 20 --timeout 60
cargo run -- --capture on --filter "udp"
cargo run -- --help

# 过滤器预设：把 etc/config.txt 复制到 exe 同目录（如 target/debug/）后启动生效；
# 缺失时回退 1 条 loopback 预设（与原版行为一致）

# 打包发布（组装 dist/netclumsy-<版本>.zip：exe + WinDivert + config.txt + 许可证文本）
.\script\package.ps1
```

## 📁 项目结构

```
netclumsy-gpui-app/
├── src/                    # 应用源码
│   ├── main.rs             # 入口（CLI 解析 → 提权 → GPUI 初始化）
│   ├── args.rs             # 命令行参数（兼容原版 parseArgs）
│   ├── presets.rs          # config.txt 预设加载（原版格式）
│   ├── elevate.rs          # 管理员提权（重启时透传命令行参数）
│   ├── engine/             # 包处理引擎（windivert）
│   │   ├── mod.rs          # 引擎生命周期 + 双线程 + consume 管线
│   │   ├── send.rs         # 包回注（send_all + ICMP workaround）
│   │   ├── stats.rs        # CRateStats 滑动窗口速率统计
│   │   ├── config.rs       # Arc<Atomic> 共享配置
│   │   ├── ffi.rs          # windivert-sys FFI 封装
│   │   ├── packet.rs       # 包数据类型
│   │   └── effects/        # 8 个效果模块（lag / drop / throttle / ...）
│   └── ui/                 # GPUI 界面组件
│       ├── main_window.rs  # 主窗口布局 + 状态轮询
│       └── effect_panel.rs # 效果行组件
├── etc/config.txt          # 随包分发的预设示例
├── script/                 # package.ps1 打包 + 第三方声明
├── locales/                # i18n 文案（zh-CN / en）
├── docs/                   # 使用备忘与设计文档
├── windivert/              # WinDivert DLL / LIB / SYS（官方签名）
├── Cargo.toml
└── README.md
```

## 📄 License

本项目遵循根仓库的 MIT License（见 [LICENSE](../LICENSE)）。重写时保留了 [jagt/clumsy](https://github.com/jagt/clumsy) 的版权声明：**Copyright (c) 2013-2023 Chen Tao and contributors**。WinDivert 采用 LGPLv3 动态链接分发。
