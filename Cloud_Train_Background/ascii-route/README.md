# ASCII 路线：性能评估与技术方案

> 状态：路线决策文档 · 2026-10-11 · **P1–P5 全部实施完成并验收**
> 结论：**壁纸（常驻背景）场景下，ASCII 字符路线优于现有 WebGL 平滑路线**，且优势随分辨率与刷新率放大。
> 技术借鉴：[ascii.rest](https://ascii.rest/)（MIT，@bas3line）——借鉴其字形图集、字符梯度、格宽高比与行为设计；**不采用**其 CPU 渲染路径（理由见 §2.3）。

---

## 0. TL;DR

- 两条路线的 GPU 成本差距约 **70×**（dpr≥1.5 的屏可达 ~160×），来自一个结构性事实：ASCII 的最终粒度是**字符格**，重场景 shader 只需按格子数渲染，与显示分辨率彻底解耦。
- 现有 WebGL 平滑路线的成本与像素数锁死：4K@240Hz 需要约 **16 倍**于 1080p@60 的着色吞吐，主流硬件不可达，唯一出路是把 `resolution` 拉到 0.25（放大后糊掉）。
- ASCII 路线在 4K@240Hz 下场景成本约为当前 1080p 默认档的 **1/70**，新增的字形 pass 是每像素 2 次采样的轻量着色器——4K@240 从"旗舰独显也悬"变为"核显可谈"。
- ascii.rest 官方的两条 CPU 路径（`<pre>` 文本 / canvas 2D）对本项目不可行：WebGL→CPU 每帧回读 4.7–18.7 MB 的同步停顿 + 万级格子的主线程开销；4K@240Hz 回读带宽高达 **4.5 GB/s**。故只借鉴其技术，不复制其渲染架构。
- 壁纸是常驻负载：GPU 占用从"持续数十个百分点"降到近闲置，发热/风扇/续航全面受益；叠加 ascii.rest 式"默认 30fps"策略，功耗再减半。
- 场景 shader（云海/大海两个主题）**零改动复用**——ASCII 路线的成本是一枚字形 pass，不是一次重写。

## 1. 两条路线的定义

| | 路线 A（现状） | 路线 B（ASCII） |
|---|---|---|
| 内容粒度 | 像素（与显示分辨率锁死） | 字符格（与显示分辨率解耦） |
| 场景 shader | 全分辨率渲染 | 原封不动跑在 cols×rows 网格 FBO 上 |
| 输出 | SHADER_IMAGE 后处理 → 画布 | 字形放大 pass → 画布 |
| 反馈拖影 | 像素级余晖 | 字符级余晖（终端美学，风格加分） |
| 4K@240Hz | 不可达（除非砍分辨率变糊） | 可达（场景成本不变） |

关键认知：ASCII 路线的低分辨率**不是画质损失，而是风格本身**。"风格即优化"——这是它在壁纸场景胜出的根本原因。

## 2. 性能评估

### 2.1 路线 A 的成本结构：场景成本 ∝ 像素数

场景 shader（`js/themes/ocean.js` 等）每像素执行多排 8-octave fbm、5 次前景采样循环、云/光柱等，成本与渲染像素数成正比。渲染尺寸由 `renderer.js:86`（`min(dpr,1.5) × resolution`，默认 0.75）决定：

| 显示器 | 每帧场景像素 | 120fps 吞吐 | 240fps 吞吐 | 帧预算 |
|---|---|---|---|---|
| 1080p | ~1.17M px | 1.4 亿 px/s | 2.8 亿 px/s | 8.3 / 4.2 ms |
| 2K (1440p) | ~2.07M px | 2.5 亿 px/s | 5.0 亿 px/s | 8.3 / 4.2 ms |
| 4K | ~4.67M px | 5.6 亿 px/s | **11.2 亿 px/s** | 8.3 / 4.2 ms |

4K@240Hz 相对 1080p@60Hz 是 16 倍吞吐需求 × 1/4 帧预算——两头夹击，与硬件进步曲线不匹配。

### 2.2 路线 B 的解耦：场景成本钉在格子数上

ASCII 的最终粒度是字符格（约 8×16 CSS px，宽高比 2:1，同 ascii.rest 的 `cell=2`）。场景 shader 只需对**每格一次采样**：

| 显示器 | 网格（格数） | 场景成本降幅 | 每帧场景像素@240Hz |
|---|---|---|---|
| 1080p | 240×68 ≈ 1.62 万格 | ~72× ↓ | 390 万 px/s |
| 2K | 320×90 = 2.88 万格 | ~72× ↓ | 690 万 px/s |
| 4K | 480×135 = 6.48 万格 | ~72× ↓ | 1560 万 px/s |

（降幅 = 渲染像素数 ÷ 格数，精确值；dpr≥1.5 的屏降幅增至 ~160×，因为格子按 CSS 像素计而渲染像素按物理像素计。）

新增的字形放大 pass 按原生分辨率铺满屏幕，每像素 = 1 次场景格采样 + 1 次图集采样 + ~15 条 ALU。4K@240Hz 下约 11–20 亿轻量像素/秒，对独显是零头，核显也能吃下。**每帧总工作量对比路线 A 约 40–70× ↓**。

### 2.3 为什么 CPU 路线出局（ascii.rest 官方两路径的评估）

ascii.rest 的两条实现（读其 `ascii.js`/`mount.js` 源码确认）：

- **`<pre>` DOM 文本**（单色作品）：每帧 `el.textContent = 整幅字符串`，成本 ∝ 总格数（无法差分，textContent 整体替换触发全幅重排）。
- **canvas 2D + 字形图集 + 差分重绘**（彩色作品）：每 (字符,颜色) 对只光栅化一次进图集，每帧仅对变化格 `drawImage`。其源码注释的自证：*"on a phone a scene's 20,000 copies a frame were most of its time"*——2 万格规模已逼出图集+差分优化。

放到本项目（画面在 GPU 上、全屏、持续动画）：

1. **readPixels 同步停顿**：必须先把 WebGL 帧读回 CPU。1080p 档每帧 4.7 MB，4K 档每帧 **18.7 MB**；readPixels 是同步栅栏（CPU 等 GPU 画完再 DMA），流水线被击穿，4K@240Hz 回读带宽 **4.5 GB/s**——架构性不可行。
2. **主线程网格开销**：4K 全屏 ≈ 6.5 万格。`<pre>` 每帧整幅重排 6.5 万字符（数毫秒 + 字符串垃圾）；canvas 路径在海浪/云全程在动的场景下差分几乎不省，每帧数万次 blit（回到它自己注释里的状态）。

结论：**只借鉴 ascii.rest 的技术，不复制其渲染架构。**

### 2.4 对照组：拉低 `resolution` 滑杆 ≠ ASCII 路线

路线 A 在 4K@240Hz 的唯一出路是 `resolution` 0.25（1440×810 再放大到 4K）。成本确实降 ~18×，但放大后**一片模糊**——是画质妥协。ASCII 路线在更低成本下（~72×↓）画面依然锐利：字形按原生分辨率光栅化，模糊只存在于格子内部，而这正是风格。等效预算下，一条路线"看起来坏了"，另一条"看起来是对的"。

### 2.5 壁纸场景的加成：功耗与热

壁纸是 7×24 常驻负载，GPU 成本直接决定发热/风扇/续航。路线 A 在核显笔记本上持续占用数十个百分点 GPU；路线 B 把场景钉在万级像素、输出 pass 近闲置——常驻功耗降一个数量级，这是"壁纸"这一产品形态下最硬的优势。再叠加帧率上限控制（见 §3.4），收益翻倍。

### 2.6 诚实的边界

- **美学是产品决策**：ASCII 改变壁纸气质（终端/复古 vs 平滑插画）。性能结论不等于审美结论；本决策以"壁纸常驻负载 + 高分高刷覆盖 + 低功耗"为工程前提。
- **浏览器合成器天花板**：240Hz 下 rAF 与合成本身有固定开销，任何网页都未必跑满 240——路线 B 给的是巨大余量，最终帧率上限由浏览器而非 GPU 决定。
- **1080p@60 下差距不致命**：现有路线在默认档已流畅。若产品目标仅此一档，路线 A 够用；本决策面向高分高刷与常驻功耗。

## 3. 技术方案（借鉴清单）

### 3.1 管线（ASCII 模式）

```
场景 shader（零改动）
  → 网格 FBO（cols×rows，含反馈 iChannel1 字符级余晖）
  → 字形放大 pass（原生分辨率：调色 → 亮度分级 → 图集取字形）
  → 画布
```

与现状的对应：`renderer.js:113-119` 的 FBO 尺寸机制天然支持"网格尺寸"新概念（显示尺寸与网格尺寸拆开）；`shader-source.js:14` 的 SHADER_IMAGE 位置由字形 pass 接替，曝光/色相/饱和/暗角**先于字级映射**应用（保证亮度与字符密度一致）。

### 3.2 字形图集（借鉴 mount.js 的 slot + 1px padding）

一次性生成（离屏 2D canvas 光栅化字符梯度 → `texImage2D` 上传 R8/alpha 图集），运行时零成本：

- 每级字形一个 tile，tile 间留 1px 空白防渗色（ascii.rest 用同款技巧防 box-drawing 字形越界）；
- LINEAR 采样 + padding tile，字形边缘随 dpr 平滑；
- 字符集建议 16 级起步，如 `" .:-=+*#%@"` 扩展至 16 字符，密度单调递增；面板可切换密度曲线。

### 3.3 彩色模式（借鉴其 canvas 彩色路径的概念）

每格前景色 = 场景格采样调色后的颜色，字形 alpha 来自图集：`color = gradedColor × glyph`。对应 ascii.rest 彩色作品"每 (字符,颜色) 对一个图集槽位"的概念，但颜色作为乘法因子在 GPU 上免费获得，无需槽位管理。另可提供单色/双色（终端风）模式。

### 3.4 行为设计（直接照抄其成熟决策）

- **默认 30fps**：ascii.rest 所有作品默认 `fps=30`。壁纸不需要 60/240 全速，帧率上限做成滑杆（30/60/不限），功耗再减半；
- **reduced-motion 静帧**：其 `<ascii-art>` 在 `prefers-reduced-motion` 下定格首帧——本项目已有同款行为（`renderer.js:69-72`），行为对齐已达成；
- **格宽高比 2:1**：对应等宽字体 0.6em 宽 × 1.2 行高，`cell=2` 同款。

### 3.5 字形 pass 骨架（示意）

```glsl
uniform sampler2D uScene;   // cols×rows 网格 FBO
uniform sampler2D uAtlas;   // 字形图集：LEVELS 级横向排列，单通道
uniform vec2 uGrid, uCellPx;
void main(){
    vec2 cell   = floor(gl_FragCoord.xy / uCellPx);       // 所在格
    vec3 graded = grade(texture(uScene, (cell+.5)/uGrid).rgb); // 一格一采样，先调色
    float lum   = dot(graded, vec3(.2126,.7152,.0722));
    float level = floor(lum * LEVELS);                     // 亮度 → 字级
    vec2 g      = fract(gl_FragCoord.xy / uCellPx);        // 格内位置
    float glyph = texture(uAtlas, vec2((level+g.x)/LEVELS, g.y)).r;
    result = vec4(graded * glyph, 1.);                     // 字形 × 调色后颜色
}
```

## 4. 实施步骤

1. **P1 渲染器改造**：`updatePixelSize()` 拆出"网格尺寸"（ceil(css/cell)），场景 FBO 与 `iResolution` 改绑网格；反馈纹理随网格尺寸分配（`renderer.js:113-119`）。
2. **P2 图集生成**：离屏 2D canvas 按 cell 尺寸 × dpr 光栅化字符梯度，`texImage2D` 上传，一次性完成。
3. **P3 字形 program**：复用 SHADER_VERTEX 全屏三角形；SHADER_IMAGE 的调色项折入 `grade()`；开场横向揭示保留在输出端逐像素执行。
4. **P4 面板控制**：新增「格子尺寸」（密度）、「字符梯度」、「颜色模式」、「帧率上限」；`resolution` 滑杆在 ASCII 模式下语义改为字形 pass 渲染比例（保持 1.0 即原生）。paramUniforms 机制（`js/themes/*.js` 描述符）原样复用。
5. **P5 主题验证**：两个主题的 scene 函数与分辨率无关（`uv = fragCoord/iResolution.y`），理论零改动；重点验证大海主题的碎金反光/浪花/光柱在格内的时域表现；反馈拖影变为字符级余晖（预期为风格加分）。

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 细节效果格内丢失/时域闪烁（碎金、浪花、光柱纹理） | 场景 2× 超采样（每格 4 采样），成本仍 ~18×↓ 于路线 A；或字级时域抖动 |
| 反馈拖影变块状 | 即字符级余晖，预期是加分项；可用现有 `feedback` 滑杆调弱 |
| 图集渗色/字形边缘锯齿 | tile 1px padding（§3.2）+ LINEAR；dpr 变化时重生成图集 |
| 超宽屏/非整数缩放 | 网格 = ceil(css/cell)，字形 pass 格边界取整映射 |
| 240Hz 浏览器天花板 | 帧率上限滑杆兜底（默认 30fps 本就是壁纸最优） |
| 许可 | clouds 主题 shader 仍受 mdb CC BY-NC-SA 约束（ASCII 模式不改变其范围）；ocean 为本项目原创；ascii.rest 仅概念借鉴（MIT），无代码复制 |

## 6. 与现有路线的关系

落地形态（2026-10-11 决策）：**平行版本而非模式共存**——主目录代码原样保留作对比参考，ASCII 路线的实现全部在本目录（`ascii-route/`）内自成一版，可独立打开运行。两版共享同一套场景 shader（`js/themes/` 拼块逐字节一致），差异集中在渲染器与入口文件；**逐文件 diff 两目录即是路线差异清单**。

## 7. 实施状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| P1 | 渲染器网格化：场景 shader / 反馈 FBO / `iResolution` 绑 `cols×rows` 网格（格 8×16 CSS px，`ceil` 划分，与 dpr/resolution 解耦）；画布仍按显示尺寸分配，两套尺寸独立触发重分配（显示尺寸变化不再重分配 FBO）。输出端暂以 SHADER_IMAGE 线性放大——画面呈马赛克块 = 预期中间形态；页头显示网格尺寸（`hooks.onStats`） | ✅ 完成（已验收） |
| P2 | 字形图集生成（`js/ascii-atlas.js`）：16 级 ASCII 梯度 → 等宽字体光栅化 → R8 单通道覆盖度图集（默认 288×34 px，tile=[pad 1px\|glyph 16×32\|pad]，字号按实测 advance 充满格宽，绘制区裁剪防污染 pad）；附校验工具 `tools/atlas-preview.html`（放大预览 + 实测覆盖度 + 单调性断言）。GL 上传（`texImage2D(gl.R8,...)`）随 P3 接入 | ✅ 完成（已验收） |
| P3 | 字形放大 pass 替换 SHADER_IMAGE（`SHADER_ASCII_IMAGE`：定位格子 → 场景网格 FBO 取格中心 → 先调色后选字 → 图集取字形 → 字形×颜色；暗角/开场揭示留在显示域逐像素；新增 `glyphGain` 按最密字形实测覆盖度归一亮度，`min(覆盖度×gain,1)` 截断保色相）；图集纹理以 R8 上传（单元 3 常驻），SHADER_IMAGE 保留未删供 A/B 回退 | ✅ 完成（已验收） |
| P4 | 面板控制（ASCII 专属，经 config.js 的 `CLOUD_TRAIN_GLOBAL_SELECTS` 下拉表 + panel.js 下拉行构建）：**格子尺寸** 4–24 CSS px 滑杆（联动网格重算 + 图集按显示域物理像素重建）；**字符梯度** 标准16/经典10/极简5 预设（三档均实测单调）；**颜色模式** 彩色/磷屏绿（`uMode` uniform，灰度单色不单列——饱和度滑杆拉 0 即白墨）；**帧率上限** 30（默认）/60/120/不限（跳帧在 draw 入口实现，时间只在真实绘制帧推进）；页头读出追加**实测绘制 fps**（`hooks.onFrame` 1 秒窗口）。**独立存储键** `cloud-train-saved-settings:ascii:v1`（与主版本互不读写，重置只清自己的档） | ✅ 完成（已验收） |
| P5 | 主题调优（字形输出端，场景 shader 保持与主目录逐字节一致——主版本大海主题后续进化可直接拷贝同步）：**字级伽马**滑杆 0.4–2.5（亮度→字符密度分布曲线，直击亮部字级分布调优点）；**拜耳 4×4 有序抖动**开关（字级边界空间 stipple，天空/光晕渐变从色带变抖动过渡；纯空间图案无时域闪烁，默认开）。灰度单色由饱和度滑杆覆盖，不另设模式 | ✅ 完成（已验收） |
| P6 | `<ascii-art>` 自定义元素（`js/element.js`）：借鉴 ascii.rest `src/ascii.ts` 的**封装架构**（单标签、属性驱动、生命周期自洽），**保留 GPU 渲染核心**不改渲染路径。属性 `theme`/`piece`、`fps`、`cell`、`color`/`mono`、`label`、`options`(JSON)；connected/disconnected/attributeChanged + 微任务合批；每实例独立 settings（经 config.js `normalizeSettings` 校验）；暴露 `el.settings`/`reboot()`/`wake()`/`measuredFps` 与 `ascii-stats`/`ascii-fps`/`ascii-intro-done` 事件；无 WebGL2 时降级为元素内可读文本（不抛全局，多实例互不牵连） | ✅ 完成（已验收） |
| P7 | 渲染器行为对齐 ascii.rest `mount.ts`：`IntersectionObserver` **离屏停绘**（画布滚出视口即停 rAF，滚回续帧；`request()`/看门狗统一经 `onscreen` 门控）。壁纸常驻场景恒可见、行为不变；封装成可嵌入组件后离屏实例省电 | ✅ 完成（已验收） |
| P8 | 嵌入演示页 `embed.html`：三个独立 `<ascii-art>` 实例（默认云海 / 大海磷屏绿大格 / `options` JSON 驱动 + 交互改属性），各自独立设置、独立离屏停绘、独立帧率上限，验证组件可嵌入性（一行标签放多幅） | ✅ 完成（已验收） |

运行方式：浏览器直接打开 `ascii-route/index.html`（与主版本同构，无依赖、无需联网）。

P1 验收记录（2026-10-11，Chrome/IAB 1280×720）：页头网格 160×45 = ceil(1280/8)×ceil(720/16) ✓；画布 backing 1440×810（显示域）与网格互相独立 ✓；「渲染比例」0.75→0.25→0.75 期间画布 1440×810→320×180→960×540、网格恒为 160×45 ✓；云海/大海两主题在网格域编译渲染均无报错 ✓；画面呈 8×16 马赛克块、列车/桥/云/海排结构可辨、反馈为字符级余晖 ✓。已知无害瞬态：IAB 面板打开瞬间 dpr 上报 1.5 后回落 1.0（主版本同款机制，仅影响显示域清晰度，网格不受影响）。

P2 验收记录（2026-10-11，同环境）：初版梯度 `" .:-~=+*xX#%&$M@"` 被工具页实测抓出两处逆序（`:`7.2% 密于 `-`4.2%；`&`32.3% 密于 `$`29.3%），据测重排为 `" .-:~=*+xX#$%M&@"`，复测覆盖度 [0, 4.2, 4.2, 7.2, 9.6, 11.8, 13.4, 13.8, 18, 24.7, 26.7, 29.3, 29.4, 31.5, 32.3, 40.2]% 严格非降，单调性 PASS；图集 288×34 px / 9792 B R8 / pad=1，字形清晰、pad 干净；主页面挂载该模块后无回归（无报错、网格 160×45 不变）。注意覆盖度数值随等宽字体而异（校准基于 ui-monospace/Consolas 类），换预设/字体时用工具页复测。

P3 验收记录（2026-10-11，同环境）：字形 pass 上线后 8×16 格内可见具体字符（` .-:~=*+xX#$%M&@`），亮部密/暗部疏、黑底字符画观感成立；云海/大海双主题编译渲染无报错，网格 160×45 稳定，fps 实测 241（IAB 未锁 vsync，管线余量的直接证据）；用 GL 单元测试（已知灰度梯度 + 真图集 + readPixels 逐格点亮率）独立验证了 shader 数学正确。**调试教训（重要）**：首轮验收画面呈实心块，排查路径 = 缓存诊断（transferSize/文件内容）→ GL 单元测试（证明 shader/图集正确）→ 枚举 CURRENT_PROGRAM 活动 uniform（发现运行的是旧 SHADER_IMAGE 的 9-uniform 集）→ 根因为**本地静态服务器无缓存头，Chromium 重载时对无校验器的子脚本直接复用内存缓存**（页面加载 12096 B 旧版 vs 磁盘 13661 B 新版）。服务器已加 `Cache-Control: no-store`（临时脚本不入库）；直接 file:// 打开无此问题。后续排查渲染异常先确认「页面真的在跑新代码」。

P4 验收记录（2026-10-11，同环境）：三档梯度预设实测单调（classic/standard/minimal bad=0）；格子尺寸 16 → 网格 80×23、字形按 16×32 物理像素重建（期间修一 bug：updatePixelSize 仍用常量格宽，未接 settings.asciiCell）；帧率上限三档实测绘制帧率精确命中（30→30、不限→240、60→60，页头读出可见；注意 rAF 计数不随上限变化——跳帧在 draw 入口，统计须用绘制帧回调）；磷屏绿/极简梯度/彩色模式截图确认；存档写入 `:ascii:v1` 键、主版本 v2 键保持 null、重载恢复磷屏绿+格子16、一键重置回出厂并清档。**遗留说明**：fpsCap/asciiRamp/asciiColor 以字符串存档（normalizeSettings 校验取值须在选项表内）；格子尺寸滑杆改变时图集在 reset 中同步重建（change 触发，拖动过程不重建，无性能毛刺）。

P5 验收记录（2026-10-11，同环境）：字级伽马两端对比显著——0.6 全画面细密织毯感、暗部字形浮现；1.6 高对比海报感、暗部沉入黑底而云形更突出（默认保持 1.0 中性，风格交给用户）；拜耳抖动在天空/云层字级边界产生 stipple 过渡（开关对比截图确认），纯空间图案、无时域闪烁，与反馈拖影无冲突；大海主题成品（抖动+伽马1.0+30fps）青蓝字海/白色字符云团/列车带/浪花排全部成立、无报错。P1 遗留的「暖色扩散」在字形模式下已不成问题。**至此 P1–P5 全部完成**。

---

## 8. 组件化架构（P6–P8：借 ascii.rest 封装，保留 GPU 渲染）

> 决策（2026-10-17）：**借架构、保留 GPU**。ascii.rest 的 CPU 渲染路径（`<pre>` 文本 / canvas2D 图集差分）对 Cloud Train 这种连续全屏重型 GLSL 场景是降级（见 §2.3），但其**封装架构**值得整套搬来：把一整幅动画封成单标签、属性驱动、生命周期自洽的可嵌入组件。渲染核心（`renderer.js`/`shader-source.js`/`themes/`）零改动复用。

### 8.1 与 ascii.rest 的对应关系

| ascii.rest | 本项目（`js/element.js`） |
|---|---|
| `<ascii-art piece="donut">` | `<ascii-art theme="clouds">`（piece 作 theme 别名保留） |
| `options='{"text":"hi"}'` | `options='{"speed":.8,"asciiCell":12}'`（JSON，经 `normalizeSettings` 校验） |
| `fps` / `label` / `mono` | `fps`（帧率上限）/ `label`（读屏）/ `mono`（→磷屏绿） |
| connected/disconnected/attributeChanged + 微任务合批 | 同款（`soon()`） |
| 无 palette 时降级 `<pre>` 文本 | 无 WebGL2 时降级为元素内可读文本（不抛全局） |
| IntersectionObserver 离屏停绘 | 同款（P7，落在 `renderer.js`，index/embed 共用） |

### 8.2 用法

```html
<ascii-art theme="ocean" cell="12" fps="30" color="phosphor" label="字符画大海"></ascii-art>
<ascii-art options='{"theme":"clouds","speed":1.2,"asciiGamma":1.4}'></ascii-art>
```

元素填满自身盒子，宿主用 CSS 给尺寸（如 `height:60vh`）。JS 接口：`el.settings`（改字段后 `el.wake()` 生效）、`el.reboot()`（切主题等需重编译 program）、`el.measuredFps`；事件 `ascii-stats`/`ascii-fps`/`ascii-intro-done`。

### 8.3 两个入口的关系

- `index.html` — 单页应用 Demo：完整设置面板 + 取色器 + 存档，驱动单一画布（原有形态，未改）。
- `embed.html` — 组件嵌入 Demo（P8）：多幅 `<ascii-art>` 并存，纯属性驱动，验证可嵌入性与离屏停绘。
- 二者共用同一套渲染核心与主题，互不影响。后续若把 `index.html` 的面板改为驱动 `<ascii-art>` 实例（替代全局 `settings`/`boot`/`wakeRef`），即为 P10，属更侵入的一步，待确认后再做。

