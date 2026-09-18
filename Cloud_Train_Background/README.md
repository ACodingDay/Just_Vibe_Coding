# 云间列车 · Cloud Train（独立版，按职责拆分）

一个在浏览器中直接打开即可运行的 WebGL 2 动画：日落色调的分层云海缓缓流动，一列小火车驶过悬索桥，车头冒出袅袅蒸汽——全部由一枚 shader 实时绘制，无任何依赖、无需联网。

本仓库为 [原单文件版](https://github.com/) 的复刻，并将单文件 `index.html` 按职责拆分为 html / css / js 多文件结构，行为与原版完全一致。

## 使用方法

1. 直接用浏览器打开 `index.html`（任意支持 WebGL 2 的现代浏览器：Chrome / Edge / Safari / Firefox）；
2. 右下角是「云间列车设置」面板（开场动画结束后出现），可实时调整：
   - 行进速度、视角缩放、垂直位置、云层起伏、噪声细节等 14 项画面参数，每项附独立的「重置」；
   - 三个染色项：天空、烟雾、列车（内置取色器，支持实时预览、确认/取消、屏幕吸管）；
   - 「一键重置」（带确认弹窗）、「记住当前设置」（保存在浏览器本地，下次打开自动恢复）、「重播」（重放开场分层揭示动画）；
   - 若系统开启了「减少动态效果」（Windows 关闭动画效果后，浏览器会上报 `prefers-reduced-motion`），页面会冻结动画并在面板中给出提示，可勾选「忽略系统减少动态效果」强制播放。

## 文件结构

```
├── index.html            页面骨架（canvas + 面板 + 弹窗），按顺序引入 css / js
├── css/
│   ├── base.css          全局 reset、画布、页头
│   ├── panel.css         设置面板、滑杆行、染色色块、按钮
│   ├── picker.css        内嵌取色器
│   └── modal.css         重置确认弹窗
├── js/
│   ├── config.js         设置默认值 / 控件定义 / localStorage 存取与旧存档迁移
│   ├── shader-source.js  原始 shader 源码常量（场景 / 后处理 / 顶点）
│   ├── shader-build.js   shader 染色与开场分层揭示的文本组装，产出最终片元着色器
│   ├── renderer.js       WebGL 2 渲染器（双 FBO 帧间 feedback、自适应分辨率）
│   ├── panel.js          设置面板构建、UI 同步、保存 / 重置 / 重播
│   ├── picker.js         自定义取色器（HSV 面板 + RGB 输入 + 屏幕吸管）
│   └── main.js           装配入口（boot：启动渲染、开场动画结束淡入面板）
└── tools/
    └── extract-shaders.js 从原单文件提取 shader 常量的脚本（开发用，可删）
```

JS 加载顺序有依赖：`config → shader-source → shader-build → renderer → panel / picker → main`。

## 来源与致谢

本页面提取并改编自 **Rice-dog** 的开源项目 [**code-codex**](https://github.com/Rice-dog/code-codex) —— 一个为 Codex Desktop 增加本地文件树与预览能力的 Windows 辅助工具。该项目在 v0.2.15 中加入了「Cloud Train Background」外观插件，本仓库的 shader 与渲染逻辑即提取自该插件（commit `0902983a`）。

原始 shader 的作者是 **mdb**（code-codex 项目内注明：*"Original supplied shader credited to mdb. No redistribution license was supplied."*）。

向 **Rice-dog** 与 **mdb** 致谢——是他们的出色工作构成了这个页面的全部视觉基础。本仓库仅为在非 Windows 环境下独立欣赏与学习这一效果而做，如果权利人认为不妥，会立即下架处理。

## 许可说明

- 对 [code-codex](https://github.com/Rice-dog/code-codex) 代码的引用与本项目自身的修改，遵循该项目的 **MIT** 许可；
- 原始 shader（作者 mdb）在源项目中**未附再分发许可**，本仓库以其现有形式引用并明确署名，仅作学习与欣赏用途，不另行授权，也不建议商业使用。
