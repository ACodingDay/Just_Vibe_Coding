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

## 六、落地顺序

1. 主题描述符重构（视觉零变化；校验渲染产物逐字节一致）
2. 云海迁移为第一个主题
3. 地平线·日升日落（复用度最高）
4. 大海·海鸥
5. 可选：切换时旧主题画面淡出（现阶段 replay 揭示已足够）

## 七、验收标准

- 切换主题不刷新页面；每个主题的专属参数可调、可单项重置、可记住、可一键重置。
- 云海主题迁移后与迁移前渲染产物逐字节一致（verify 脚本通过）。
- 存档 v1 → v2 迁移不丢用户已保存的个性化设置。
- file:// 双击打开仍然可用（无构建步骤、无 ES modules）。
