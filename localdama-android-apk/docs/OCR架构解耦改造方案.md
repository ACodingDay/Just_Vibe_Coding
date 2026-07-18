# OCR 架构解耦改造方案

> **目标**：将界面层与 OCR 检测/打码的完整流程解耦，封装为统一的「标准输入 → 标准输出」接口。界面层不关心中间有几层实现、用什么模型、怎么预处理/后处理，只管传入图片和参数，拿回打码结果。

---

## 一、现状分析

### 1.1 当前调用链路

```
IdCardCameraScreen.kt:311     ──→ runTemplateDetection(context, bmp, side)
IdCardEditScreen.kt:414       ──→ runDetection(context, bmp, cardOffsetY, screenW, cardH, orientation)
HomeViewModel.kt:67           ──→ runTemplateDetection(ctx, bitmap)
HomeViewModel.kt:116          ──→ TemplateDebugVisualizer.runDebugDetection(ctx, bitmap)
                                      │
                                      ▼
                              DetectionEngine.kt (顶层函数群)
                                ├── runDetection()          ← 裁剪 + OcrDetector.detect + 模板过滤
                                ├── runFullImageDetection() ← OcrDetector.detect + 模板过滤
                                ├── runDualSideDetection()  ← 调用 runFullImageDetection × 2 + 拼接
                                └── runTemplateDetection()  ← OcrDetector.detectInRegion × N + expandOcrBoxes
                                      │
                                      ▼
                              OcrDetector.kt (单一类，硬编码 v5 逻辑)
                                ├── init: 加载 ONNX 模型
                                ├── preprocess: resize + NCHW + BGR 归一化
                                ├── ONNX 推理
                                └── postprocess: 二值化 + 膨胀 + floodfill + 合并
```

```
ResultScreen.kt:74,90,160,196 ──→ MosaicEngine.applyMosaic(bitmap, regions, style)
ResultScreen.kt                ──→ MosaicRegions.process(boxes, bitmap)  (部分路径)
```

### 1.2 耦合问题清单

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 1 | **界面层直接调用底层引擎** | `IdCardCameraScreen.kt:311` | Composable 内直接调 `runTemplateDetection()`，需自行管理 `Dispatchers.IO` + `try/catch` |
| 2 | **界面层直接调用底层引擎** | `IdCardEditScreen.kt:414` | 同上，调 `runDetection()` |
| 3 | **ViewModel 直接依赖具体函数** | `HomeViewModel.kt:67,116` | 直接 import `runTemplateDetection` 和 `TemplateDebugVisualizer` |
| 4 | **检测逻辑分散在顶层函数** | `DetectionEngine.kt` | 4 个顶层函数各自管理 `OcrDetector` 生命周期、模板过滤、box 扩展，逻辑重复且无统一入口 |
| 5 | **OcrDetector 绑死一套算法** | `OcrDetector.kt` | preprocess 的通道顺序(BGR)、postprocess 的 floodfill 算法全部硬编码，换模型无法换逻辑 |
| 6 | **打码流程未统一** | `ResultScreen.kt` | `MosaicEngine.applyMosaic` 和 `MosaicRegions.process` 分散调用，调用方需自行组合 |
| 7 | **无统一结果类型** | 多处 | 有的返回 `List<Rect>`，有的返回 `Pair<Bitmap, List<Rect>>`，有的返回 `Triple<...>`，无标准契约 |
| 8 | **模型选择逻辑穿透** | `DetectionEngine.kt:44,80,172` | 每个 Detection 函数内部 `SettingsRepository(context).loadOcrModelOption()`，重复读取 |

### 1.3 界面层当前需要关心的实现细节

```
界面层需要手动编排的步骤：
  1. 创建协程 scope
  2. 切换到 Dispatchers.IO
  3. new SettingsRepository(context) 读取模型选项（或委托给 DetectionEngine 内部读）
  4. 调用 runTemplateDetection / runDetection / runDebugDetection（需知道该调哪个）
  5. try/catch 异常
  6. 回收 Bitmap（有时调 bmp.recycle()，有时不调，规则不统一）
  7. 将结果传给 DetectionRepository 或 onDetectionDone 回调
  8. ResultScreen 再自行调 MosaicEngine.applyMosaic 做打码
```

**理想状态：界面层只需要：传入图片 + 正反面 → 拿回打码后的图片。**

---

## 二、目标架构

### 2.1 分层总览

```
┌─────────────────────────────────────────────────────────┐
│  界面层 (UI + ViewModel)                                 │
│  IdCardCameraScreen / IdCardEditScreen / HomeViewModel   │
│  ResultScreen                                            │
│                                                          │
│  职责：传图片、传参数、展示结果                             │
│  不关心：模型加载、预处理、推理、后处理、打码               │
└──────────────────────┬──────────────────────────────────┘
                       │  标准输入：Bitmap + Options
                       │  标准输出：DetectionResult
                       ▼
┌─────────────────────────────────────────────────────────┐
│  门面层 (Facade) — 唯一入口                               │
│  OcrFacade / interface                                   │
│                                                          │
│  职责：接收标准输入 → 选策略 → 编排完整流程 → 返回标准输出  │
│  对外契约：process(bitmap, options) -> DetectionResult   │
└──────────────────────┬──────────────────────────────────┘
                       │  委托给策略
                       ▼
┌─────────────────────────────────────────────────────────┐
│  策略层 (Strategy) — 每个模型一套完整流程                  │
│  OcrStrategy / interface                                 │
│  ├── PpOcrV5Strategy: preprocess → infer → postprocess  │
│  ├── PpOcrV3Strategy: (未来)                            │
│  └── XxxStrategy: (未来)                                │
│                                                          │
│  职责：封装该模型的完整检测逻辑                            │
└──────────────────────┬──────────────────────────────────┘
                       │  使用基础设施
                       ▼
┌─────────────────────────────────────────────────────────┐
│  基础设施层 (Infrastructure)                              │
│  OnnxRuntimeSession — ONNX 模型加载与推理                 │
│  MosaicEngine — 打码渲染                                 │
│  MosaicRegions — 区域后处理（颜色过滤、合并、扩展）         │
│  SettingsRepository — 用户偏好读取                        │
└─────────────────────────────────────────────────────────┘
```

### 2.2 标准输入输出契约

```
┌──────────────┐                        ┌──────────────────┐
│  标准输入     │                        │  标准输出          │
│              │                        │                  │
│  Bitmap      │──── OcrFacade ────→    │  DetectionResult │
│  CardSide    │                        │  ├── bitmap      │
│  CardOrient. │                        │  ├── regions     │
│  (可选)      │                        │  └── debugBitmap │
│              │                        │     (可选)       │
└──────────────┘                        └──────────────────┘
```

---

## 三、接口设计

### 3.1 标准数据类型

```
app/src/main/java/com/yyt/dama/ocr/
├── DetectionRequest.kt      — 标准输入
├── DetectionResult.kt       — 标准输出
├── OcrFacade.kt             — 门面接口
├── OcrFacadeImpl.kt         — 门面实现
├── OcrStrategy.kt           — 策略接口
├── PpOcrV5Strategy.kt       — v5 策略实现
└── OcrStrategyFactory.kt    — 策略工厂
```

### 3.2 DetectionRequest — 标准输入

```kotlin
package com.yyt.dama.ocr

import android.graphics.Bitmap
import com.yyt.dama.feature.idcard.CardOrientation
import com.yyt.dama.feature.idcard.CardSide

/**
 * 检测请求 — 界面层构建此对象传入 Facade。
 *
 * 所有字段都有默认值，调用方只需提供必要参数。
 */
data class DetectionRequest(
    val bitmap: Bitmap,
    val side: CardSide = CardSide.FRONT,
    val orientation: CardOrientation = CardOrientation.LANDSCAPE,
    /** 搜索区扩展比例，null 表示使用策略默认值 */
    val searchPadding: Float? = null,
    /** 最终打码区扩展比例，null 表示使用策略默认值 */
    val finalExpand: Float? = null,
    /** 是否生成调试可视化图 */
    val debug: Boolean = false,
)
```

### 3.3 DetectionResult — 标准输出

```kotlin
package com.yyt.dama.ocr

import android.graphics.Bitmap
import android.graphics.Rect

/**
 * 检测结果 — Facade 返回给界面层的标准输出。
 *
 * [bitmap] 是原始图片引用（未被修改，调用方负责回收）。
 * [regions] 是检测到的打码区域（原图坐标）。
 * [debugBitmap] 仅在 request.debug=true 时非空。
 */
data class DetectionResult(
    val bitmap: Bitmap,
    val regions: List<Rect>,
    val debugBitmap: Bitmap? = null,
)
```

### 3.4 OcrFacade — 门面接口

```kotlin
package com.yyt.dama.ocr

/**
 * OCR 检测门面 — 界面层的唯一入口。
 *
 * 调用方不关心：
 * - 用了哪个模型
 * - 预处理/后处理怎么做的
 * - 中间有几层
 *
 * 只需：传入 [DetectionRequest] → 拿回 [DetectionResult]。
 *
 * 实现类 [OcrFacadeImpl] 负责读取用户选择的模型、
 * 选取对应策略、编排完整流程。
 */
interface OcrFacade {
    fun detect(request: DetectionRequest): DetectionResult
}
```

### 3.5 OcrStrategy — 策略接口

```kotlin
package com.yyt.dama.ocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect

/**
 * OCR 检测策略 — 每个模型实现一套完整流程。
 *
 * 一个策略封装了该模型的：
 * - 模型加载与 ONNX session 管理
 * - 预处理（resize、归一化、通道顺序）
 * - 推理
 * - 后处理（二值化、连通域、框合并）
 *
 * 策略实现可以是 Closeable 的，支持 session 复用。
 */
interface OcrStrategy {

    /**
     * 对完整图片做检测，返回文本框列表。
     *
     * @param bitmap 原始图片
     * @return 文本框列表（原图坐标）
     */
    fun detect(bitmap: Bitmap): List<Rect>

    /**
     * 对图片的指定区域做检测，返回文本框列表（原图坐标）。
     *
     * @param bitmap 完整原图
     * @param region 需要检测的区域（原图坐标）
     * @return 区域内的文本框列表（原图坐标）
     */
    fun detectInRegion(bitmap: Bitmap, region: Rect): List<Rect>

    /** 释放资源（ONNX session 等） */
    fun close()
}
```

### 3.6 PpOcrV5Strategy — v5 策略实现（从现有 OcrDetector 迁移）

```kotlin
package com.yyt.dama.ocr

import ai.onnxruntime.*
import android.content.Context
import android.graphics.*
import androidx.core.graphics.scale
import java.nio.FloatBuffer
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * PP-OCRv5 检测策略。
 *
 * 完整封装 v5 模型的：
 * - 模型加载: assets/models/Paddle/det_v5.onnx
 * - 预处理: maxSide=960, 对齐32, BGR 通道, ImageNet 归一化
 * - 后处理: 阈值0.3, 3x3膨胀, 8连通 floodfill, 框合并
 */
class PpOcrV5Strategy(context: Context) : OcrStrategy {

    private val env = OrtEnvironment.getEnvironment()
    private val session: OrtSession

    // 预处理参数
    private val maxSide = 960
    private val alignMultiple = 32
    private val mean = floatArrayOf(0.406f, 0.456f, 0.485f)
    private val std = floatArrayOf(0.225f, 0.224f, 0.229f)

    // 后处理参数
    private val binThresh = 0.3f
    private val scoreThresh = 0.3f

    init {
        val modelBytes = context.assets.open("models/Paddle/det_v5.onnx").readBytes()
        OrtSession.SessionOptions().use { options ->
            options.setIntraOpNumThreads(4)
            options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            session = env.createSession(modelBytes, options)
        }
    }

    override fun detect(bitmap: Bitmap): List<Rect> {
        // ... 现有 OcrDetector.detect() 逻辑迁移 ...
    }

    override fun detectInRegion(bitmap: Bitmap, region: Rect): List<Rect> {
        // ... 现有 OcrDetector.detectInRegion() 逻辑迁移 ...
    }

    private fun preprocess(bitmap: Bitmap): PreprocessResult {
        // ... 现有 OcrDetector.preprocess() 逻辑迁移 ...
    }

    private fun postprocess(prob: FloatArray, h: Int, w: Int, pre: PreprocessResult): List<Rect> {
        // ... 现有 OcrDetector.postprocess() 逻辑迁移 ...
    }

    // ... dilate3x3, computeBoxScore, mergeNearbyBoxes 等私有方法迁移 ...

    override fun close() {
        session.close()
    }
}
```

### 3.7 OcrStrategyFactory — 策略工厂

```kotlin
package com.yyt.dama.ocr

import android.content.Context
import com.yyt.dama.data.SettingsRepository

/**
 * 根据用户设置的模型选项创建对应策略实例。
 */
object OcrStrategyFactory {

    fun create(context: Context): OcrStrategy {
        val modelOption = SettingsRepository(context).loadOcrModelOption()
        return when (modelOption) {
            OcrModelOption.PP_OCR_V5 -> PpOcrV5Strategy(context)
            // 未来新增：
            // OcrModelOption.PP_OCR_V3 -> PpOcrV3Strategy(context)
        }
    }
}
```

### 3.8 OcrFacadeImpl — 门面实现

```kotlin
package com.yyt.dama.ocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import com.yyt.dama.engine.TemplateDebugVisualizer
import com.yyt.dama.feature.idcard.CardOrientation
import com.yyt.dama.feature.idcard.CardSide
import com.yyt.dama.feature.idcard.templateFor
import com.yyt.dama.feature.idcard.toRect
import com.yyt.dama.engine.expandOcrBoxes  // 从 DetectionEngine 提取为公共
import com.yyt.dama.engine.expandRegion     // 从 DetectionEngine 提取为公共
import kotlin.math.max
import kotlin.math.min

/**
 * OcrFacade 实现 — 编排完整检测流程。
 *
 * 流程：
 *   1. 通过工厂创建策略（根据用户选择的模型）
 *   2. 获取模板字段区域
 *   3. 对每个字段区域做策略检测
 *   4. 后处理（box 扩展、兜底）
 *   5. （可选）生成调试图
 *   6. 返回标准结果
 *
 * 内部管理策略生命周期（try/finally close）。
 */
class OcrFacadeImpl(
    private val context: Context
) : OcrFacade {

    override fun detect(request: DetectionRequest): DetectionResult {
        val bitmap = request.bitmap
        val imgW = bitmap.width
        val imgH = bitmap.height

        val textFields = templateFor(request.orientation, request.side)
            .filter { !it.isDashed }

        val searchPadding = request.searchPadding ?: 0.2f
        val finalExpand = request.finalExpand ?: 0.2f

        val allRegions = mutableListOf<Rect>()
        val allRawBoxes = mutableListOf<Rect>()

        val strategy = OcrStrategyFactory.create(context)
        try {
            for (field in textFields) {
                val region = field.toRect(imgW, imgH)
                val searchZone = expandRegion(region, imgW, imgH, searchPadding)

                val boxes = strategy.detectInRegion(bitmap, searchZone)
                allRawBoxes.addAll(boxes)

                val expanded = expandOcrBoxes(boxes, bitmap, finalExpand)

                if (expanded.isEmpty()) {
                    // 兜底：OCR 无结果时使用模板区域
                    val padX = (region.width() * 0.15f).toInt().coerceAtLeast(4)
                    val padY = (region.height() * 0.15f).toInt().coerceAtLeast(4)
                    allRegions.add(Rect(
                        max(0, region.left - padX),
                        max(0, region.top - padY),
                        min(imgW, region.right + padX),
                        min(imgH, region.bottom + padY)
                    ))
                } else {
                    allRegions.addAll(expanded)
                }
            }
        } finally {
            strategy.close()
        }

        val debugBitmap = if (request.debug) {
            TemplateDebugVisualizer.visualize(
                bitmap, request.orientation, request.side,
                searchPadding, allRawBoxes, allRegions
            )
        } else null

        return DetectionResult(
            bitmap = bitmap,
            regions = allRegions,
            debugBitmap = debugBitmap
        )
    }
}
```

---

## 四、界面层改造前后对比

### 4.1 IdCardCameraScreen — 改造前

```kotlin
// 当前：界面层需要编排大量实现细节
onConfirm = {
    showPreview = false
    isProcessing = true
    scope.launch {
        try {
            val regions = withContext(Dispatchers.IO) {
                runTemplateDetection(context, bmp, side = capturedSide)  // ← 直接调底层
            }
            isProcessing = false
            previewBitmap = null
            onDetectionDone(bmp, regions)
        } catch (e: Exception) {
            Log.e(TAG, "识别失败", e)
            isProcessing = false
            bmp.recycle()
            previewBitmap = null
            scope.launch { errorEvents.emit(...) }
        }
    }
}
```

### 4.2 IdCardCameraScreen — 改造后

```kotlin
// 改造后：只管传图片、传参数、拿结果
onConfirm = {
    showPreview = false
    isProcessing = true
    scope.launch {
        try {
            val result = withContext(Dispatchers.IO) {
                OcrFacadeImpl(context).detect(
                    DetectionRequest(bitmap = bmp, side = capturedSide)
                )
            }
            isProcessing = false
            previewBitmap = null
            onDetectionDone(result.bitmap, result.regions)
        } catch (e: Exception) {
            Log.e(TAG, "识别失败", e)
            isProcessing = false
            bmp.recycle()
            previewBitmap = null
            scope.launch { errorEvents.emit(...) }
        }
    }
}
```

> 改造点：`runTemplateDetection(context, bmp, side = capturedSide)` → `OcrFacadeImpl(context).detect(DetectionRequest(bitmap = bmp, side = capturedSide))`

### 4.3 HomeViewModel — 改造后

```kotlin
// 改造前
val regions = withContext(Dispatchers.IO) {
    runTemplateDetection(ctx, bitmap)
}

val debugBitmap = withContext(Dispatchers.IO) {
    TemplateDebugVisualizer.runDebugDetection(ctx, bitmap)
}

// 改造后
val result = withContext(Dispatchers.IO) {
    OcrFacadeImpl(ctx).detect(DetectionRequest(bitmap = bitmap))
}

// 调试模式也走同一个入口
val debugResult = withContext(Dispatchers.IO) {
    OcrFacadeImpl(ctx).detect(DetectionRequest(bitmap = bitmap, debug = true))
}
// debugResult.debugBitmap 即为调试图
```

### 4.4 IdCardEditScreen — 改造后

```kotlin
// 改造前（需要传 cardOffsetY, screenW, cardH, orientation 等裁剪参数）
val (cropped, regions) = withContext(Dispatchers.IO) {
    runDetection(context, bmp, cardOffsetY, screenW, cardH, orientation)
}

// 改造后
// 方案 A：Edit 场景先自行裁剪 bitmap，再传入 Facade
val cropped = cropBitmap(bmp, cardOffsetY, screenW, cardH)  // 界面层自己裁
val result = withContext(Dispatchers.IO) {
    OcrFacadeImpl(context).detect(
        DetectionRequest(bitmap = cropped, orientation = orientation)
    )
}
// result.bitmap = cropped, result.regions = 检测到的打码区域
```

> **注意**：`runDetection` 当前包含「根据 overlay 位置裁剪原图」的逻辑，这属于界面层职责（裁剪参数来自 UI 布局），应留在界面层或提取为独立的裁剪工具函数，不放入 Facade。

### 4.5 ResultScreen — 打码渲染也可纳入 Facade（可选）

当前 `ResultScreen` 自行调 `MosaicEngine.applyMosaic`。如果要让界面层完全不关心打码细节，可以在 `DetectionRequest` 中增加打码参数，Facade 直接返回打码后的图片：

```kotlin
// 可选扩展：DetectionRequest 增加打码选项
data class DetectionRequest(
    val bitmap: Bitmap,
    val side: CardSide = CardSide.FRONT,
    val orientation: CardOrientation = CardOrientation.LANDSCAPE,
    val mosaicStyle: MosaicStyle? = null,  // null = 只检测不打码
    val debug: Boolean = false,
)

// DetectionResult 增加打码图片
data class DetectionResult(
    val bitmap: Bitmap,           // 原图
    val regions: List<Rect>,      // 检测区域
    val mosaicBitmap: Bitmap? = null,  // 打码后图片（mosaicStyle != null 时）
    val debugBitmap: Bitmap? = null,
)
```

这样界面层连打码都不用管：

```kotlin
val result = facade.detect(DetectionRequest(
    bitmap = bmp,
    side = capturedSide,
    mosaicStyle = currentMosaicStyle,
))
// result.mosaicBitmap 就是最终打码后的图片，直接展示
```

> 是否将打码纳入 Facade 取决于团队偏好。如果 ResultScreen 需要实时切换打码风格（不重新检测），则打码应留在界面层。

---

## 五、改造步骤

### 阶段一：建立 ocr 包骨架（不改动现有代码）

| 步骤 | 文件 | 内容 |
|------|------|------|
| 1 | `ocr/DetectionRequest.kt` | 新建标准输入数据类 |
| 2 | `ocr/DetectionResult.kt` | 新建标准输出数据类 |
| 3 | `ocr/OcrFacade.kt` | 新建门面接口 |
| 4 | `ocr/OcrStrategy.kt` | 新建策略接口 |

### 阶段二：迁移 v5 策略（从 OcrDetector 提取）

| 步骤 | 文件 | 内容 |
|------|------|------|
| 5 | `ocr/PpOcrV5Strategy.kt` | 将 `OcrDetector` 的全部逻辑迁移为实现 `OcrStrategy` 的类 |
| 6 | `ocr/OcrStrategyFactory.kt` | 根据 `OcrModelOption` 创建对应策略 |

### 阶段三：实现门面（从 DetectionEngine 提取）

| 步骤 | 文件 | 内容 |
|------|------|------|
| 7 | `ocr/OcrFacadeImpl.kt` | 将 `runTemplateDetection` 的编排逻辑迁移到 `detect()` |
| 8 | `engine/DetectionEngine.kt` | 将 `expandOcrBoxes`、`expandRegion` 提取为公共或 internal 函数供 Facade 调用 |

### 阶段四：切换调用方（逐个替换，保持可回退）

| 步骤 | 文件 | 改造内容 |
|------|------|----------|
| 9 | `IdCardCameraScreen.kt:311` | `runTemplateDetection(...)` → `OcrFacadeImpl(context).detect(DetectionRequest(...))` |
| 10 | `HomeViewModel.kt:67` | 同上 |
| 11 | `HomeViewModel.kt:116` | `TemplateDebugVisualizer.runDebugDetection(...)` → `facade.detect(DetectionRequest(..., debug = true))` |
| 12 | `IdCardEditScreen.kt:414` | 先提取裁剪逻辑为独立函数，再调 Facade |

### 阶段五：清理旧代码

| 步骤 | 文件 | 内容 |
|------|------|------|
| 13 | `engine/OcrDetector.kt` | 删除（逻辑已迁移到 `PpOcrV5Strategy`） |
| 14 | `engine/DetectionEngine.kt` | 删除或保留为薄封装（内部委托给 Facade） |
| 15 | `engine/OcrModelOption.kt` | 移入 `ocr` 包或保留原位（策略工厂引用即可） |
| 16 | `engine/TemplateDebugVisualizer.kt` | 保留 `visualize()` 方法供 Facade 调用，删除 `runDebugDetection()` |

---

## 六、文件清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `ocr/DetectionRequest.kt` | 标准输入 |
| `ocr/DetectionResult.kt` | 标准输出 |
| `ocr/OcrFacade.kt` | 门面接口 |
| `ocr/OcrFacadeImpl.kt` | 门面实现（编排完整流程） |
| `ocr/OcrStrategy.kt` | 策略接口 |
| `ocr/PpOcrV5Strategy.kt` | v5 策略实现（从 OcrDetector 迁移） |
| `ocr/OcrStrategyFactory.kt` | 策略工厂 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `IdCardCameraScreen.kt` | 调用方改为 Facade |
| `IdCardEditScreen.kt` | 裁剪逻辑提取 + 调用方改为 Facade |
| `HomeViewModel.kt` | 调用方改为 Facade |
| `DetectionEngine.kt` | `expandOcrBoxes`/`expandRegion` 提取为公共函数，或整体删除 |
| `TemplateDebugVisualizer.kt` | 删除 `runDebugDetection()`，保留 `visualize()` |

### 删除文件

| 文件 | 原因 |
|------|------|
| `OcrDetector.kt` | 逻辑迁移到 `PpOcrV5Strategy` |

---

## 七、注意事项

### 7.1 策略生命周期

当前 `OcrDetector` 每次检测都 new + close。策略层同样如此——`OcrFacadeImpl.detect()` 内部创建策略并 close。

如果未来需要 session 复用（多次检测共享一个 session），可以让 `OcrFacadeImpl` 持有策略实例，在模型切换时才 close 旧策略、创建新策略。但这需要处理线程安全和内存管理，建议作为后续优化。

### 7.2 裁剪逻辑归属

`runDetection()` 中的「根据 overlay 位置裁剪原图」逻辑来自 UI 布局参数（`cardOffsetY`、`screenW`、`cardH`），属于界面层职责，不应放入 Facade。改造时提取为独立的裁剪工具函数，由界面层调用。

### 7.3 双面检测

`runDualSideDetection()` 的逻辑是「分别检测正反面 + 纵向拼接」。改造后界面层调用两次 Facade：

```kotlin
val frontResult = facade.detect(DetectionRequest(frontBitmap, side = CardSide.FRONT))
val backResult = facade.detect(DetectionRequest(backBitmap, side = CardSide.BACK))
// 拼接由界面层或独立的拼接工具处理
```

### 7.4 调试可视化

`TemplateDebugVisualizer.runDebugDetection()` 内部重复了 `runTemplateDetection` 的全部逻辑。改造后调试模式通过 `DetectionRequest(debug = true)` 走同一个 Facade 入口，Facade 内部调用 `TemplateDebugVisualizer.visualize()` 生成调试图，消除逻辑重复。

### 7.5 渐进式迁移

改造可逐个调用点替换，每替换一个就可以测试，不需要一次性全改。旧代码在所有调用点切换完成后再删除。

### 7.6 依赖注入（可选）

当前用 `OcrFacadeImpl(context)` 直接实例化。如果项目后续引入 DI 框架（如 Hilt），可将 `OcrFacade` 注册为接口注入，界面层连 `context` 都不用管。

---

## 八、任务清单与执行进度

> 本节由任务拆解生成，用于对照执行与下次续作。任务同步登记于 WorkBuddy TaskList（`D:\yyt_code\github_repos\Just_Vibe_Coding\localdama-android-apk`）。
>
> 进度标记：✅ 已完成 · 🔄 进行中 · ⬜ 待执行

### 8.1 决策结论

| # | 决策点 | 结论 | 理由 |
|---|--------|------|------|
| 1 | OcrModelOption 归位 | 移入 `ocr/` 包 | 解耦要彻底，包自包含；data 层依赖纯枚举合理（持久化用户对 OCR 模型的偏好） |
| 2 | 打码是否纳入 Facade | **不纳入** | OCR 重操作（ONNX 推理）与打码轻操作（像素渲染）分离；ResultScreen 需支持实时切换打码风格而无需重跑检测 |
| 3 | 双面检测拼接 | **界面层处理 + 独立工具** | Facade 保持单图检测契约；拼接属 UI 职责；提取 `BitmapConcatUtil` 处理 Y 轴偏移 |

### 8.2 任务清单

#### 阶段一 · 建立 ocr 包骨架（不改动现有代码）

| # | 状态 | 文件 | 内容 | 依赖 |
|---|------|------|------|------|
| 1 | ✅ | `ocr/DetectionRequest.kt` | 标准输入：bitmap + side + orientation + searchPadding/finalExpand/debug | — |
| 2 | ✅ | `ocr/DetectionResult.kt` | 标准输出：bitmap + regions + debugBitmap? | — |
| 3 | ✅ | `ocr/OcrFacade.kt` | 门面接口：detect(request): DetectionResult | — |
| 4 | ✅ | `ocr/OcrStrategy.kt` | 策略接口：detect / detectInRegion / close | — |

#### 阶段二 · 迁移 v5 策略（从 OcrDetector 提取）

| # | 状态 | 文件 | 内容 | 依赖 |
|---|------|------|------|------|
| 5 | ✅ | `ocr/PpOcrV5Strategy.kt` | 迁移 OcrDetector 全部逻辑为实现 OcrStrategy（init/preprocess/postprocess/dilate3x3/computeBoxScore/mergeNearbyBoxes） | #4 |
| 6 | ✅ | `ocr/OcrStrategyFactory.kt` | 按 OcrModelOption 分发策略（PP_OCR_V5 → PpOcrV5Strategy，预留 V3） | #5 |

#### 阶段三 · 实现门面（从 DetectionEngine 提取）

| # | 状态 | 文件 | 内容 | 依赖 |
|---|------|------|------|------|
| 7 | ✅ | `ocr/OcrFacadeImpl.kt` | 编排完整流程：工厂建策略 → 模板字段 → detectInRegion → expandOcrBoxes → 兜底 → debug 可视化 | #1 #2 #3 #6 #8 |
| 8 | ✅ | `engine/DetectionEngine.kt` | 提取 expandOcrBoxes / expandRegion 为 public 函数，保持签名不变 | — |
| 18 | ✅ | `util/BitmapConcatUtil.kt` | 双面拼接工具：concatVertically + concatVerticallyWithRegions（含 back regions Y 轴偏移） | — |

#### 阶段四 · 切换调用方（逐个替换，保持可回退）

| # | 状态 | 文件 | 改造内容 | 依赖 |
|---|------|------|----------|------|
| 9 | ✅ | `IdCardCameraScreen.kt:311` | runTemplateDetection → facade.detect(DetectionRequest) | #7 |
| 10 | ✅ | `HomeViewModel.kt:67` | 常规检测切换到 facade.detect | #7 |
| 11 | ✅ | `HomeViewModel.kt:116` | runDebugDetection → facade.detect(debug=true) | #7 |
| 12 | ✅ | `IdCardEditScreen.kt:414` | 提取裁剪逻辑为独立函数 + facade.detect | #7 |

#### 阶段五 · 清理旧代码

| # | 状态 | 文件 | 内容 | 依赖 |
|---|------|------|------|------|
| 13 | ✅ | `engine/OcrDetector.kt` | 删除（逻辑已迁移到 PpOcrV5Strategy） | #9 #10 #11 #12 |
| 14 | ✅ | `engine/DetectionEngine.kt` | 无调用方则删除；有调用方则改薄封装委托 Facade | #9 #10 #11 #12 |
| 15 | ✅ | `engine/OcrModelOption.kt` → `ocr/` | 移入 ocr 包，更新 SettingsRepository/工厂等所有 import | #6 |
| 16 | ✅ | `engine/TemplateDebugVisualizer.kt` | 保留 visualize()，删除 runDebugDetection() | #11 |

#### 验证

| # | 状态 | 内容 | 依赖 |
|---|------|------|------|
| 17 | ⬜ | 全流程回归：拍照/相册/编辑/双面（含 regions 偏移）/模型切换/异常路径 — 打码区域与改造前一致，性能无退化 | #13 #14 #16 |

### 8.3 关键路径

```
#4 → #5 → #6 → #8 → #7 → (#9 / #10 / #11 / #12) → (#13 / #14 / #15 / #16) → #17
```

### 8.4 已完成工作记录

- **阶段一（#1-#4）**：在 `app/src/main/java/com/yyt/dama/ocr/` 下新建 4 个文件，定义标准输入 `DetectionRequest`、标准输出 `DetectionResult`、门面接口 `OcrFacade`、策略接口 `OcrStrategy`。未改动任何现有代码。`CardSide` / `CardOrientation` 复用自 `com.yyt.dama.feature.idcard`（IdCardTemplate.kt）。
- **阶段二（#5-#6）**：新建 `PpOcrV5Strategy.kt`（迁移 OcrDetector 全部算法逻辑，参数硬编码为 V5 专用，所有关键函数加 KDoc 注释）和 `OcrStrategyFactory.kt`（读 SettingsRepository 分发策略）。`./gradlew :app:compileDebugKotlin` 编译通过（BUILD SUCCESSFUL）。设计决策：策略硬编码参数自包含，不依赖 engine.OcrModelOption；工厂临时 import engine.OcrModelOption，阶段五-15 移包后改同包引用。
- **阶段三（#7-#8, #18）**：①`DetectionEngine.kt` 的 `expandOcrBoxes`/`expandRegion` 从 `private` 改为 `public`（加注释说明已公开供 Facade 调用）；②新建 `util/BitmapConcatUtil.kt`（双面拼接工具，从 runDualSideDetection 提取，含 `concatVertically` + `concatVerticallyWithRegions` 带 regions Y 轴偏移）；③新建 `ocr/OcrFacadeImpl.kt`（迁移 runTemplateDetection 编排逻辑，统一常规+调试入口，try/finally 管理策略生命周期）。发现 `TemplateDebugVisualizer` 内部有 `expandRawBoxes`/`expandRegionPublic` 重复实现，阶段五-16 清理时统一。`./gradlew :app:compileDebugKotlin` 编译通过（BUILD SUCCESSFUL in 4s）。
- **阶段四（#9-12）**：4 个调用点切换到 Facade。①`IdCardCameraScreen`：`runTemplateDetection` → `facade.detect(DetectionRequest)`；②`HomeViewModel` 常规检测：同上；③`HomeViewModel` 调试检测：`runDebugDetection` → `facade.detect(debug=true)`，用 `result.debugBitmap!!`；④`IdCardEditScreen`：提取裁剪逻辑为 `cropCardRegion` 私有函数（属界面层职责），先裁剪再调 Facade。**注意**：#12 检测逻辑从"全图+overlapRatio过滤"改为"Facade模板驱动区域检测"，后者更精准（按字段检测+兜底），打码区域可能略有变化。`./gradlew :app:compileDebugKotlin` 编译通过（BUILD SUCCESSFUL in 8s）。
- **阶段五（#13-16）**：清理旧代码。①删除 `engine/OcrDetector.kt`（逻辑已迁移到 PpOcrV5Strategy）；②`engine/DetectionEngine.kt` 重写——删除 4 个已无调用方的函数（runDetection/runFullImageDetection/runDualSideDetection/runTemplateDetection），仅保留 public 的 `expandOcrBoxes`/`expandRegion`；③`engine/TemplateDebugVisualizer.kt` 重写——删除 `runDebugDetection()` + 重复的 `expandRawBoxes`/`expandRegionPublic`，`visualize()` 改用公共 `expandRegion`；④`OcrModelOption` 从 `engine` 移入 `ocr` 包，更新 4 处 import（SettingsRepository/SettingsViewModel/SettingsScreen/OcrStrategyFactory）。`./gradlew :app:compileDebugKotlin` 编译通过（BUILD SUCCESSFUL in 6s）。**至此 5 个阶段全部完成，仅剩 #17 全流程回归验证。**
