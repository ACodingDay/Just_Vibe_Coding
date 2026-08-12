# Clumsy 0.3 使用备忘

> 基于 WinDivert 的 Windows 网络包劣化工具。本文件为自用备忘，配套 `config.txt`（过滤器预设）使用。
> 界面为英文且**无法通过配置汉化**（GUI 标签硬编码在源码中，无 i18n 机制；`config.txt` 只加载过滤器预设）。

## 一、效果说明

| 效果 | 参数（单位） | 作用 | WebSocket 测试意义 |
|---|---|---|---|
| **Lag** 延迟 | `Delay(ms)` | 匹配的包在缓冲区押后 N ms 再放行 | 消息延迟、心跳超时（最直观） |
| **Drop** 丢包 | `Chance(%)` | 按概率丢弃匹配的包 | 断线重连、卡顿（最常用） |
| **Throttle** 节流 | `Chance(%)` + `Timeframe(ms)` + `Drop Throttled` | **不是持续限速**：按概率触发"节流时段"，时段内包被暂存，结束时**一起爆发发送**；勾选 `Drop Throttled` 则直接丢弃 | 模拟突发拥塞 / 粘包 |
| **Bandwidth** 限带宽 | `Limit(KB/s)`，默认 10 | 滑动窗口统计速率，超限的包直接丢弃（粗粒度丢包式限速，非平滑令牌桶） | 模拟持续低带宽 |
| **Duplicate** 重复 | `Count` + `Chance(%)` | 按概率把包复制成 Count 份 | 对 TCP 基本无感（TCP 自动去重），主要测 UDP |
| **Out of order** 乱序 | `Chance(%)` | 按概率交换 / 押后相邻包制造乱序 | 对 TCP 效果微弱（TCP 自动重排），主要测 UDP |
| **Tamper** 篡改 | `Chance(%)` + `Redo Checksum` | 按概率用固定 8 字节模式 XOR 破坏 payload（长包篡改中间约 1/4）；**不勾 `Redo Checksum` 时接收端因校验失败直接丢包**（约等于丢包），勾选后损坏数据才会到达应用层 | 测数据完整性校验逻辑（如 WS 帧解析容错） |
| **Set TCP RST** 断连 | `Chance(%)` + "RST next packet" 按钮 | 对匹配的 TCP 包强制置 RST 标志并重算校验和 → **直接掐断连接** | 模拟服务器 / 网络异常断开，测重连逻辑 |

## 二、注意点

1. **Throttle ≠ 持续限速** —— 它是"随机触发一段突发延迟/丢弃"；模拟持续低带宽请用 **Bandwidth**。
2. **Duplicate / Out of order 对 TCP 意义不大** —— TCP 协议本身负责去重和重排；WebSocket 跑在 TCP 上，这两个效果主要适合 UDP（游戏、音视频）场景。TCP 上值得关注的是：Drop / Lag / Throttle / Bandwidth / Set TCP RST / Tamper。
3. **Tamper 的 `Redo Checksum` 开关决定行为** —— 不勾 = 接收端校验失败丢弃（≈丢包）；勾 = 损坏数据到达应用层（可测应用层容错）。
4. **回环包限制** —— loopback 包只能在 `outbound` 方向被过滤（见 config.txt 注释），`inbound` 永远看不到回环包；这是 WinDivert 的固有限制，不是 bug。
5. **必须管理员权限运行** —— WinDivert 驱动需要提权。
6. **预设只在启动时加载** —— 修改 config.txt 后需重启 clumsy 才会出现在 Filter 下拉框。

## 三、WSL2 预设速查（config.txt 内已配置）

场景：浏览器 → 宿主机:8012（netsh portproxy）→ WSL2:172.18.209.204:8012

| 预设名 | 过滤表达式 | 含义 |
|---|---|---|
| `wsl2 ws 8012 both` | `tcp and (tcp.DstPort == 8012 or tcp.SrcPort == 8012)` | 双向（整条链路往返都劣化） |
| `wsl2 ws 8012 uplink` | `tcp and tcp.DstPort == 8012` | 仅上行：浏览器 → 服务器 |
| `wsl2 ws 8012 downlink` | `tcp and tcp.SrcPort == 8012` | 仅下行：服务器 → 浏览器 |
| `wsl2 ws 8012 no-loopback` | `tcp and not loopback and (tcp.DstPort == 8012 or tcp.SrcPort == 8012)` | 排除回环腿，只劣化 portproxy ↔ WSL2 的 veth 网络路径 |

注意：`outbound` ≠「浏览器请求方向」——浏览器 → 宿主机（经局域网 IP）是 **inbound**，加 `outbound` 会漏掉该段；上行直接用 `tcp.DstPort == 8012` 即可。

## 四、使用流程

1. 以**管理员身份**启动 clumsy（修改 config.txt 后需重启才生效）。
2. Filter 下拉框选择预设（或手动输入过滤表达式）。
3. 先勾 **Capture** 验证匹配：浏览器连上 WebSocket 后包计数增长，断开后停止。
4. 再勾 **Start**，拖动/输入效果参数（Drop 丢包 %、Lag 延迟 ms 等），实时生效，随时取消。

## 五、界面重写评估（Tauri 2 重写方案）— 状态：评估完成，待实现

> 目标：fork 本项目，用 Tauri 2 重写界面（汉化），不依赖老 C 代码。以下为 2026-08 核实后的结论备忘。

### 5.1 许可证结论（已核实，合规可行）

| 组件 | 许可证 | 义务与注意事项 |
|---|---|---|
| clumsy（jagt fork） | MIT，`Copyright (c) 2013-2023 Chen Tao and contributors` | 允许 fork/修改/商用；必须保留版权声明 + MIT 许可文本（新项目放 LICENSE 原文 + README 注明出处与修改点）；**新写的 UI 代码归自己** |
| WinDivert（核心依赖） | **LGPLv3 / GPLv2 双许可** | 选 **LGPLv3** 一侧：**动态链接** DLL（保持独立文件、不静态链接），随附 LGPL 许可文本，应用无需开源；**别选 GPLv2**（会传染代码） |
| WinDivert 驱动 | 同上 | 直接分发**官方签名**的 `WinDivert64.sys`（本目录已有），避免自编译驱动的签名/WHQL 问题 |
| Rust 绑定 | `windivert`（安全封装）/ `windivert-sys`（FFI） | 见 [Rubensei/windivert-rust](https://github.com/Rubensei/windivert-rust)；Windows-only；构建需 `WINDIVERT_PATH`（DLL/LIB/SYS）；运行时 `.sys` 必须与 DLL 同目录；crate 为 **pre-1.0，需锁定版本** |

### 5.2 架构结论：无独立核心可拆

- 引擎与 IUP 界面**同进程互相缠绕**：每个效果 `Module` 结构体内嵌 `setupUIFunc()`（IUP 控件创建）；main.c 的 IUP 主循环驱动包处理引擎；效果参数是 UI 控件绑定的内存值，不是独立 API。
- 因此「只换壳、C 核心原封不动」需先挖掉 IUP 再包 FFI，**改造量大于重写量**。

### 5.3 两条可行路径

| 方案 | 做法 | 评价 |
|---|---|---|
| A. 抽 C 核心 + FFI | C 核心（divert/packet/效果模块）编静态库 + 写 C API（set filter / set param / start / stop / get stats）+ Rust FFI + Tauri 2 界面 | 可行但维护 C+FFI 两层，unsafe 面大，不推荐 |
| **B. Rust 重写效果层（推荐）** | 用 `windivert` crate 读包，8 个效果各约 50–150 行逻辑（chance 判断、缓冲押后、XOR 篡改、置 RST 标志），Rust 全重写；Tauri 2 后端即引擎 | 单语言、无 FFI、架构干净；MIT 允许移植逻辑（注明出处即可） |

- 过滤本身由 WinDivert 驱动在内核完成，过滤器字符串语义完全一致——**回环包只在 outbound 可见、inbound/outbound 方向语义等行为全部继承**，无需重新实现。

### 5.4 必须保留的行为（无论哪条路径）

1. **管理员权限**：WinDivert 打开句柄即需提权——Tauri 应用用 `requireAdministrator` manifest 或启动时 UAC 提权；
2. **回环包只在 outbound 可见**（WinDivert 固有限制，见 §二.4）；
3. **过滤器语法与 config.txt 预设格式**沿用：现有 4 个 8012 预设（见 §三）可直接搬进新应用的预设机制；
4. 效果参数与方向开关（Inbound/Outbound）、实时统计（包速率/匹配计数）需在新 UI 中复刻。

### 5.5 工作量预估

脚手架 + Rust 引擎（windivert + 8 效果 + 实时统计）+ Tauri 2 中文界面（WebView2），单人业余时间约 **1–2 周**出可用版本。注意 `windivert` crate 为 pre-1.0，API 可能变动。
