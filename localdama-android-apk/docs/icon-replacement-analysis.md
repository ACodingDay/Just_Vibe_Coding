# Game Icon Pack v1.4 替代方案分析

> 分析对象：`C:\Users\yyt0111\Downloads\game-icon-pack-v1.4-svg\`
> 目标项目：localdama-android-apk（打码 / 敏感信息保护 app）

---

## 一、项目现状

- **技术栈**：Jetpack Compose，图标全部来自 `androidx.compose.material.icons.Icons.Default.*`
- **图标引用**：共 26 处，去重后约 24 个独立图标，分布在 HomeScreen / SettingsScreen / ResultScreen / SensitiveInfoScreen / IdCardCameraScreen / IdCardEditScreen / CameraScreen / DamaTopBar / PreviewConfirmOverlay
- **自定义资源**：除 launcher 图标和 `id_card_locator_front/back.png` 两张定位引导图外，**无任何自定义 SVG / VectorDrawable 图标**
- **app 功能**：身份证打码、敏感信息检测、OCR 文字识别、照片打码

**结论**：目前完全依赖 Material Icons，无图标资产包袱，整体替换零成本。

---

## 二、Icon Pack 概况

| 项 | 说明 |
|---|---|
| 两个版本 | `no-padding/`（紧凑，**推荐做 UI 图标**）、`padding/`（带留白，适合需呼吸感的场景） |
| 分类 | 12 个：1-game / 2-items / 3-gear / 4-nature / 5-food / 6-buildings / 7-vehicles / 8-ui / 9-media / 10-editing / 11-symbols / 12-misc |
| 格式 | `fill="currentColor"`、`width/height=24`、viewBox 非统一（按图形实际边界裁剪，如 `1.98 1.98 6.04 6.04`） |
| 风格 | 游戏化实心填充（filled），线条少 |

**对接要点**：
- `currentColor` → 可用 `tint` 着色，深色/浅色主题自动适配
- 非标准 viewBox → Android Studio 的「SVG to VectorDrawable」会自动按 viewBox 适配 viewport，无需手动换算坐标
- 实心风格 → 与 Material Outlined 图标差异明显，**建议整体替换，不要混用**

---

## 三、图标映射表

### A. 完美匹配（同名同义，可直接 1:1 替换）

| 项目用法 | Material 图标 | icon pack 文件 | 用途位置 |
|---|---|---|---|
| 设置-深色模式 | `DarkMode` | `8-ui/dark-mode.svg` | 深色模式开关 |
| 设置-主题色 | `Palette` | `10-editing/palette.svg` | 主题色选择 |
| 设置-关于 | `Info` | `8-ui/info.svg` | 关于信息 |
| 设置-OCR | `DocumentScanner` | `9-media/scan.svg` | 文档扫描/OCR |
| 结果页 | `Save` | `8-ui/save.svg` | 保存图片 |
| 结果页 | `Share` | `9-media/share.svg` | 分享 |
| 各处确认 | `Check` | `8-ui/tick.svg` | 确认/完成 |
| 各处关闭 | `Close` | `8-ui/cross.svg` | 关闭/取消 |
| 返回 | `ArrowBack` | `8-ui/arrow-left.svg` | 返回（注意 AutoMirrored 方向） |
| 设置入口 | `Settings` | `8-ui/settings.svg` | 齿轮 |
| 主页-敏感信息 | `Lock` | `8-ui/lock.svg` | 锁定 |
| 身份证页 | `Shield` | `3-gear/shield.svg`（另有 `shield-02/03`） | 信息保护 |
| 身份证编辑页 | `ScreenRotation` | `8-ui/rotate-left.svg`（或 `rotate-right`） | 旋转证件 |
| 设置-文档 | `Description` | `9-media/document.svg` | 文档说明 |

### B. 良好匹配（语义对应，替换后含义清晰）

| 项目用法 | Material 图标 | icon pack 文件 | 说明 |
|---|---|---|---|
| 相册选图 | `PhotoLibrary` | `9-media/image.svg` | 图片 ≈ 相册 |
| 拍照 | `PhotoCamera` | `9-media/camera.svg` | 相机 |
| 语言设置 | `Language` | `9-media/earth.svg` 或 `internet.svg` | 地球 = 国际化 |
| 全屏 | `Fullscreen` | `8-ui/expand.svg`（另有 02/03/04） | 展开 = 全屏 |
| 工具/构建 | `Construction` | `2-items/tool-kit.svg`（或 `wrench.svg`） | 工具箱 |
| 科学/实验 | `Science` | `5-food/potion.svg` | 药剂瓶 = 实验（游戏风） |
| 身份证 | `Badge` | `1-game/card.svg` 或 `club-card.svg` | 卡片 = 证件 |
| 人脸打码 | `Face` | `11-symbols/emoji.svg` | 笑脸 = 人脸 |

### C. 语义替代（需视觉调整或语义妥协）

| 项目用法 | Material 图标 | icon pack 文件 | 说明 |
|---|---|---|---|
| 打码效果 | `BlurOn` | `12-misc/radiation.svg` 或 `1-game/hit-effect.svg` | 辐射/命中特效 ≈ 散射打码点，最接近的视觉隐喻 |
| 添加图片 | `AddPhotoAlternate` | `9-media/import.svg` | 导入 ≈ 添加图，无「图+加号」原版 |
| 闪光灯开 | `FlashOn` | `4-nature/lightning.svg` 或 `7-vehicles/high-beam.svg` | 闪电/远光灯 ≈ 闪光 |

### D. 无直接对应（建议保留 Material 或自行处理）

| 项目用法 | Material 图标 | 建议 |
|---|---|---|
| 闪光灯关 | `FlashOff` | 无对应；可用 `8-ui/toggle-off.svg` 语义替代，或该组闪光灯开关整体保留 Material 图标 |

---

## 四、额外推荐（icon pack 中契合本 app、项目尚未用到的）

这些图标特别贴合「打码 / 隐私保护」主题，可作为功能增强或视觉补充：

| 文件 | 适用场景 |
|---|---|
| `10-editing/eraser.svg` | 橡皮擦 — 擦除打码区域 |
| `10-editing/brush.svg` / `paintbrush.svg` | 画笔 — 手动涂抹打码 |
| `9-media/protect.svg` | 保护 — 敏感信息保护（与 Shield 互补） |
| `8-ui/invisible.svg` / `visible.svg` | 隐藏/显示 — 原图 ↔ 打码效果切换 |
| `8-ui/zoom-in.svg` / `zoom-out.svg` | 缩放 — 结果页查看细节 |
| `12-misc/loading-bars.svg` / `loading-ring.svg` | 加载 — OCR 处理中状态 |
| `9-media/qr-code.svg` | 二维码（如有扫码录入场景） |
| `9-media/webcam.svg` | 摄像头（与 camera 互补） |
| `8-ui/prohibited.svg` | 禁止 — 敏感项不可识别提示 |
| `9-media/scan.svg` + `9-media/qr-code.svg` | 扫描类操作统一风格 |

---

## 五、落地建议

1. **格式转换**：SVG → Android VectorDrawable
   - 方式 A（推荐）：Android Studio → `res` 右键 → New → Vector Asset → Local file → 选 SVG，自动转换
   - 方式 B：命令行 `svg2vector` 工具批量转
   - 注意：icon pack viewBox 非标准 `0 0 24 24`，AS 会自动按 viewBox 适配 viewport，坐标无需手动换算

2. **Compose 接入**：转成 `drawable/ic_xxx.xml` 后，用 `painterResource(R.drawable.ic_xxx)` 替代 `Icons.Default.Xxx`，`Icon(painter = ..., ...)` 用法一致

3. **着色与主题**：icon pack 是 `currentColor`，转 VectorDrawable 后路径填色会落到 `@color`；用 `LocalContentColor.current` + `tint` 自动跟随主题，深色模式下图标自动变浅

4. **版本选择**：UI 控件图标统一用 `no-padding/`（紧凑）；若做 launcher / 大尺寸展示用 `padding/`

5. **风格一致性**：icon pack 是游戏化实心风，与 Material Outlined 差异大。**务必整体替换**，混用会割裂。本 app 无自定义图标包袱，正好一次性切换

6. **命名规范**：建议按功能命名而非沿用 icon pack 原名，例如 `ic_scan.xml`、`ic_shield.xml`、`ic_blur_mosaic.xml`，便于维护

---

## 六、总结

- 24 个在用图标中：**14 个完美匹配**、**8 个良好匹配**、**3 个语义替代**、**1 个（FlashOff）无对应**
- 覆盖率约 **96%**，唯一缺口是闪光灯关闭状态，可局部保留 Material 或用 toggle 语义图替代
- icon pack 的游戏化风格与「打码保护」app 调性契合（盾牌、锁、橡皮擦、画笔等隐喻丰富），替换后能形成更具辨识度的视觉语言

---

## 七、落地实施记录

> 已执行完毕，待编译验证。

### 7.1 转换方案

- 脚本：`.workbuddy/convert_icons.py`（可复用，支持后续扩展图标清单）
- 核心处理：game-icon-pack 的 viewBox 起点非 `(0,0)`（如 `1.98 1.98 6.04 6.04`），Android VectorDrawable 的 viewport 起点固定 `(0,0)`。脚本用 `<group android:translateX="-minX" android:translateY="-minY">` 包裹 `<path>`，平移补偿 viewBox 偏移，**path 数据原样保留**无需重算坐标
- `fillColor` 统一写 `#FF000000`（黑色），依赖 Compose `Icon` 的 `tint` 着色覆盖，深色/浅色主题自动跟随 `LocalContentColor` / 显式 `tint`

### 7.2 资源产出

| 位置 | 数量 | 说明 |
|---|---|---|
| `app/src/main/res/drawable/ic_*.xml` | 40 | VectorDrawable，接入 Compose |
| `design/icons-svg/*.svg` | 40 | svg 源副本，便于二次编辑/回溯 |

### 7.3 命名映射（Material → VectorDrawable）

**完美匹配（直接替换）**

| Material 图标 | VectorDrawable | svg 源 |
|---|---|---|
| `Settings` | `ic_settings` | 8-ui/settings |
| `DarkMode` | `ic_dark_mode` | 8-ui/dark-mode |
| `Info` | `ic_info` | 8-ui/info |
| `Lock` | `ic_lock` | 8-ui/lock |
| `Save` | `ic_save` | 8-ui/save |
| `Check` | `ic_check` | 8-ui/tick |
| `Close` | `ic_close` | 8-ui/cross |
| `ArrowBack` | `ic_arrow_back` | 8-ui/arrow-left |
| `ScreenRotation` | `ic_rotate_left` | 8-ui/rotate-left |
| `DocumentScanner` | `ic_scan` | 9-media/scan |
| `Share` | `ic_share` | 9-media/share |
| `Description` | `ic_document` | 9-media/document |
| `PhotoCamera` | `ic_camera` | 9-media/camera |
| `Palette` | `ic_palette` | 10-editing/palette |
| `Shield` | `ic_shield` | 3-gear/shield |

**良好匹配（语义对应）**

| Material 图标 | VectorDrawable | svg 源 | 说明 |
|---|---|---|---|
| `PhotoLibrary` | `ic_photo_library` | 9-media/image | 图片 |
| `Language` | `ic_language` | 9-media/earth | 地球 |
| `Fullscreen` | `ic_fullscreen` | 8-ui/expand | 展开 |
| `Construction` | `ic_construction` | 2-items/tool-kit | 工具箱 |
| `Science` | `ic_science` | 5-food/potion | 药剂瓶 |
| `Badge` | `ic_badge` | 1-game/card | 卡片 |
| `Face` | `ic_face` | 11-symbols/emoji | 笑脸 |

**语义替代（视觉妥协）**

| Material 图标 | VectorDrawable | svg 源 | 说明 |
|---|---|---|---|
| `BlurOn` | `ic_blur` | 12-misc/radiation | 辐射状≈打码散射点 |
| `AddPhotoAlternate` | `ic_add_photo` | 9-media/import | 导入箭头 |
| `FlashOn` | `ic_flash_on` | 4-nature/lightning | 闪电 |
| `FlashOff` | `ic_flash_off` | 8-ui/toggle-off | 开关（无原版闪光灯关） |

**额外推荐（已生成资源，暂未接入代码）**

| VectorDrawable | svg 源 | 预留用途 |
|---|---|---|
| `ic_eraser` | 10-editing/eraser | 擦除打码区域 |
| `ic_brush` | 10-editing/brush | 手动涂抹打码 |
| `ic_paintbrush` | 10-editing/paintbrush | 画笔 |
| `ic_protect` | 9-media/protect | 敏感信息保护 |
| `ic_invisible` | 8-ui/invisible | 隐藏（原图↔打码切换） |
| `ic_visible` | 8-ui/visible | 显示 |
| `ic_zoom_in` | 8-ui/zoom-in | 缩放查看 |
| `ic_zoom_out` | 8-ui/zoom-out | 缩放查看 |
| `ic_loading` | 12-misc/loading-bars | OCR 处理中加载 |
| `ic_qr_code` | 9-media/qr-code | 二维码扫码 |
| `ic_webcam` | 9-media/webcam | 摄像头 |
| `ic_prohibited` | 8-ui/prohibited | 禁止（敏感项不可识别） |

**设置页新增（开源许可功能，已接入代码）**

| VectorDrawable | svg 源 | 用途 |
|---|---|---|
| `ic_code` | 9-media/code | 设置-关于-开源许可入口行图标 |
| `ic_open_in_new` | 8-ui/arrow-up-right | 开源许可页条目的外链跳转指示 |

### 7.4 代码改造（9 个文件）

统一模式：
- 组件签名 `icon: ImageVector` → `icon: Painter`
- 内部 `Icon(imageVector = icon, ...)` → `Icon(painter = icon, ...)`
- 调用点 `Icons.Default.X` / `Icons.AutoMirrored.Filled.ArrowBack` → `painterResource(R.drawable.ic_x)`
- import：移除 `material.icons.*`，新增 `androidx.compose.ui.graphics.painter.Painter` 与 `androidx.compose.ui.res.painterResource`

| 文件 | 改造内容 |
|---|---|
| `ui/components/DamaTopBar.kt` | ArrowBack → ic_arrow_back |
| `ui/components/PreviewConfirmOverlay.kt` | ConfirmActionButton 签名改 Painter；Close/Check |
| `ui/components/CameraScreen.kt` | ArrowBack；FlashOn/Off 三元 |
| `feature/home/HomeScreen.kt` | StaggeredFeatureCard + FeatureCard 签名改 Painter；Settings/Badge/Lock/Science/Construction（宽窄布局共 9 处） |
| `feature/settings/SettingsScreen.kt` | SettingsRow + SettingsSwitchRow 签名改 Painter；DarkMode/Palette/Language/Fullscreen/BlurOn/DocumentScanner/Info/Description；dialog 内 Check ×2 |
| `feature/result/ResultScreen.kt` | Save/Share |
| `feature/sensitive/SensitiveInfoScreen.kt` | PhotoLibrary/PhotoCamera/AddPhotoAlternate |
| `feature/idcard/IdCardCameraScreen.kt` | SideTab + ConfirmActionButton 签名改 Painter；ArrowBack/FlashOn·Off/Face/Shield/PhotoLibrary/Close/Check |
| `feature/idcard/IdCardEditScreen.kt` | AddPhotoAlternate/PhotoLibrary/ScreenRotation |

校验：`grep` 全项目 `Icons\.` 与 `material\.icons` 均无残留。

---

## 八、待验证点

编译/运行验证时请重点关注：

1. **着色与主题**
   - vector `fillColor` 为 `#FF000000`，完全依赖 `Icon` 的 `tint` 覆盖。原代码各处均传了 `tint = MaterialTheme.colorScheme.xxx`，会覆盖黑色。
   - 风险点：若有 `Icon` 未显式传 `tint`，会 fallback 到 `LocalContentColor.current`——深色模式下应为浅色，浅色模式下应为深色，需肉眼确认无误。

2. **语义替代图标的视觉接受度**（非 1:1，风格变化最大，建议逐一过目）
   - `BlurOn → ic_blur`（radiation 辐射符号）：是否契合「打码」语义
   - `FlashOn → ic_flash_on`（闪电）、`FlashOff → ic_flash_off`（toggle 开关）：闪光灯两态视觉是否协调（注意 off 用了 toggle 而非「闪电带斜杠」）
   - `AddPhotoAlternate → ic_add_photo`（导入箭头）：相册添加入口识别度
   - `Badge → ic_badge`（扑克卡牌）、`Science → ic_science`（药剂瓶）、`Construction → ic_construction`（工具箱）：首页四宫格图标语义是否清晰

3. **`material-icons-extended` 依赖**
   - `gradle/libs.versions.toml` 仍声明 `androidx-compose-material-icons-extended`，但 `app/build.gradle.kts` 未直接引用它，且代码已无 `Icons.` 调用。
   - 不影响编译；确认无其他模块引用后可从 toml 清理。

4. **非标准 viewport 的渲染**
   - 各 vector 的 `viewportWidth/Height` 取自原 viewBox 的宽高（如 6.04、6.2、7.5 等），非统一 24。`width/height` 仍为 `24dp`，视觉尺寸一致，仅内部坐标尺度不同。
   - 需确认各图标在 `Modifier.size(20.dp)` / `48.dp` 等不同显示尺寸下无变形、无裁切。

5. **额外推荐图标未接入**
   - `ic_eraser` / `ic_brush` / `ic_protect` / `ic_invisible` / `ic_visible` / `ic_zoom_in` / `ic_zoom_out` / `ic_loading` / `ic_qr_code` / `ic_webcam` / `ic_prohibited` 共 11 个已生成但未在代码中使用，属预留资源，不影响编译。后续做「手动涂抹打码」「原图/打码切换」「结果页缩放」等功能时可直接引用。

