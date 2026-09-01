# NetClumsy 主窗口界面设计规范

> 版本：v1.1（2026-09-01）
> 适用：`netclumsy` Rust + GPUI 桌面应用（Windows）
> 配套交付物：`index.html`（高保真交互稿）、`design-plan.json`（设计计划）、`netclumsy-main-window-dark.png` / `netclumsy-main-window-light.png`（画布截图）
>
> **优先级约定（v1.1）**：GPUI Component 官方《设计指南》（longbridge.github.io/gpui-component/zh-CN/docs/design-guides）优先于本文。冲突处以官方指南为准：字号/间距走官方 scale 与 rem helper、语义色克制使用、状态不只靠颜色、Badge/主按钮按语义使用。本文 v1.1 已按官方指南修订（标注 v1.1 的条目）。

## 一、背景与目标

NetClumsy 是 clumsy（MIT）的 Rust + GPUI 重写，基于 WinDivert 驱动对匹配的网络包做劣化（延迟、丢包、节流、限带宽、重复、乱序、篡改、TCP RST 断连），用于开发者/QA 做网络容错调试。

本设计的目标：

1. 在一个窗口内完整承载「过滤器选择 → 捕获验证 → 启动劣化 → 实时观察」的核心工作流，与引擎现有能力（8 效果、Capture/Start/Stop、包速率/匹配计数、触发指示灯）一一对应。
2. 视觉走深色专业开发工具风，信息密度较高但不拥挤；所有文案取自 `locales/ui.yml`，不引入新造词。
3. 为后续新增页面预留导航位（顶部 Tabs），当前只有「劣化」一个页面。
4. 每个界面区块都能直接映射到 gpui-component 组件，降低实现偏差。

## 二、窗口与总体布局

窗口默认尺寸 **920 × 720**（画布 940 × 744，四周各留 10px 桌面背景展示窗口投影）。尺寸可以按内容密度整体微调，不必拘泥固定像素；高度预算按下表分配，纵向空间不足时优先压缩 Tab 栏提示文字或统计区高度，而不是压缩效果行。

```
┌────────────────────────────────────────────────┐ 920px
│ TitleBar（标题栏）                        40px  │
│ Tabs（页签栏）                            36px  │
│ FilterBar（过滤器 + 控制区）              ~97px │
│ EffectList（8 × 效果行，每行 52px）      416px  │
│ StatsBar（状态 + 速率曲线 + 计数）        84px  │
└────────────────────────────────────────────────┘ 720px
```

布局原则：

- 单列纵向流，五个区块自上而下；区块之间用 1px 分隔线（`color-mix(in srgb, var(--seed-fg) 8%, transparent)`）+ 背景色差异区分层级。
- 效果行是信息密度主体：固定行高 52px，内容左右两端对齐，行内不换行；窗口变窄时参数区压缩而不是换行。
- 整窗内容区左右内边距 16px；区块内元素垂直居中。

## 三、分区详细规范

### 3.1 TitleBar 标题栏（40px）

- 左侧：应用 logo（内联 SVG 圆角方形 + 波形线）+ 「NetClumsy」品牌名（14px / text_sm，600 字重）。
- **v1.1**：运行状态不再在标题栏展示（原「运行中」Badge 删除）。运行状态统一由统计栏的状态行承载（状态点 + 状态文案，信息更完整），避免同一状态在标题栏 / 过滤区 / 统计栏三处重复强调。
- 右侧：窗口控制按钮（最小化/最大化/关闭），关闭按钮 hover 用 danger 色。GPUI 侧用系统窗口按钮或 `TitleBar` 自带窗口控制。
- 背景：`--seed-surface`；底部 1px 分隔线。可整条区域拖拽移动窗口。

### 3.2 Tabs 页签栏（36px）

- 左侧：分段式 Tabs，当前只有「劣化」一个激活页签。激活态：底色 `--seed-surface-2` + 主色文字 + 顶部 2px 主色指示条；未激活：muted 文字。
- 右侧：效果链顺序提示文字 `Lag → Drop → Throttle → Duplicate → OOD → Tamper → Reset → Bandwidth`（11px，muted，等宽字体），说明引擎固定处理顺序——这是调试者关心的信息，保留可见。
- 导航决策：**当前选 Tabs 不选 Sidebar**。理由：只有一个页面，效果行需要完整横向空间，Tabs 只多占 36px 纵向高度；Sidebar 会吃掉约 48–200px 横向空间，对高密度参数行不友好。**复核阈值：页面数超过 4–5 个或出现导航层级（分组/设置树）时，改用 `Sidebar`。**

### 3.3 FilterBar 过滤器与控制区（~97px）

两行结构，背景 `--seed-bg`：

第一行（过滤器，高 ~40px）：

- 「过滤器」标签（12px，muted）+ 过滤器输入框（flex 占满剩余宽度，等宽字体 12px，高 32px，圆角 `--seed-radius`）。
- 运行中时输入框锁定（引擎启动后过滤条件不可改，用 read-only 而非 disabled，与禁用行区分），右侧内嵌「引擎运行中」锁定标签；就绪/停止状态可编辑。
- 校验失败时在输入框下方显示红色错误文案（对应 `status.filter_syntax_error` / `status.filter_invalid`）。

第二行（控制行，高 ~40px）：

- 预设 Select（宽 224px（`w_56`），标签「预设」），内容来自 `config.txt`（`wsl2 ws 8012 both / uplink / downlink / no-loopback` 等），选中后回填过滤器输入框。
- 发送状态灯（三态，见 §6.3；**v1.1**：灯带 tooltip 文字，状态不只靠颜色表达）+ 「捕获」按钮（**v1.1**：outline 变体，运行中仅 disabled，不随状态切换变体）+ 「启动」按钮（主按钮，主色填充）/「停止」按钮（运行时替换启动按钮，danger）。
- **v1.1**：启动 / 捕获 / 停止注册全局快捷键（F5 / F6 / Shift+F5），按钮 tooltip 自动展示快捷键（`Button::tooltip_with_action`）。
- 右侧：管理员状态章（**v1.1**：用 gpui-component `Tag` 组件，不再手绘 chip）：未提权 / 引擎失败 → danger；管理员 + 运行中 → success；管理员 + 就绪 → **中性 secondary**（就绪不是警告，warning 留给真实告警）。

### 3.4 EffectList 效果列表（8 行 × 52px）

每行结构（左 → 右；**v1.1** 修订列顺序与栅格）：

| 元素 | 规格 |
|---|---|
| 触发指示灯 LED | 10px 圆点；三态：灰（未触发）/绿（近 200ms 轮询窗口内触发）/红（发送异常关联）；带 2px 柔光（同色 35% 透明外圈）；**v1.1**：灯带 tooltip 说明状态（状态不只靠颜色） |
| 效果开关 Switch + 名称 | Switch 开启 = 主色；名称**单行居中**（14px / text_sm / 500，v1.1 取消英文双行副题——i18n 下效果 key 本身即英文名） |
| 方向复选框 | 「入站」「出站」Checkbox，**紧跟名称列**（前面的元素全部定宽，因此每行落位相同，形成稳定 lane） |
| 弹性留白 | `flex_1` 吸收剩余宽度 |
| 附加选项 + 参数区 | 附加选项（Checkbox / 按钮）在前，参数组（标签 + 输入框）右对齐收口；**「概率」输入框在所有行共享最右 lane**（可比较数字对齐），输入框统一 64px（`w_16`），标签紧贴自己的输入框 |

行状态：

- 启用行：正常前景色，控件可交互。
- 禁用行（Switch off）：整行 `.is-off`——文字与控件降至 muted 40–55% 不透明度，输入框只读感；Switch 仍可点击（这是唯一的行内主操作）。
- 行 hover：背景 `color-mix(in srgb, var(--seed-fg) 4%, transparent)`；行间 1px 分隔线。
- **v1.1**：行高 52px 以 `rems(3.25)` 表达（随基础字号缩放），名称列 92px 以 `rems(5.75)` 表达；其余尺寸走 Tailwind 系 rem helper。

八个效果的控件矩阵（参数范围与引擎一致，来自 `docs/TODO.md` 与 C 原版）：

| 效果 | 名称（zh/en） | 参数控件 | 范围 / 默认 |
|---|---|---|---|
| lag | 延迟 / Lag | 延迟 (ms) | 0–15000，默认 50 |
| drop | 丢包 / Drop | 概率 (%) | 0–100，显示一位小数 |
| throttle | 节流 / Throttle | 触发概率 (%) + 时间窗 (ms) + 丢弃节流包 Checkbox | 概率 0–100；时间窗 0–1000，默认 30 |
| duplicate | 重复 / Duplicate | 份数 + 概率 (%) | 份数 2–50，默认 2 |
| ood | 乱序 / Out of order | 概率 (%) | 0–100 |
| tamper | 篡改 / Tamper | 概率 (%) + 重算校验和 Checkbox | 0–100；勾选后损坏数据才到达应用层 |
| reset | 断连 / Set TCP RST | 概率 (%) + 「RST 下一包」小按钮 | 0–100；按钮点击 `set_next_count += 1` |
| bandwidth | 限带宽 / Bandwidth | 上限 (KB/s) | 0–99999，默认 10 |

实现语义对齐（来自 `docs/Clumsy_readme.md`）：

- 概率在引擎内按万分比存储（×100），UI 显示百分比；空/非法输入按 0 处理且不回写文本；越界输入钳位后回写文本。
- Throttle 不是持续限速；「限带宽」才是持续低带宽模拟——两条 tooltip 文案建议保留此提示。
- Duplicate/OOD 对 TCP 意义有限，可在 tooltip 注明「主要适合 UDP 场景」。

### 3.5 StatsBar 统计栏（84px）

背景 `--seed-surface`，顶部 1px 分隔线。三段式（**v1.1**：整体高度 5.25rem，曲线区 224×36，字号对齐官方 scale）：

- 左：状态文案（14px / text_sm）——当前为运行中的 `status.started`（「已启动过滤，启用效果后实时生效。」，accent 绿）；其下 12px muted 辅助行（过滤条件摘要）。错误状态切换为 danger 红。
- 中：迷你速率曲线（Sparkline，224 × 36）。SVG 折线 + 渐变面积填充（accent 绿），右上角文字锚点显示当前速率值，左上角「近 30 秒」窗口标注（均 12px）。数据源：UI 200ms 轮询 `rate_pps`，本地维护 30 秒环形缓冲。
- 右：两个读数——「包速率 1,284 包/秒」（数字 18px / text_lg / 600 等宽，对应 `window.stats.rate.format`）与分隔线后「匹配包 12,958」（对应 `status.matched.format`），标签 12px muted。

## 四、色彩系统（Seed Token）

本设计交付**两套完整主题**：**深色主题为默认**（专业开发工具定位，长时间调试不刺眼），**浅色主题为备选**（明亮环境/投影仪场景）。两套主题的预览截图：

- 深色默认主题 → `netclumsy-main-window-dark.png`
- 浅色备选主题 → `netclumsy-main-window-light.png`

所有颜色从 seed token 派生（`var()` + `color-mix()`），主题切换只改 seed，不改组件样式。切换机制：设计稿中 `<html>` 的 `data-theme` 属性（`dark` / `light`），`:root[data-theme="light"]` 覆写同一组 seed token；GPUI 实现时对应注册两套 Theme token（见 §八.6），组件不写死任何颜色。

### 4.1 深色主题（默认，`data-theme="dark"`）

| Token | 值 | 用途 |
|---|---|---|
| `--seed-bg` | `#0B0E14` | 窗口内容底色 |
| `--seed-fg` | `#E6E9EF` | 主文字 |
| `--seed-muted` | `#8A93A6` | 次级文字/标签 |
| `--seed-primary` | `#4C8DFF` | 主操作、Switch 开、Tabs 激活、焦点环 |
| `--seed-accent` | `#3ECF8E` | 成功/运行中、速率曲线、触发 LED 绿 |
| `--seed-danger` | `#F0564A` | 停止按钮、错误、触发 LED 红 |
| `--seed-warning` | `#E8A33D` | 管理员权限 Badge |
| `--seed-radius` | `8px` | 基础圆角（输入框 6px、窗口 12px 按比例派生） |
| `--seed-surface` | `#11151E` | 标题栏/统计栏背景 |
| `--seed-surface-2` | `#171C27` | Tabs 激活底、hover、输入框底 |

派生示例：桌面背景 `color-mix(in srgb, var(--seed-bg) 62%, black)`；分隔线/边框 `color-mix(in srgb, var(--seed-fg) 8%, transparent)`；Badge 浅底 `color-mix(in srgb, <语义色> 12%, transparent)`。

### 4.2 浅色主题（备选，`data-theme="light"`）

浅色主题复用同一套布局与组件样式，仅覆写 seed token（饱和度整体下调、对比度按 AA 校准）：

| Token | 值 |
|---|---|
| `--seed-bg` | `#F5F6F8` |
| `--seed-fg` | `#171B23` |
| `--seed-muted` | `#5C6577` |
| `--seed-primary` | `#2F6FE4` |
| `--seed-accent` | `#189E66` |
| `--seed-danger` | `#D5484A` |
| `--seed-warning` | `#B87A1E` |
| `--seed-surface` | `#FFFFFF` |
| `--seed-surface-2` | `#ECEEF2` |

GPUI 侧对应 Theme 的 dark/light 两套 token 注册，组件不写死颜色。

## 五、字体与间距

- 字体栈：系统 UI 字体（Windows 上为 Segoe UI Variable / Microsoft YaHei UI 回退）；数字、过滤表达式、效果链顺序用等宽栈（Cascadia Mono / Consolas 回退）。
- **v1.1 字号体系（对齐官方设计指南 scale：12/14/16/18/20）**：18px（`text_lg`，大读数）/ 14px（`text_sm`，正文、按钮、主标题）/ 12px（`text_xs`，标签、输入、辅助、Badge）。取消自定的 11px / 13px 档位。最多 3 个字重：400 / 500 / 600。
- **v1.1 尺寸表达（官方指南：application layout 不得直接调用 `px(...)`）**：尺寸一律走 rem-based helper（`w_16`、`h_9`、`text_sm` 等）或 `rems(...)`；px 仅保留真实物理边界——1px hairline、窗口默认尺寸、指示灯圆点等经过审查的例外。
- 间距基数 4px：区块左右内边距 16px，行内元素间隙 8/12px，效果行内容左右边距 16px。
- 圆角：统一取自主题 `radius`（6px），不写死；Switch 全圆用 `rounded_full`。
- 焦点可见：键盘焦点统一主题 ring 色（`--seed-primary`）外环，对比度满足 WCAG AA（正文 ≥ 4.5:1，深色主题已校验）。
- **v1.1 键盘路径**：启动 F5 / 捕获 F6 / 停止 Shift+F5（`actions!` + `bind_keys`，根容器 `on_action` 接住）；按钮 tooltip 自动展示快捷键。

## 六、状态矩阵

### 6.1 引擎状态

| 状态 | 过滤器输入 | 捕获按钮 | 启动/停止 | 状态文案 |
|---|---|---|---|---|
| 就绪 idle | 可编辑 | 可用 | 显示「启动」（主色） | `status.idle` |
| 捕获中 capture | 锁定 | 激活态 | 显示「停止」 | 嗅探计数增长 |
| 运行中 running | 锁定 + 「引擎运行中」标签 | 禁用 | 显示「停止」（danger） | `status.started`（accent） |
| 已停止 stopped | 可编辑 | 可用 | 显示「启动」 | `status.stopped` |
| 出错 error | 可编辑 | 可用 | 显示「启动」 | 错误文案（danger，如 `status.start_failed.format` / `status.open_device_failed.format`） |

### 6.2 效果行状态

Switch off → 整行降透明度、参数只读；Switch on → 可交互；触发灯由 `triggered_mask` 200ms 轮询驱动（灰 → 绿闪 → 回落）。

### 6.3 发送状态灯（三态，对齐 C 原版 sendState）

| 状态 | 颜色 | 含义 |
|---|---|---|
| 正常发送 | accent 绿 | 回注正常 |
| 发送异常 | danger 红 | 发送失败（含 ICMP workaround 场景） |
| 未运行 | 灰 | 引擎未启动 |

## 七、gpui-component 组件映射

| 设计区块（`data-component`） | gpui-component | 说明 |
|---|---|---|
| `titlebar` | `TitleBar` | 品牌区 + Badge + 窗口控制；可拖拽 |
| `tabs-bar` | `Tabs` | 分段样式；右侧提示文字为普通 `div`/Label |
| `filter-bar` | `Input` + `Select` + `Button` + `Tag` + `Checkbox` | 过滤器 Input 等宽字体；运行中 `disabled`；状态章用 `Tag` 组件 |
| `effect-row` | `Switch` + `Checkbox` + `Input` + `Button` + 自定义 LED | LED 为 10px 圆点视图，按轮询值切换颜色 |
| `stats-bar` | `StatusBar`（容器）+ `Chart`/Plot（sparkline）+ Label | 速率曲线用 Chart 的 area/line 系列，30 秒窗口 |

设计稿中所有区块带 `data-component` 与 `data-od-id` 标注，`index.html` 顶部注释含完整映射表，可作为 GPUI 视图树拆分的对照。

## 八、GPUI 实现注意事项

1. **轮询模型不变**：UI 200ms 轮询 `EngineConfig` 的原子量（`triggered_mask`/`send_state`/`matched_count`/`rate_pps`），设计稿中的所有动态元素（LED、状态灯、速率曲线、计数）都由该轮询驱动，不需要新的事件通道。
2. **速率曲线缓冲在 UI 侧**：引擎只暴露当前 `rate_pps`；30 秒历史由 UI 每次轮询 push 进环形缓冲（约 150 点，200ms × 150 = 30s）。
3. **过滤器锁定语义**：引擎运行中禁止改过滤器（WinDivert 句柄已按旧过滤器打开）；「停止」后解锁。预设 Select 运行中同样禁用。
4. **文案全部走 `t!()`**：本设计出现的所有文字均已在 `locales/ui.yml` 中有对应 key（含 zh-CN/en），实现时禁止硬编码；新增 tooltip 文案（Throttle≠限速、Duplicate/OOD 适合 UDP）需补 yml key。
5. **参数输入语义**：空/非法按 0、越界钳位回写——`Input` 的 `on_change` 里复用现有 `sync_int`/`sync_chance` 钳位逻辑。
6. **主题**：GPUI Theme 注册 §4 两套 seed token；组件样式只引用 token，保证后续加高对比度等主题时零改动。
7. **导航扩展**：新增页面时往 `Tabs` 加页签即可；页面数 > 4–5 或出现层级导航时切换 `Sidebar` 方案（届时效果列表布局不变，只是窗口宽度需要相应增加）。

## 九、交付物清单

| 文件 | 说明 |
|---|---|
| `design/DESIGN.md` | 本设计规范文档 |
| `design/index.html` | 高保真交互稿（单文件，含深/浅主题 token，浏览器直接打开） |
| `design/design-plan.json` | 设计计划（brief、约束、验收标准、资源选择） |
| `design/netclumsy-main-window-dark.png` | 深色主题主窗口截图（940×744） |
| `design/netclumsy-main-window-light.png` | 浅色主题主窗口截图（940×744） |
