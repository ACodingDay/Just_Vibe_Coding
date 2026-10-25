# 主题化扩展计划（Cloud Train Themes）

> 评估定稿于 2026-09-18。目标：在保留「向右行进的列车」主体的前提下，增加可切换的背景主题
> （云海 / 日升日落的地平线 / 有海鸥的大海）。本文档防止方案细节随时间遗忘。

## 一、结论

- 想法成立，**架构已约 70% 主题就绪**。
- 真正的成本不在工程改造，而在**每个新主题的场景 shader 内容**本身。
- 主题切换的转场直接复用现成的开场揭示动画（重编译 program + `boot()` 重播），无需另写 crossfade。

## 二、已就绪、无需改动的部分

| 模块 | 现状 |
|------|------|
| `js/renderer.js` | `program(src)` 接受任意着色器源码；双 FBO 帧间 feedback、自适应分辨率、rAF 看门狗、WebGL 上下文丢失恢复——全部主题无关 |
| 后处理 shader（SHADER_IMAGE） | 曝光/色相/色温/饱和度/暗角/开场横向揭示，通用 |
| 开场揭示 + `boot()` 重播 | 直接充当主题切换转场 |
| 设置面板机制 | 滑杆/染色行由控件表自动生成，只需换成按主题的控件表 |

## 三、必须做的工程改造（估计约一天）

1. **主题描述符（核心抽象）**
   `{ id, 名称, 场景片元着色器源码, 组装配方, 专属参数表, 默认值 }`
   关键问题：现在 `js/shader-build.js` 的染色与开场分层揭示，全部依赖对
   SHADER_ORIGINAL 做**精确字符串替换**（标记：`return vec4(0.58, 0.7, 1.0, 1.);`、
   `// loco smoke`、`#define layer(dh, v)` 等）。新主题的场景 shader 不会有这些标记，
   因此组装配方必须由每个主题自带（assemblyFn）。
2. **config 按主题拆分**
   现有 `CLOUD_TRAIN_CONTROLS` 混合了全局参数与云海专属参数
   （`amplitude`/`detail` 是通过 replace 注入云海 shader 的）。
   需拆为：全局参数（行进速度、曝光、饱和度、整体色相、色温、渲染比例、帧间拖影、
   暗角、开场三项、暂停、忽略减少动态效果）+ 主题专属参数。
   `normalizeSettings` 相应改造；localStorage 存档 key 升级 v2 并做 v1 迁移。
3. **主题切换 UI**
   面板顶部加主题选择器；切换 = 重编译 program + `boot()` 重播开场揭示。
4. **renderer 小改**
   uniform 位置列表目前硬编码（`locations(scene, [...])`），改为由主题声明的 uniform 清单。
5. **文件结构**
   新增 `js/themes/registry.js`、`js/themes/clouds.js`、`js/themes/horizon.js`、`js/themes/ocean.js`。
   注意：为保持 file:// 双击可开，继续用经典 script 按序加载，不用 ES modules。

## 四、最难的部分：列车共享块 + 场景内容

- **列车本体抽取**：车身/车轮/蒸汽目前与云海写在同一个 `mainImage` 里（`// choo choo`
  到 `// loco smoke` 段），依赖 `uv`/`t`/`col`。抽成共享 GLSL 块（`trainBlock` 函数）供所有
  主题复用。抽取时用 `tools/verify-split.js` 的逐字节对比思路兜底，确保云海主题渲染结果不变。
- **各主题难度**：
  - 云海（现成）：迁移即可。
  - **日升日落的地平线（先做）**：与云海同一范式——fbm 噪声分层 + 天空渐变 + 太阳盘 +
    颜色随时间演化；噪声、列车、揭示机制全部复用。几天级。
  - **有海鸥的大海（后做）**：海鸥容易（噪声路径上的 v 形精灵）；难点是水面——波浪法线、
    太阳/天空反射、与列车的遮挡关系，是另一套渲染范式。周期以周计；
    备选：改用 Shadertoy 上 CC 授权的海面 shader。
- 主体「向右前进」的实现方式保持不变：列车固定在屏幕上，背景层以不同速度向左流动形成相对运动。

## 五、许可风险（必须记住）

- mdb 的原始 shader **已找到 Shadertoy 出处并确认署名**：
  https://www.shadertoy.com/view/Ndc3zl —— 《up in the cloud sea》，作者
  [mdb](https://www.shadertoy.com/user/mdb)，创建于 2021-08-31，曾获 **Shader of the Week**，
  标签：cloud / parallax / art / train / colorpalette / stylised。描述："test of rendering
  different layers with parallax"。
  （2026-09-18 代码验证：与项目内 SHADER_ORIGINAL 忽略空白差异后逐行完全一致，275/275 行，
  shader-build 依赖的 11 个组装标记全部存在。）
- 作者署名已由用户在页面上人工核对确认 → shader 适用 Shadertoy 默认许可
  **CC BY-NC-SA 3.0**：允许非商用再分发与改编，需署名 mdb + 出处链接、以相同方式共享。
  这比 code-codex 项目内"未附再分发许可"的表述更明确，但**仍然禁商用**。
- 本项目首页与 README 需保留 mdb 署名及出处链接（现有注释已含，主题化后继续保留）。
- 新主题若参考/改编其他 Shadertoy 作品，同样默认 CC BY-NC-SA 3.0（禁商用、需署名）。
- 大海主题参考了 tyndall-clouds（Rust/wgpu 体积云 demo，**MIT**，ProxySudo contributors）
  的三个概念（海面云影/丁达尔光柱/银边）——仅 2D 风格化重写、未复制代码，无许可负担；
  `js/themes/ocean.js` 头注释与 README「来源与致谢」已注明。

## 六、落地顺序

> 进度（2026-09-28）：1、2、4 已完成。4（大海）先于 3（地平线）落地——前置工程（三.2 config
> 拆分、三.3 主题切换 UI、存档 v2 迁移）于 2026-09-27 一并完成，使地平线不再是阻塞项。
> 大海主题美术为《潜水员戴夫》风格平涂色带（原创 shader）；「海面云影 / 丁达尔光柱 / 银边」
> 概念参考 tyndall-clouds（MIT）并做 2D 风格化重写，另加了海排垂直预门控等性能优化。
> 2026-09-28 二次优化：太阳改为大海专属参数（太阳高度/方位 uniform，此前写死导致全局
> 「垂直位置」看似调不动太阳），低角度暖色化 + 海面碎金反光路；云朵增加形态差异、
> 个体浮动与第三排高远薄云；银边与云体共用定位函数防漂移；海面云影随太阳方位/高度
> 实时投影（背光侧偏移 + 低角度拉长淡化），不再使用写死偏移常量；云盘轮廓经 fbm
> 噪声扰动（大尺度摆动 + 小尺度缘碎，静态噪声场不随时间沸腾），云朵蓬松发散不再规整。

1. 主题描述符重构（视觉零变化；校验渲染产物逐字节一致）✅
2. 云海迁移为第一个主题 ✅
3. 地平线·日升日落（复用度最高）——未做
4. 大海·海鸥 ✅（含云影/光柱/银边与性能优化）
5. 可选：切换时旧主题画面淡出（现阶段 replay 揭示已足够）——未做

## 七、验收标准

- 切换主题不刷新页面；每个主题的专属参数可调、可单项重置、可记住、可一键重置。
- 云海主题迁移后与迁移前渲染产物逐字节一致（verify 脚本通过）。
- 存档 v1 → v2 迁移不丢用户已保存的个性化设置。
- file:// 双击打开仍然可用（无构建步骤、无 ES modules）。

## 八、性能优化计划（2026-10-25 对抗性审查）

> 两条渲染路线（根目录平滑版 / ascii-route 字符版）分开审查；纹理采样成本按
> noise()=4 次、fbm(x,8)=32 次折算。原则：**精确优化优先**（逐像素渲染结果不变），
> 有画质代价的项显式标注为取舍；「不做」清单同样记录，避免伪优化回潮。

### 8.1 原版路线（根目录 js/）

| 级别 | 项 | 位置 | 类型 | 状态 |
|---|---|---|---|---|
| P1 | 帧率上限 fpsCap：draw 入口跳帧（时间只在真实绘制帧推进），默认 30（壁纸推荐），可选 60/120/不限；页头加实测 fps 读出 | renderer.js / config.js / panel.js / main.js / index.html | 行为（7×24 常驻负载的最大功耗杠杆） | ✅ 2026-10-25 |
| P1 | 烟雾 fbm2(uv2,8) 挪进 `uv.x < 0.49` 分支：h 仅冒烟块消费，右半屏每像素省 32 次采样，结果逐位不变 | GLSL_SUBJECT_TRAIN 冒烟段（经 renderer boot 级 replace，见 8.3） | 精确 | ✅ 2026-10-25 |
| P2 | 大海 cloudMask 轮廓扰动 fbm 包络早退：扰动幅度有界 ±0.395·r·uCloudNoise，`d > r*(1+0.395*uCloudNoise)+feather` 时盘掩码恒 0，每盘 2 段 fbm（20 次采样）可跳过。现状：天空云带 ≈1800 次/像素（3 排×云体+银边×3 朵×5 盘）、海面像素云影再 +600——大海实际成本 ≈ 云海的 4–5 倍，与直觉相反 | ocean.js cloudMask / cloudRowHalo / seaShadowField | 精确 | 未做 |
| P2 | g_shadow（海面云影）只被水面像素消费，计算门 uv.y≤0.34 收紧到海排最高水面（≈0.316@uWave=2） | ocean.js background | 精确 | 未做 |
| P2 | 云海 12 排云垂直预门控：每排都有 layer(0.,…)，故 `uv.y > midlevel + 0.5·disp·amplitude` 时整排必不命中可跳过；现状天空像素跑满 12×32=384 次采样（成本倒挂：屏幕下部云海反而便宜）。前景 c13/c14 同理。大海海排已有同款先例 | clouds.js background / foreground | 精确 | 未做 |
| P3 | getContext 加 `powerPreference:'low-power'`（双显卡笔记本壁纸落核显）；可选 failIfMajorPerformanceCaveat 防 SwiftShader 慢帧 | renderer.js | 行为 | 未做 |
| P3 | 前景 5-tap 时间错位采样减为 2–3 tap（30fps 下 tap 间距 ≈0.004 uv，几乎不可感知） | GLSL_MAIN_HEAD | **取舍**（改画面，做开关不默认） | 未做 |
| P3 | uFeedback=0 时跳过反馈纹理采样；后处理 intro 死分支清理（b.intro 恒 1） | subject-train.js / renderer.js | 微 | 未做 |
| — | **不做**：ALU 哈希噪声替换纹理噪声（破坏确定性噪声/观感）、离线烘焙 fbm 纹理（破坏 uDetail 语义与插值连续性）、CPU 侧微优化（每帧 CPU 仅 uniform 推送，uniformCache/bindTexture 缓存已到位） | | | |

### 8.2 ascii-route

| 级别 | 项 | 位置 | 类型 | 状态 |
|---|---|---|---|---|
| P1 | 图集重建 key 纳入 glyphW：现仅 cell+ramp，dpr 变化（拖屏/浏览器缩放）时 rebuildAtlas(false) 跳过，字形停留旧物理尺寸发虚 | renderer.js rebuildAtlas | 正确性 bug（性能路径审出） | 未做 |
| P1 | 场景热点与原版同步：两版共享同一批拼块，fbm2 门控经两版 renderer 同一 replace 落地 | 两版 renderer.js | 精确 | ✅ 2026-10-25（fbm2） |
| P2 | 格域免许可简化：格即低通滤波器，8-octave fbm 第 6–8 层与 5-tap 间距均为亚格尺度，格域采样下 detail 8→6、5-tap→2 不可见（场景成本再省 ~37%）。**仅改 ascii 版拼块**，届时 ascii 版退出与上游逐字节对齐并在本行注明 | themes/*（仅 ascii 版） | 风格内合法 | 未做 |
| P2 | `<ascii-art>` 属性变更细分：fps/color/mono/paused/intro/cell 只改 settings + wake()（cell 另触发 rebuildAtlas），仅 theme 需要 reboot 重编译——避免宿主动态驱动属性时 churn GL context（浏览器 ~16 个活跃上限，旧 context 异步丢失有瞬时内存峰值） | element.js | 架构 | 未做 |
| P3 | 字形 pass 的格级常量（bayer4(cell)/字级 pow/hue 三角）逐像素重算：当前 ~15 ALU + 2 fetch 无感；冲 8K/240Hz 时再下沉格域 | shader-source.js | 微 | 未做 |
| 记录 | fpsCap 30 档在 144Hz 屏实际 ≈28.8fps（阈值 31.3ms vs 帧间隔 6.94ms×5）——可接受；要精确改「下次允许时间戳」调度 | renderer.js draw | 记录 | 不改 |

### 8.3 保真约束与实施方式

- verify-split.js 把 buildFragment('clouds') 产物与上游 mdb 原版**逐字节**比对，SHADER_ORIGINAL 同——
  因此一切作用于共享拼块的精确优化都以 **renderer.js boot 级 `.replace()`** 实施（与既有 5-tap
  时间压缩同机制，发生在校验范围之外），拼块文件保持与上游一致。
- 换行注意：拼块文件为 CRLF，多行 replace 须用 `\r?\n` 正则；替换后加 includes 断言，拼块演化
  导致失配时 console.warn（仅回退为未优化，不影响正确性）。
- 验收：verify-split 全绿（新增 fpsCap 剔除项后）+ 浏览器实测（两版入口页无报错、页头 fps 读出
  生效）；精确 shader 优化以任意参数组合下截图逐位一致为标准。

### 8.4 进度

> 2026-10-25：原版 P1 两项落地——fpsCap（默认 30，旧存档经 normalizeSettings 自动补默认值）
> 与 fbm2 冒烟分支门控（boot 级 replace，两版渲染器同步实施），页头新增实测绘制 fps 读出；
> verify-split.js 的 stripAdded 增加 fpsCap。P2 起按 8.1 / 8.2 表推进。
