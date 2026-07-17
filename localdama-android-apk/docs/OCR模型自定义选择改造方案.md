# OCR 模型自定义选择改造方案

> **目标**：将当前硬编码的 OCR 模型加载方式改为用户可在设置界面自定义选择的方案，支持运行时切换不同检测/识别模型。

---

## 一、现状分析

### 1.1 硬编码位置

| 文件 | 行号 | 硬编码内容 |
|------|------|-----------|
| `OcrDetector.kt` | 20 | 模型路径 `"models/det_v5.onnx"` |
| `OcrDetector.kt` | 113 | 最大输入尺寸 `maxSide = 960` |
| `OcrDetector.kt` | 136-143 | 归一化参数 `mean=[0.406, 0.456, 0.485]`、`std=[0.225, 0.224, 0.229]` |
| `OcrDetector.kt` | 166 | 二值化阈值 `thresh = 0.3f` |
| `OcrDetector.kt` | 226 | 框置信度阈值 `score > 0.3f` |
| `OcrDetector.kt` | 124 | 尺寸对齐 `round(x/32)*32` |
| `DetectionEngine.kt` | 43, 78 | `OcrDetector(context)` 直接实例化 |
| `DetectionEngine.kt` | 169 | `OcrDetector(context)` 直接实例化 |
| `TemplateDebugVisualizer.kt` | 195 | `OcrDetector(context)` 直接实例化 |

### 1.2 调用链路

```
SettingsScreen (无 OCR 配置)
  └─ SettingsViewModel (无 OCR 配置)
       └─ SettingsRepository (无 OCR 配置)

IdCardCameraScreen.kt:311  ─┐
HomeViewModel.kt:67         ├─> runTemplateDetection()  ─┐
                             │    └─ DetectionEngine.kt   │
                             │         └─ OcrDetector(context)  ← 硬编码 models/det_v5.onnx
                             │
TemplateDebugVisualizer.kt:195 ─┘
    └─ OcrDetector(context)  ← 硬编码 models/det_v5.onnx
```

### 1.3 已有设置框架

项目已有完整的设置架构，可直接复用：

- `SettingsRepository` — SharedPreferences 读写封装
- `SettingsViewModel` — StateFlow + 持久化
- `SettingsScreen` — Material3 设置 UI（Section + Card + Dialog 模式）
- `strings.xml` — 中文字符串资源

---

## 二、改造方案

### 2.1 模型配置数据结构

新建枚举 `OcrModelOption`，封装可选模型及其预处理参数：

```
app/src/main/java/com/yyt/dama/engine/OcrModelOption.kt
```

```kotlin
package com.yyt.dama.engine

/**
 * 可选 OCR 检测模型。
 *
 * 每个模型封装了文件路径、预处理参数、后处理阈值，
 * 切换模型时自动应用对应参数。
 */
enum class OcrModelOption(
    val displayName: String,
    val modelPath: String,
    val maxSide: Int,
    val alignMultiple: Int,       // 尺寸对齐基数，如 32
    val mean: FloatArray,         // 归一化均值 [R, G, B] 或 [B, G, R]
    val std: FloatArray,          // 归一化标准差
    val binThresh: Float,         // 二值化阈值
    val scoreThresh: Float,       // 框置信度阈值
    val minBoxWidth: Int = 10,
    val minBoxHeight: Int = 10,
) {
    PP_OCR_V5(
        displayName = "PP-OCRv5",
        modelPath = "models/det_v5.onnx",
        maxSide = 960,
        alignMultiple = 32,
        mean = floatArrayOf(0.406f, 0.456f, 0.485f),
        std = floatArrayOf(0.225f, 0.224f, 0.229f),
        binThresh = 0.3f,
        scoreThresh = 0.3f,
    ),
    PP_OCR_V3(
        displayName = "PP-OCRv3",
        modelPath = "models/det_v3.onnx",
        maxSide = 960,
        alignMultiple = 32,
        mean = floatArrayOf(0.485f, 0.456f, 0.406f),
        std = floatArrayOf(0.229f, 0.224f, 0.225f),
        binThresh = 0.3f,
        scoreThresh = 0.3f,
    );
    // 未来新增模型只需在此追加枚举项
}
```

### 2.2 改造 OcrDetector

将硬编码参数改为从 `OcrModelOption` 读取：

**`OcrDetector.kt`**

```kotlin
// 改造前 (第 14-26 行)
class OcrDetector(context: Context) : Closeable {
    init {
        val modelBytes = context.assets.open("models/det_v5.onnx").readBytes()
        // ...
    }
}

// 改造后
class OcrDetector(context: Context, option: OcrModelOption = OcrModelOption.PP_OCR_V5) : Closeable {
    private val model = option  // 保存配置供 preprocess/postprocess 使用

    init {
        val modelBytes = context.assets.open(option.modelPath).readBytes()
        // ...
    }
}
```

`preprocess()` 方法中所有硬编码常量替换为 `model.xxx`：

```kotlin
// 改造前
val maxSide = 960
val newW = maxOf((originalW * ratio / 32f).roundToInt() * 32, 32)
floatBuffer.put(((p and 0xFF) / 255.0f - 0.406f) / 0.225f)

// 改造后
val maxSide = model.maxSide
val newW = maxOf((originalW * ratio / model.alignMultiple.toFloat()).roundToInt() * model.alignMultiple, model.alignMultiple)
floatBuffer.put(((p and 0xFF) / 255.0f - model.mean[0]) / model.std[0])
```

`postprocess()` 方法中同理替换 `thresh` 和 `score` 阈值。

### 2.3 SettingsRepository 新增 OCR 模型持久化

**`SettingsRepository.kt`** 新增：

```kotlin
// ── OCR Model ──

fun loadOcrModelOption(): OcrModelOption {
    val ordinal = prefs.getInt(KEY_OCR_MODEL, OcrModelOption.PP_OCR_V5.ordinal)
    return OcrModelOption.entries.getOrElse(ordinal) { OcrModelOption.PP_OCR_V5 }
}

fun saveOcrModelOption(option: OcrModelOption) {
    prefs.edit { putInt(KEY_OCR_MODEL, option.ordinal) }
}

companion object {
    // ... 已有 key ...
    private const val KEY_OCR_MODEL = "ocr_model"
}
```

### 2.4 SettingsViewModel 新增模型状态

**`SettingsViewModel.kt`** 新增：

```kotlin
private val _ocrModelOption = MutableStateFlow(repo.loadOcrModelOption())
val ocrModelOption: StateFlow<OcrModelOption> = _ocrModelOption.asStateFlow()

fun setOcrModelOption(option: OcrModelOption) {
    _ocrModelOption.value = option
    repo.saveOcrModelOption(option)
}
```

### 2.5 SettingsScreen 新增 OCR 设置 Section

**`SettingsScreen.kt`** 在打码 Section 下方新增 OCR Section：

```kotlin
// ================================================================
// Section: OCR
// ================================================================
SectionHeader("OCR 模型")
Spacer(Modifier.height(8.dp))

SettingsCard {
    var showOcrModelDialog by remember { mutableStateOf(false) }
    SettingsRow(
        icon = Icons.Default.DocumentScanner,
        title = "检测模型",
        subtitle = ocrModelOption.displayName,
        onClick = { showOcrModelDialog = true }
    )

    if (showOcrModelDialog) {
        OcrModelDialog(
            currentModel = ocrModelOption,
            onSelect = { model ->
                settingsViewModel.setOcrModelOption(model)
                showOcrModelDialog = false
            },
            onDismiss = { showOcrModelDialog = false }
        )
    }
}
```

`OcrModelDialog` 复用现有 `ThemeModeDialog` 的单选 Dialog 模式：

```kotlin
@Composable
private fun OcrModelDialog(
    currentModel: OcrModelOption,
    onSelect: (OcrModelOption) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("选择 OCR 检测模型") },
        text = {
            Column {
                OcrModelOption.entries.forEach { model ->
                    Surface(
                        onClick = { onSelect(model) },
                        shape = MaterialTheme.shapes.medium,
                        color = if (model == currentModel)
                            MaterialTheme.colorScheme.primaryContainer
                        else
                            MaterialTheme.colorScheme.surface
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp, horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = model == currentModel,
                                onClick = { onSelect(model) }
                            )
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = model.displayName,
                                    style = MaterialTheme.typography.bodyLarge
                                )
                                Text(
                                    text = model.modelPath,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Spacer(Modifier.weight(1f))
                            if (model == currentModel) {
                                Icon(
                                    Icons.Default.Check,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.settings_cancel)) }
        }
    )
}
```

### 2.6 strings.xml 新增字符串

**`app/src/main/res/values/strings.xml`**：

```xml
<string name="settings_section_ocr">OCR</string>
<string name="settings_ocr_model">检测模型</string>
<string name="settings_ocr_model_desc">选择文本检测模型</string>
<string name="settings_ocr_model_dialog_title">选择 OCR 检测模型</string>
```

### 2.7 DetectionEngine 传递模型参数

所有调用 `OcrDetector(context)` 的地方改为从设置中读取模型选项：

```kotlin
// DetectionEngine.kt — runTemplateDetection()
// 改造前
val detector = OcrDetector(context)

// 改造后
val modelOption = SettingsRepository(context).loadOcrModelOption()
val detector = OcrDetector(context, modelOption)
```

同样改造 `runDetection()`、`runFullImageDetection()` 和 `TemplateDebugVisualizer.runDebugDetection()`。

### 2.8 调用方传入 Context 已有

各调用点均已持有 `context`，无需额外传递：

| 调用点 | 文件 | 行号 |
|--------|------|------|
| 模板检测 | `DetectionEngine.kt` | 43, 78, 169 |
| 调试可视化 | `TemplateDebugVisualizer.kt` | 195 |
| 相机拍照 | `IdCardCameraScreen.kt` | 311 |
| 测试入口 | `HomeViewModel.kt` | 67 |

---

## 三、改造步骤

### 阶段一：模型配置参数化（核心改造）

| 步骤 | 文件 | 内容 |
|------|------|------|
| 1 | `engine/OcrModelOption.kt` | 新建枚举，封装模型路径 + 预处理/后处理参数 |
| 2 | `engine/OcrDetector.kt` | 构造函数接收 `OcrModelOption`，替换所有硬编码常量 |
| 3 | `data/SettingsRepository.kt` | 新增 `loadOcrModelOption()` / `saveOcrModelOption()` |
| 4 | `viewmodel/SettingsViewModel.kt` | 新增 `ocrModelOption` StateFlow + setter |
| 5 | `feature/settings/SettingsScreen.kt` | 新增 OCR Section + 模型选择 Dialog |

### 阶段二：调用链路接入

| 步骤 | 文件 | 内容 |
|------|------|------|
| 6 | `engine/DetectionEngine.kt` | 3 处 `OcrDetector(context)` → `OcrDetector(context, modelOption)` |
| 7 | `engine/TemplateDebugVisualizer.kt` | 1 处同上改造 |
| 8 | `res/values/strings.xml` | 新增 OCR 相关字符串资源 |

### 阶段三：模型文件管理

| 步骤 | 说明 |
|------|------|
| 9 | 将可选模型放入 `app/src/main/assets/models/` 目录（如 `det_v3.onnx`） |
| 10 | 在 `OcrModelOption` 枚举中追加新模型项 |

### 阶段四（可选）：动态加载外部模型

> 若需支持用户从手机存储导入自定义模型，需额外实现：

| 步骤 | 说明 |
|------|------|
| 11 | `OcrModelOption` 新增 `CUSTOM` 项，`modelPath` 指向 app 私有存储 |
| 12 | `OcrDetector` 支持 `File` 路径加载（assets 和 File 两种来源） |
| 13 | `SettingsScreen` 新增「导入模型」入口，调用 `ACTION_OPEN_DOCUMENT` 选择 `.onnx` 文件 |
| 14 | 导入的模型复制到 `context.filesDir/models/` 并持久化路径 |
| 15 | 导入时引导用户填写预处理参数（或从模型元数据自动读取） |

---

## 四、注意事项

### 4.1 预处理参数差异

不同 PP-OCR 版本的预处理参数可能不同：

| 参数 | PP-OCRv3 | PP-OCRv5 |
|------|----------|----------|
| 通道顺序 | RGB | BGR（NCHW 平面格式先写 B 通道） |
| 归一化均值 | `[0.485, 0.456, 0.406]` | `[0.406, 0.456, 0.485]` |
| 归一化标准差 | `[0.229, 0.224, 0.225]` | `[0.225, 0.224, 0.229]` |
| 尺寸对齐 | 32 | 32 |

`OcrModelOption` 已将这些参数封装为字段，切换模型时自动应用。

> **关键**：当前 `OcrDetector.preprocess()` 按先 B → G → R 的顺序写入通道（第 135-143 行），这是 PP-OCRv5 的方式。如果支持 PP-OCRv3（RGB 顺序），需要根据模型配置动态调整通道写入顺序。

### 4.2 Session 生命周期

`OcrDetector` 每次调用都新建 + close session。切换模型不影响已有检测流程，因为模型选项在构造时读取。

### 4.3 模型文件大小

ONNX 检测模型通常 5-15MB。内置多个模型会增加 APK 体积，建议：

- 内置 1 个默认模型（当前 `det_v5.onnx`）
- 其他模型通过阶段四的「动态导入」按需加载

### 4.4 向后兼容

- `OcrDetector` 构造函数 `option` 参数默认值为 `OcrModelOption.PP_OCR_V5`，不传则行为不变
- `SettingsRepository` 默认值也是 `PP_OCR_V5`，升级后首次运行自动使用原模型

---

## 五、涉及文件清单

| 文件 | 改动类型 |
|------|----------|
| `engine/OcrModelOption.kt` | **新建** |
| `engine/OcrDetector.kt` | 修改：构造函数参数化 + preprocess/postprocess 引用配置 |
| `engine/DetectionEngine.kt` | 修改：3 处实例化点传入模型选项 |
| `engine/TemplateDebugVisualizer.kt` | 修改：1 处实例化点传入模型选项 |
| `data/SettingsRepository.kt` | 修改：新增 OCR 模型存取方法 |
| `viewmodel/SettingsViewModel.kt` | 修改：新增 OCR 模型状态 |
| `feature/settings/SettingsScreen.kt` | 修改：新增 OCR Section + Dialog |
| `res/values/strings.xml` | 修改：新增 OCR 相关字符串 |

---

## 六、测试验证

1. **默认模型**：不修改设置，行为应与改造前完全一致（使用 `det_v5.onnx`）
2. **切换模型**：设置中切换到另一个模型，执行 OCR 测试，确认使用了新模型
3. **持久化**：切换模型后重启应用，设置中应显示上次选择的模型
4. **模型缺失**：选择不存在的模型文件时应有错误提示（当前 `assets.open` 会抛 `IOException`）
5. **预处理一致性**：对比改造前后的检测结果，确保 v5 模型预处理参数未被改变
