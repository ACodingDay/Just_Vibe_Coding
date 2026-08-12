# NetClumsy 开发 TODO

> 状态：脚手架完成，引擎与 UI 待实现。本文档记录分析结论与任务清单。

## 一、已完成 ✅

| 项 | 说明 |
|---|---|
| 项目初始化 | Cargo 项目 `netclumsy`（edition 2024），仅 Windows |
| 依赖锁定 | gpui 0.2.2 / gpui-component 0.5.1（crates.io，**无需 git 拉 zed 仓库**）/ windivert 0.6.0 / rust-i18n 4.2 / anyhow / rust-embed / windows 0.48 |
| 编译验证 | `cargo check` 通过（需 `WINDIVERT_PATH` 指向 windivert 目录） |
| WinDivert 资源 | `windivert/WinDivert-2.2.2-A/`（官方 DLL/LIB/SYS，LGPLv3 动态链接） |
| i18n | `locales/ui.yml`（zh-CN/en），启动时 `set_locale("zh-CN")`；组件自带 zh-CN 翻译（40 key），应用文案走 `t!()` |
| 管理员提权 | `src/elevate.rs`：运行时检测 + ShellExecute("runas") 重启（照搬 clumsy 原版 elevate.c；绕开 gpui manifest 资源冲突） |
| 图标 | 99 个 Lucide SVG 已下载至 `assets/icons/`，rust-embed 嵌入（`src/assets.rs`） |

## 二、clumsy 源码架构分析（参考 `C:\Users\yyt0111\Downloads\clumsy-master\src`）

### 2.1 引擎结构（divert.c + packet.c + main.c）

- **单条双向链表**（head/tail）承载所有待处理/待发送包；`PacketNode{packet, packetLen, addr, timestamp}`
- **两个线程**：
  - `divertReadLoop`：`WinDivertRecv` → 加锁 appendNode → `divertConsumeStep()`
  - `divertClockLoop`：每 40ms 加锁 → `divertConsumeStep()`（保证 lag/throttle 缓冲按时发送）
- **consumeStep**：按固定顺序跑 8 个模块的 `process()`，然后 `sendAllListPackets()` 把链表剩余包全部 `WinDivertSend` 回去
- 模块有 `enabledFlag`（volatile short，UI 线程写，引擎线程读）、`startUp/closeDown`（启用/禁用切换时调用）、`process(head, tail)`（返回是否触发，用于 UI 指示灯）
- **固定处理顺序**：`lag → drop → throttle → dup → ood → tamper → reset → bandwidth`（main.c 数组顺序）

### 2.2 8 个效果要点（各 ~50-150 行逻辑）

| 模块 | 文件 | 核心逻辑 |
|---|---|---|
| **Lag** | lag.c | 匹配方向包入私有缓冲（bufHead/bufTail），`timeGetTime` 时间戳；超时（>lagTime ms）放回主链表；缓冲上限 KEEP_AT_MOST=2000，满时 flush 800 个。默认 50ms，范围 0-15000 |
| **Drop** | drop.c | 遍历链表，匹配方向 + `calcChance(chance)`（rand%10000 < chance，10000=必丢）→ freeNode 丢弃 |
| **Throttle** | throttle.c | 无节流进行中时：若链表非空且 chance 命中 → 开始节流时段（throttleStartTick=now）；时段内匹配包入缓冲（上限 1000）；`currentTick - startTick > throttleFrame` 时清空缓冲 → 全部放回主链表（**或** dropThrottled 时全部丢弃）。默认 30ms，范围 0-1000 |
| **Duplicate** | duplicate.c | 匹配 + chance → 复制 count-1 份插在包前（insertBefore）。count 2-50，默认 2 |
| **OOD** | ood.c | 单包时：匹配 + chance → 抽出 oodPacket 暂存，下次 process 时放回主链表头部（最多等 KEEP_TURNS_MAX=10 步）；多包时：chance 命中则相邻方向匹配包两两 swapNode。注意：暂存期间不再取新包 |
| **Tamper** | tamper.c | 匹配 + chance → `WinDivertHelperParsePacket` 取 payload；len<=4 全改，否则改中间 1/4（`data[len/2-len/4/2+1 .. len/4]`）；XOR 8 字节循环 patterns（0x64,0x13,0x88,0x40,0x1F,0xA0,0xAA,0x55）；`doChecksum` 时 `CalcChecksums` |
| **Reset** | reset.c | 匹配方向 + (`setNextCount>0` || chance) → 解析 TCP 头置 `Rst=1` + `CalcChecksums`；"RST next packet" 按钮 InterlockedIncrement setNextCount。包长须 > IP+TCP 头 |
| **Bandwidth** | bandwidth.c | CRateStats 滑动窗口（window=1000ms，scale=1000）；每包 `rate = calculate(); if (rate + size > limit*1024) 丢弃 else update()`；limit 0-99999 KB/s 默认 10 |

### 2.3 共享逻辑（utils.c / common.h）

- `calcChance(chance)`：`(chance==10000) || (rand()%10000 < chance)` —— Rust 用 `rand` crate 等价实现
- `checkDirection(outbound, in, out)`：`(in && !outbound) || (out && outbound)`
- 参数同步：UI 控件直接写 volatile short/int（`InterlockedExchange`）→ 引擎线程无锁读取。**Rust 方案：`Arc<AtomicU16/U32/Bool>` 共享配置**，引擎线程读快照
- `startTimePeriod(4ms)`：timeBeginPeriod 提升定时器分辨率（lag/throttle 用 timeGetTime）
- 回环包限制：仅 outbound 方向可见（WinDivert 固有限制，继承）

## 三、Rust 引擎设计（方案 B：全量重写）

### 3.1 模块划分

```
src/engine/
├── mod.rs          # Engine 主结构：start/stop、两线程（recv + clock）、consume step
├── packet.rs       # Packet{data: Vec<u8>, addr: WinDivertAddress, timestamp}（已建）
├── config.rs       # Arc 共享配置：每效果 enabled/inbound/outbound/参数（Atomic）
└── effects/
    ├── mod.rs      # 共享工具：check_direction / calc_chance（已建）
    ├── lag.rs / drop.rs / throttle.rs / duplicate.rs / ood.rs
    ├── tamper.rs / reset.rs / bandwidth.rs
```

- **线程模型**：沿用 C 版双线程（recv 阻塞线程 + 40ms clock 线程），队列用 `Mutex<VecDeque<Packet>>`；停启时用 AtomicBool 控制 + `WinDivert::close` 中断 recv（windivert 0.6.0 的 `WinDivertRecvError` 含 handle 关闭错误）
- **winDivert API 要点**（windivert 0.6.0，已核实）：
  - `WinDivert::network(filter, priority=0, WinDivertFlags::new())`
  - `recv(&mut [u8])` → `WinDivertPacket{address: WinDivertAddress<NetworkLayer>, data: Cow<[u8]>}`，地址字段 `outbound()/loopback()` 等
  - `send(&packet)` 回注；`set_param(QueueLength=2048, QueueTime=1024)` 沿用原版
  - 校验和：`packet.recalculate_checksums(ChecksumFlags::new())`（tamper/reset 用；内部走 `WinDivertHelperCalcChecksums`）
  - payload 解析（tamper 需要）：sys 层有 `WinDivertHelperParsePacket`（FFI）—— 包 `data` 需 owned 后取可变指针；或直接用 etherparse（windivert 0.6.0 内部依赖，recv_ex 用过）解析 IPv4/IPv6/TCP/UDP 头
- **配置传递**：UI 线程写 `Arc<EffectConfig>`（每字段 AtomicU16/U32/Bool），引擎线程每个 consume step 读快照；`RST next packet` 用 `AtomicU16` 计数

### 3.2 待决策小项

- [ ] 非 TCP/UDP 包（ICMP 等）在 tamper/reset 中的处理 —— 对齐 C 版：解析失败直接跳过
- [ ] `sendState`（发送失败指示灯）与 `processTriggered`（模块触发指示灯）需要从引擎回传 UI —— 方案：`Arc<AtomicU16>` 位掩码 + UI 定时轮询，或 mpsc 事件通道
- [ ] 统计显示（包速率/匹配数）—— 引擎原子计数，UI 每秒读取

## 四、实施顺序（后续任务）

- [ ] **P0 引擎骨架**：engine/mod.rs（start/stop/consume）+ config.rs + 双线程 + 空跑（recv→send 原样回注）
- [ ] **P0 效果模块**：按顺序逐个移植 8 个效果（drop → lag → throttle → duplicate → ood → tamper → reset → bandwidth），每个配 i18n 文案
- [ ] **P0 UI 主窗口**：Filter 输入 + 预设下拉（config.txt 4 个 8012 预设迁移）+ Capture/Start 按钮 + 状态灯
- [ ] **P0 效果面板**：8 组「开关 + 方向 Inbound/Outbound + 参数输入」行，布局参考原版
- [ ] **P1 实时统计**：包速率/匹配数显示
- [ ] **P1 指示灯**：模块触发/发送状态
- [ ] **P2 config.txt 兼容**：exe 同目录加载预设（沿用原版格式 `name: value`）
- [ ] **P2 参数化启动**：`--lag on --lag-time 50` 等（原版 parseArgs 行为）
- [ ] **P2 打包发布**：release 构建 + WinDivert DLL/SYS 同目录分发

## 五、常用命令

```powershell
# 构建（每次需设置）
$env:WINDIVERT_PATH = "D:\yyt_code\github_repos\Just_Vibe_Coding\netclumsy-gpui-app\windivert\WinDivert-2.2.2-A\x64"
cargo check    # 快速检查
cargo run      # 运行（非管理员会触发 UAC 提权重启）
```
