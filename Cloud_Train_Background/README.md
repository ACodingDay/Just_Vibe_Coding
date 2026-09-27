# 云间列车 · Cloud Train（独立版，按职责拆分）

一个在浏览器中直接打开即可运行的 WebGL 2 动画：一列小火车驶过悬索桥，车头冒出袅袅蒸汽——背景可在「日落色调的分层云海」与「受《潜水员戴夫》启发的平涂色带大海（含海鸥、云影与丁达尔光柱）」之间切换，全部由一枚 shader 实时绘制，无任何依赖、无需联网。

本仓库为 [原单文件版](https://github.com/) 的复刻，并将单文件 `index.html` 按职责拆分为 html / css / js 多文件结构，行为与原版完全一致。

## 使用方法

1. 直接用浏览器打开 `index.html`（任意支持 WebGL 2 的现代浏览器：Chrome / Edge / Safari / Firefox）；
2. 右下角是「云间列车设置」面板（开场动画结束后出现），可实时调整：
   - 面板顶部的「背景主题」选择器（内置「云海」与「大海」，页头标题随主题切换；切换主题 = 重编译着色器并重播开场揭示动画）；
   - 12 项全局参数（行进速度、视角缩放、垂直位置、曝光、色相、色温等）+ 主题专属参数（云海：云层起伏、噪声细节；大海：浪高、浪花、海鸥数量），每项附独立的「重置」；
   - 三个染色项：天空、烟雾、列车（内置取色器，支持实时预览、确认/取消、屏幕吸管）；
   - 「一键重置」（带确认弹窗）、「记住当前设置」（保存在浏览器本地，下次打开自动恢复）、「重播」（重放开场分层揭示动画）；
   - 若系统开启了「减少动态效果」（Windows 关闭动画效果后，浏览器会上报 `prefers-reduced-motion`），页面会冻结动画并在面板中给出提示，可勾选「忽略系统减少动态效果」强制播放。

## 文件结构

```
├── index.html            页面骨架（canvas + 面板 + 弹窗），按顺序引入 css / js
├── css/
│   ├── base.css          全局 reset、画布、页头
│   ├── panel.css         设置面板、主题选择器、滑杆行、染色色块、按钮
│   ├── picker.css        内嵌取色器
│   └── modal.css         重置确认弹窗
├── js/
│   ├── themes/
│   │   ├── subject-train.js  共享主体块（列车+烟雾+桥）、mainImage 骨架与公共噪声函数
│   │   ├── clouds.js         云海主题描述符（场景 + 专属参数表 + 染色/开场组装配方）
│   │   ├── ocean.js          大海主题描述符（Dave the Diver 风格平涂色带海面 + 云影/光柱/银边，原创 shader）
│   │   └── registry.js       主题注册表与 getCloudTrainTheme
│   ├── config.js         全局设置定义、主题专属表汇总、localStorage 存取与 v1→v2 迁移
│   ├── shader-source.js  原始 shader 源码常量（SHADER_ORIGINAL 由主题拼块组装，仅供 verify 校验）
│   ├── shader-build.js   shader 组装入口：buildFragment(themeId) 经主题 assemblyFn 产出最终片元着色器
│   ├── renderer.js       WebGL 2 渲染器（双 FBO 帧间 feedback、自适应分辨率）
│   ├── panel.js          主题选择器、设置面板构建、同步与按钮逻辑
│   ├── picker.js         自定义取色器（HSV 面板 + RGB 输入 + 屏幕吸管）
│   └── main.js           装配入口（boot：启动渲染、开场动画结束淡入面板）
└── tools/
    ├── extract-shaders.js  从原单文件提取 shader 常量的脚本（开发用，可删）
    └── verify-split.js     校验拆分前后关键产物一致 + 全部 JS 语法检查（node 运行）
```

JS 加载顺序有依赖：`themes/subject-train → themes/clouds → themes/registry → config → shader-source → shader-build → renderer → panel / picker → main`（config 汇总主题描述符自带的专属参数表，故在 registry 之后）。

新增主题：在 `js/themes/` 增加描述符（场景 GLSL + 专属参数表 + 染色/开场组装配方 `assemblyFn`），注册进 `registry.js` 并在 `index.html` 按序引入即可，面板主题选择器与参数区自动适配。

## 来源与致谢

本页面提取并改编自 **Rice-dog** 的开源项目 [**code-codex**](https://github.com/Rice-dog/code-codex) —— 一个为 Codex Desktop 增加本地文件树与预览能力的 Windows 辅助工具。该项目在 v0.2.15 中加入了「Cloud Train Background」外观插件，本仓库的 shader 与渲染逻辑即提取自该插件（commit `0902983a`）。

原始 shader 的作者是 **mdb**（code-codex 项目内注明：*"Original supplied shader credited to mdb. No redistribution license was supplied."*）。

大海主题的「海面云影 / 丁达尔光柱 / 银边」三个效果在概念上参考了 **tyndall-clouds**（Rust + wgpu 体积云 demo，MIT 许可，ProxySudo contributors）——均为本项目的 2D 风格化重写，未复制其代码，详见 `js/themes/ocean.js` 头注释。

向 **Rice-dog** 与 **mdb** 致谢——是他们的出色工作构成了这个页面的全部视觉基础。本仓库仅为在非 Windows 环境下独立欣赏与学习这一效果而做，如果权利人认为不妥，会立即下架处理。

## 许可说明

- 对 [code-codex](https://github.com/Rice-dog/code-codex) 代码的引用与本项目自身的修改，遵循该项目的 **MIT** 许可；
- 原始 shader（作者 mdb）在源项目中**未附再分发许可**，本仓库以其现有形式引用并明确署名，仅作学习与欣赏用途，不另行授权，也不建议商业使用。
