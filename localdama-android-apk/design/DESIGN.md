# LocalDama Design System — Apple Direction

> 版本: 2.1 · 日期: 2026-06-12
> 设计方向: Apple Human Interface Guidelines
> 平台: Android (Jetpack Compose + Material 3)

## 设计方向概述

本次设计从原来的 Material Design 3 + Material You 动态取色，转向 **Apple HIG 风格**的设计语言。核心原则：

- **章节节奏 (Chapter Rhythm)**：通过深色/浅色背景交替营造叙事感，而非平铺直叙
- **克制的色彩**：中性冷灰画布 + 三套可选主题配色（经典黑白单色 / 科技蓝 `#007AFF` / 清新绿 `#34C759`），色彩稀缺即层级
- **胶囊几何**：`border-radius: 980px` 的标志性胶囊按钮和控件
- **排版戏剧性**：Display 56sp 与 Body 17sp 之间的尺度落差，SemiBold 取代 Bold
- **色调深度**：层级靠表面色阶递进和 0.5px hairline 边框，而非阴影堆叠

---

## 1. 色彩系统

### 1.1 中性色阶梯 (Neutral Scale)

Apple 的中性色是**冷调无色调偏向**的灰阶，不含暖色或冷色倾向。

| Token (CSS) | Token (Compose) | Light 值 | Dark 值 | 用途 |
|---|---|---|---|---|
| `--bg` | `ApplePaleGray` / `AppleDarkBg` | `#F5F5F7` | `#000000` | 页面背景 |
| `--surface` | `AppleSurface` / `AppleDarkElevated` | `#FFFFFF` | `#1C1C1E` | 卡片表面 |
| `--surface-variant` | `ApplePaleGray` / `AppleDarkVariant` | `#F5F5F7` | `#2C2C2E` | 嵌套区域 |
| `--surface-container` | `AppleContainer` / `AppleDarkContainer` | `#E8E8ED` | `#3A3A3C` | 最高层容器 |
| `--fg` | `AppleInk` / `AppleDarkFg` | `#1D1D1F` | `#F5F5F7` | 主要文字 |
| `--fg-secondary` | `AppleSecondary` / `AppleDarkSecondary` | `#424245` | `#D1D1D6` | 次要文字 |
| `--fg-tertiary` | `AppleTertiary` / `AppleDarkTertiary` | `#6E6E73` | `#98989D` | 辅助文字 |
| `--fg-disabled` | `AppleDisabled` / `AppleDarkDisabled` | `#AEAEB2` | `#48484A` | 禁用文字 |
| `--border` | `AppleBorder` | `#D2D2D7` | `rgba(255,255,255,0.12)` | 标准边框 |
| `--border-subtle` | `AppleBorderSubtle` | `#E5E5EA` | `rgba(255,255,255,0.06)` | 极淡边框 |

### 1.2 行动色 (Accent) — 三套主题配色

应用支持 3 套主题配色切换（`ThemeColor` 枚举），通过 `DamaTheme(themeColor = ...)` 生效，设置页面可持久化选择。

| 主题 | 枚举值 | Light Primary | Dark Primary | 风格定位 |
|---|---|---|---|---|
| 经典黑白 | `CLASSIC` | `#1D1D1F` (AppleInk) | `#F5F5F7` (AppleDarkFg) | 纯单色调，图标/按钮为黑白色 |
| 科技蓝 | `TECH_BLUE` | `#007AFF` | `#0A84FF` | 鲜明蓝色强调 |
| 清新绿 | `FRESH_GREEN` | `#34C759` (AppleSuccess) | `#30D158` (AppleSuccessDark) | 自然绿色强调 |

**经典黑白**的 `primaryContainer` 使用中性灰（Light `#E8E8ED` / Dark `#3A3A3C`），不含任何色相偏向。科技蓝和清新绿各自有对应的 `primaryContainer` 色调。

三套主题共享相同的中性色阶梯（背景、表面、文字色），仅 primary 系列和 inversePrimary 不同。

### 1.3 语义色 (Semantic)

| 语义 | Light | Dark |
|---|---|---|
| Success | `#34C759` | `#30D158` |
| Warning | `#FF9F0A` | `#FFD60A` |
| Error | `#FF3B30` | `#FF453A` |
| Info | `#007AFF` | `#64D2FF` |

### 1.4 特征卡片配色 (Feature Card Accents)

每张功能卡片有独立配色，通过 `accentColorFor(index)` 和 `accentContainerFor(index)` 获取：

| 索引 | 功能 | Light 色 | Dark 色 |
|---|---|---|---|
| 0 | 证件打码 | `#5856D6` 紫 | `#7D7AFF` |
| 1 | 隐私打码 | `#FF9500` 橙 | `#FFB340` |
| 2 | OCR 测试 | `#007AFF` 蓝 | `#64D2FF` |
| 3 | 更多功能 | `#8E8E93` 灰 | `#98989D` |

### 1.5 清新绿暗模式特殊处理

清新绿 (`fresh-green`) 暗模式的表面层已从中性化——底色保持纯黑 `#000000`，表面层使用中性深灰（`#141614` → `#1C1E1C` → `#262826` → `#343634`），避免全屏弥漫绿色导致层次不清。绿色仅保留在交互元素上（primary、accent、图标）。

---

## 2. 排版系统

### 2.1 字体

- **首选**: `-apple-system` / `SF Pro` (iOS/macOS)
- **Android 回退**: `FontFamily.Default` (系统字体)
- **Web 回退**: `Inter` → `Helvetica Neue` → `Arial`

### 2.2 层级表

| 角色 | Compose Slot | 字号 | 字重 | 行高 | 字间距 |
|---|---|---|---|---|---|
| Display Large | `displayLarge` | 56sp | SemiBold | 60sp | -0.28sp |
| Display Medium | `displayMedium` | 48sp | SemiBold | 52sp | -0.14sp |
| Display Small | `displaySmall` | 40sp | SemiBold | 44sp | 0 |
| Headline Large | `headlineLarge` | 32sp | SemiBold | 36sp | 0 |
| Headline Medium | `headlineMedium` | 28sp | SemiBold | 32sp | 0.20sp |
| Headline Small | `headlineSmall` | 24sp | SemiBold | 28sp | 0.22sp |
| Title Large | `titleLarge` | 21sp | SemiBold | 24sp | 0.23sp |
| Title Medium | `titleMedium` | 17sp | SemiBold | 22sp | -0.37sp |
| Body Large | `bodyLarge` | 17sp | Normal | 25sp | -0.37sp |
| Body Medium | `bodyMedium` | 14sp | Normal | 18sp | -0.22sp |
| Body Small | `bodySmall` | 12sp | Normal | 16sp | -0.12sp |
| Label Large | `labelLarge` | 14sp | Medium | 18sp | -0.22sp |
| Label Medium | `labelMedium` | 12sp | Medium | 16sp | -0.12sp |
| Label Small | `labelSmall` | 11sp | Medium | 14sp | 0 |

### 2.3 与原版差异

- 所有 Display/Headline 字重从 **Bold (700)** 降为 **SemiBold (600)**
- 基准正文字号从 **16sp** 提升到 **17sp**
- 行高比 Material 默认更紧凑（Display 层级 line-height ≈ 1.07）
- letter-spacing 在正字号使用负值，增强紧凑感

---

## 3. 圆角系统

### 3.1 Shape Scale

| Compose Slot | 圆角 | 适用场景 |
|---|---|---|
| `extraSmall` | 6dp | 小标签、徽章、紧凑输入框 |
| `small` | 8dp | 标准按钮、文本框 |
| `medium` | 12dp | 卡片、对话框、设置组 |
| `large` | 18dp | 大卡片、内容面板 |
| `extraLarge` | 28dp | Hero 模块、聚光容器 |

### 3.2 组件级特殊圆角

- **胶囊按钮**: `RoundedCornerShape(50)` (等同于 CSS 的 `980px`)
- **圆形图标按钮**: `RoundedCornerShape(50)` + 固定尺寸
- **iOS 风格 Toggle**: 13dp radius (42×26dp 尺寸)
- **手机框架**: 40dp (外层) / 16dp (刘海)

---

## 4. 深度与层级

Apple 风格极少使用阴影，层级主要通过**色调对比**传达：

| 层级 | 处理方式 | 适用场景 |
|---|---|---|
| Level 0 | 纯色中性表面 | 页面背景 |
| Level 1 | 0.5px hairline 边框 | 卡片、输入框 |
| Level 2 | 柔和阴影 `rgba(0,0,0,0.04-0.08)` | 浮层卡片 |
| Level 3 | 暗色表面递进 | 叠加层、控件组 |
| Mask | 半透明黑色蒙层 | 模态对话框背景 |

---

## 5. 文件变更日志

### v2.1 (2026-06-12) — Bug Fixes & Theme Color Selector

**Bug 修复 (4):**

| 问题 | 修复文件 | 方案 |
|---|---|---|
| 主页工具栏与背景色差 | `DamaTopBar.kt` | Surface color 从 `colorScheme.surface` (#FFF) 改为 `colorScheme.background` (#F5F5F7)，文字色对应改为 `onBackground` |
| 结果页内容区/底部栏与工具栏色差 | `ResultScreen.kt` | 内容区 `bgColor` 和底部操作栏 Surface 从 `colorScheme.surface` 改为 `colorScheme.background`，与 DamaTopBar 保持一致 |
| 深色模式状态栏图标不可见 | `MainActivity.kt` | 新增 `LaunchedEffect(themeMode, systemDark)` 通过 `isAppearanceLightStatusBars` 动态切换状态栏图标明暗 |
| 经典黑白 primary 与科技蓝重复 | `Theme.kt` | 经典黑白 primary 从 AppleBlue (#0071E3) 改为 AppleInk (#1D1D1F) / AppleDarkFg (#F5F5F7)，primaryContainer 改为中性灰 |

**新功能: 主题配色选择器**

| 文件 | 变更 |
|---|---|
| `ui/theme/Theme.kt` | 新增 `ThemeColor` 枚举 (CLASSIC / TECH_BLUE / FRESH_GREEN)；新增 4 套 ColorScheme (TechBlue/FreshGreen × Light/Dark)；`DamaTheme` 接受 `themeColor` 参数 |
| `feature/settings/SettingsScreen.kt` | 新增 `loadThemeColor` / `saveThemeColor` 持久化函数；新增 `ThemeColorDialog` 弹窗（带颜色预览圆点）；主题配色行从禁用占位改为可交互 |
| `navigation/DamaNavGraph.kt` | 新增 `themeColor` / `onThemeColorChanged` 参数透传 |
| `MainActivity.kt` | 新增 `themeColor` 状态管理，加载自 SharedPreferences，传递给 `DamaTheme` 和 `DamaNavGraph` |
| `res/values/strings.xml` | 新增主题配色相关字符串（经典黑白 / 科技蓝 / 清新绿 / 对话框标题） |

### v2.0 (2026-06-12) — Apple Direction Restyle

**主题文件 (4 files):**

| 文件 | 变更 |
|---|---|
| `ui/theme/Color.kt` | 全量替换为 Apple 色板：冷灰阶梯、Apple Blue、iOS 语义色、特征卡片紫/橙/蓝/灰 |
| `ui/theme/Theme.kt` | `darkColorScheme` / `lightColorScheme` 映射到 Apple 值；`dynamicColor` 默认 `false` |
| `ui/theme/Type.kt` | 字重 Bold→SemiBold；Display 56sp；Body 17sp；Apple HIG letter-spacing |
| `ui/theme/Shape.kt` | 圆角 4/8/12/16/24 → 6/8/12/18/28 dp |

**业务文件 (1 file):**

| 文件 | 变更 |
|---|---|
| `feature/idcard/IdCardCameraScreen.kt` | 消除 4 处硬编码色值，改为引用 Color.kt token |

### 设计对比参考

设计展示原型（React + Vite）保存在 `design/showcase/` 目录，包含 3 主题 × 2 模式共 6 种视觉状态的完整 CSS 实现，可作为 Android 开发的视觉参考。

### 启动设计稿预览

```bash
cd design/showcase
npm install
npm run dev
```

启动后在浏览器打开 `http://localhost:5173` 即可预览。页面顶部可切换 3 套主题（经典黑白 / 科技蓝 / 清新绿）和 Light / Dark 模式。

需要 **Node.js 18+** 环境，无需额外安装全局依赖。

---

## 6. 迁移注意事项

### dynamicColor 已禁用

`DamaTheme` 的 `dynamicColor` 参数默认为 `false`。如需恢复 Material You 动态取色（根据壁纸自动生成配色），在调用处传 `dynamicColor = true`：

```kotlin
DamaTheme(dynamicColor = true) {
    // ...
}
```

### ThemeColor 主题配色切换

`DamaTheme` 新增 `themeColor` 参数（`ThemeColor` 枚举，默认 `CLASSIC`）。切换后整套 `colorScheme` 随之变化：

```kotlin
DamaTheme(themeMode = themeMode, themeColor = themeColor) {
    // ...
}
```

选择通过 `SharedPreferences` 持久化（key: `theme_color`），在 `SettingsScreen` 中通过 `ThemeColorDialog` 弹窗切换。

### DamaTopBar 使用 background 色

`DamaTopBar` 的 Surface 颜色从 `colorScheme.surface` 改为 `colorScheme.background`，确保工具栏与 Scaffold 页面背景无色差。文字和图标色对应使用 `onBackground`。

### 状态栏图标颜色自动适配

`MainActivity` 通过 `WindowInsetsControllerCompat.isAppearanceLightStatusBars` 根据当前主题模式自动切换状态栏图标明暗，解决深色模式下图标不可见的问题。

### 新增 `accentContainerFor()` 函数

Color.kt 新增了 `accentContainerFor(index: Int)` 辅助函数，返回特征卡片的淡色容器背景，与 `accentColorFor()` 配对使用：

```kotlin
val accent = accentColorFor(index)        // 前景色（图标、标题）
val container = accentContainerFor(index)  // 背景色（卡片底色）
```

### 未改动的文件

以下 Screen 文件未改动（已通过 `MaterialTheme.colorScheme.*` 正确引用 token）：

- `IdCardEditScreen.kt`
- `SensitiveInfoScreen.kt`
