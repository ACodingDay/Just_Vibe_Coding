# @dsh-external/dsh-ui-grokbot

**GrokBot 表情伙伴**：DSH Web UI 会话标题栏（标题行右侧）常驻一只 GrokBot Canvas 头像，**25 种表情**随 agent 状态以阻尼弹簧 morph 实时切换——零核心改动。

| 项 | 说明 |
|----|------|
| 包名 | `@dsh-external/dsh-ui-grokbot` |
| 版本 | `0.1.0` |
| 形态 | 纯客户端 UI 插件（Node half 为空，浏览器 half 挂 `conversation.session.header.actions`） |
| 兼容 | 基于 DSH `0.1.0-rc.5` 检出开发（`dsh.client` 嵌套元数据 + `@deepseek-ai/cordis` 新形态） |
| 运行时依赖 | 平台提供：`react`、`@deepseek-ai/cordis`（peer 声明）；构建产物零第三方运行时导入 |

## 行为

- **空闲**：按 `idle` 表情池（expression 0/8）随机换表情（9–16 s）、随机眨眼（6–14 s）。
- **思考中**：会话快照出现 reasoning block → `thinking` 池（8/16/14/17/5），2–3.6 s 换一次表情，眨眼更频繁。
- **工具运行中**：`runningCalls` 非空 → `working` 池（7/16/11/10），尾巴持续摆动式的持续表情切换。
- **回合输出中**：turn 活跃但无 reasoning 无工具 → `writing` 池（15/9）。
- **回合完成**：running true→false 边沿 → `celebrate` 池（2/8/17）庆祝 2.6 s。
- **连续空闲 10 s**：入睡 → `sleeping` 池（13/22/4），不眨眼；任何活动立即唤醒。
- **点击**：转一整圈（1200 ms easeInOutCubic，可打断）；**沉睡中点击会先唤醒**——闭眼表情弹簧切换到中性表情，同时开转。
- **悬停**：视线（gaze）跟随指针；离开后缓动回中。
- **主题跟随**：深色 GUI 用经典蓝身米白眼（GrokBot 原版浅色预设）；浅色 GUI 自动切换为**黑白单色**（黑身白眼），跟随界面主题实时切换。
- **尺寸自适应**：随界面基准字号缩放（默认 16px 字号下 50px）；≤640px 视口（手机）自动缩为 36px 档。
- 表情切换是 **48 点双眼环的临界阻尼弹簧插值**（ω=7，1/120 s 子步），与 GrokBot 原版完全一致；转头时眼睛做球面投影，转过大角度会"转到脑后"隐藏。

## 架构

```
src/
├── index.ts                 # Node half：空 apply（Loader 占位）
├── invariant.ts             # invariant 伴生（无宿主状态，注册空安装器）
└── client/
    ├── index.ts             # 浏览器 half：注册 locale + header slot
    ├── GrokBotPet.tsx       # React 组件：rAF 循环 + Canvas
    ├── animation.ts         # 纯函数动画引擎（mood→状态→表情池→弹簧/眨眼/庆祝/入睡/转圈）
    ├── render.ts            # Canvas painter（grokbot_painter.dart 的忠实移植）
    ├── geometry.ts          # 球面投影 / 圆角路径 / 视线映射
    ├── locales.ts           # zh/en 字典（命名空间 grokbot）
    ├── GrokBotPet.module.css
    └── data/
        ├── expressions.ts   # 25 表情 × 双眼 48 点（脚本生成，见下）
        ├── states.ts        # 39 状态 → 表情池 + 节奏
        ├── shapes.ts        # 18 形态参数
        └── models.ts        # 枚举常量
```

- 动画引擎是**纯函数**（`advance(state, dtMs, input, rng)`），组件只喂时间与 mood；全部时序决策可单测（`tests/animation.spec.ts`）。
- 数据移植自 [nasawz/GrokBot](https://github.com/nasawz/GrokBot)（Flutter，BSD-3-Clause）：
  - `expression_data.dart` → `scripts/port-expressions.mjs` 机械转换生成 `src/client/data/expressions.ts`（`pnpm port` 重新生成）；
  - `state_data.dart` / `shape_data.dart` / `models.dart` / `geometry.dart` / `grokbot_painter.dart` 手移植。
- 客户端 bundle 通过 tsdown 生成 `window.__ModuleLoader__.load({ id, factory })` 闭包工厂，外部依赖从 shell 冻结模块表解析；构建期 purity 门禁禁止任何非平台模块的 `@deepseek-ai/*` 值导入。

## 开发

```sh
pnpm install    # 注册表依赖；DSH 类型通过 tsconfig paths 指向本机检出
pnpm build      # tsdown → lib/{index,invariant,client}.js + demo/dist/demo.js
pnpm typecheck  # tsc（类型面经 tsconfig paths 指向 DSH 检出的 lib/types）
pnpm test       # vitest（数据/几何/动画/插件注册）
pnpm port       # 重新从 GrokBot 的 expression_data.dart 生成表情数据
```

- 类型与单测通过 `tsconfig.json` / `tsconfig.vitest.json` 的 `paths` 指向本机 DSH 检出（`../../deepseek-harness-master/...`）；若你的检出路径不同，改这两个文件即可，不影响构建产物。
- `demo/index.html`：浏览器直接打开即可查看 25 种表情与完整动画（先 `pnpm build`）。形态、主题、辅助线、视线、转圈全部可交互。

## 安装

见 [INSTALL.md](INSTALL.md)：`dsh plugin --profile web add link:<本目录绝对路径>` + `cordis.patch.yml` 插入一行，重启/热重载后标题栏即出现 GrokBot。

## Model Experience

无——纯浏览器端 UI 呈现：不进入模型请求、不增加提示词内容、不改任何工具 schema。

## License

MIT（本插件）。表情/形态/状态数据与渲染数学移植自 [nasawz/GrokBot](https://github.com/nasawz/GrokBot)（BSD-3-Clause），版权归原作者 nasawz。
