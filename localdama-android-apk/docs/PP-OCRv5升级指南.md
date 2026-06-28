## PP-OCRv5 替换 v3 操作指南 — Dama Android 项目

### 一、当前状况分析

经过完整分析你的项目代码和下载的资源，关键发现如下：

你的 Android 项目 (`localdama-android-apk`) 使用的是 **ONNX Runtime**（而非 Paddle Lite），核心 OCR 代码在 `OcrDetector.kt` 中，通过加载 `det_v3.onnx` 模型实现**文本区域检测**（只定位文本位置，不识别文字内容），用于身份证敏感信息自动打码。

你的两个 tar 模型包是 **PaddlePaddle PIR 格式**（包含 `inference.json` + `inference.pdiparams` + `inference.yml`），不能直接用于 ONNX Runtime，需要先转换格式。

你下载的 `Paddle-Lite-Demo-develop` 和 `ocr/src` 是 Paddle Lite C++ 部署的参考实现，如果你继续使用 ONNX Runtime，则不需要引入这些 C++ 代码。

### 二、推荐方案：转换模型为 ONNX 后直接替换

这是改动最小的方案，保持现有 ONNX Runtime 架构不变。

---

#### 第 1 步：搭建 Python 转换环境

在你的 Windows 电脑上打开命令行（CMD 或 PowerShell），安装以下工具：

```bash
# 建议 Python 3.10+
pip install paddlepaddle==3.0.0
pip install paddle2onnx==2.0.2rc1
```

> 注意：PP-OCRv5 模型使用 PIR 格式（`inference.json`），需要 paddle2onnx 2.0 以上版本才能正确处理。旧版 paddle2onnx（如 1.0.x）只支持 `.pdmodel` 格式，会报错。

#### 第 2 步：转换检测模型（det）

```bash
paddle2onnx \
  --model_dir "C:\Users\yyt0111\.qoderworkcn\workspace\mq16nbejle00h0zp\v5_models\PP-OCRv5_mobile_det_infer" \
  --model_filename inference.json \
  --params_filename inference.pdiparams \
  --save_file "C:\Users\yyt0111\.qoderworkcn\workspace\mq16nbejle00h0zp\v5_models\det_v5.onnx" \
  --opset_version 14
```

如果上述命令报 PIR 相关错误，需要先通过 PaddlePaddle 重新导出为标准推理格式：

```python
import paddle

# 加载 PIR 格式模型
model = paddle.jit.load(
    "C:/Users/yyt0111/.qoderworkcn/workspace/mq16nbejle00h0zp/v5_models/PP-OCRv5_mobile_det_infer/inference"
)

# 重新导出为 pdmodel 格式
paddle.jit.save(
    model,
    "C:/Users/yyt0111/.qoderworkcn/workspace/mq16nbejle00h0zp/v5_models/PP-OCRv5_mobile_det_infer/model",
    input_spec=[paddle.static.InputSpec(shape=[1, 3, -1, -1], dtype='float32')]
)
```

然后再用 paddle2onnx 转换：

```bash
paddle2onnx \
  --model_dir "C:\Users\yyt0111\.qoderworkcn\workspace\mq16nbejle00h0zp\v5_models\PP-OCRv5_mobile_det_infer" \
  --model_filename model.pdmodel \
  --params_filename model.pdiparams \
  --save_file "C:\Users\yyt0111\.qoderworkcn\workspace\mq16nbejle00h0zp\v5_models\det_v5.onnx" \
  --opset_version 14
```

#### 第 3 步：转换识别模型（rec）— 可选

```bash
paddle2onnx \
  --model_dir "C:\Users\yyt0111\.qoderworkcn\workspace\mq16nbejle00h0zp\v5_models\PP-OCRv5_mobile_rec_infer" \
  --model_filename inference.json \
  --params_filename inference.pdiparams \
  --save_file "C:\Users\yyt0111\.qoderworkcn\workspace\mq16nbejle00h0zp\v5_models\rec_v5.onnx" \
  --opset_version 14
```

> 识别模型输入固定为 [1, 3, 48, 320]，输出 shape 为 [1, seq_len, 18385]。

#### 第 4 步：将 ONNX 模型放入项目

将转换得到的 `det_v5.onnx` 复制到：
```
D:\yyt_code\github_repos\Just_Vibe_Coding\localdama-android-apk\app\src\main\assets\models\det_v5.onnx
```

如果有识别模型 `rec_v5.onnx`，同样放入：
```
D:\yyt_code\github_repos\Just_Vibe_Coding\localdama-android-apk\app\src\main\assets\models\rec_v5.onnx
```

---

### 三、代码修改

#### 3.1 仅替换检测模型（最小改动）

修改 `OcrDetector.kt` 中的模型路径：

```kotlin
// 原来：
val modelBytes = context.assets.open("models/det_v3.onnx").readBytes()

// 改为：
val modelBytes = context.assets.open("models/det_v5.onnx").readBytes()
```

PP-OCRv5 det 的预处理参数（归一化）与 v3 一致（ImageNet 均值/标准差），所以 `preprocess` 函数无需修改。

**后处理参数建议调整**（根据 v5 官方配置 `inference.yml`）：

| 参数 | v3 当前值 | v5 官方值 | 是否必须改 |
|------|-----------|-----------|-----------|
| `thresh`（二值化阈值） | 0.3 | 0.3 | 不用改 |
| `box_thresh`（框置信度阈值） | 0.5 | 0.6 | 建议改为 0.6 |
| `unclip_ratio`（膨胀比） | 未使用 | 1.5 | 不涉及 |
| 最终宽高最小值 | 30x20 | — | 保持不变 |
| 长宽比阈值 | 1.4 | — | 保持不变 |

修改 `OcrDetector.kt` 第 169 行附近：

```kotlin
// 原来：
if (rw > 15 && rh > 15 && score > 0.5f) {

// 建议改为：
if (rw > 15 && rh > 15 && score > 0.6f) {
```

#### 3.2 如果需要增加文字识别功能（进阶改动）

你的项目目前只做文本区域检测（用于打码），不做文字内容识别。如果你确实需要识别出文字内容，需要新增以下模块：

**A) 新建 `OcrRecognizer.kt`：**

```kotlin
package com.yyt.dama.engine

import ai.onnxruntime.*
import android.content.Context
import android.graphics.Bitmap
import java.nio.FloatBuffer

class OcrRecognizer(context: Context) {

    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private val session: OrtSession
    private val dictionary: List<String>

    init {
        val modelBytes = context.assets.open("models/rec_v5.onnx").readBytes()
        val options = OrtSession.SessionOptions()
        options.setIntraOpNumThreads(4)
        options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
        session = env.createSession(modelBytes, options)

        // 加载 v5 字典（从 inference.yml 中提取的 character_dict）
        dictionary = context.assets.open("models/ppocr_v5_dict.txt").readLines()
    }

    fun recognize(bitmap: Bitmap): Pair<String, Float> {
        val inputH = 48  // v5 识别模型输入高度（v3 是 32）
        val inputW = 320

        val resized = Bitmap.createScaledBitmap(bitmap, inputW, inputH, true)
        val floatBuffer = FloatBuffer.allocate(1 * 3 * inputH * inputW)
        val pixels = IntArray(inputW * inputH)
        resized.getPixels(pixels, 0, inputW, 0, 0, inputW, inputH)

        // v5 识别模型归一化参数：mean=0.5, std=0.5
        for (p in pixels) {
            val b = ((p and 0xFF) / 255.0f - 0.5f) / 0.5f
            val g = (((p shr 8) and 0xFF) / 255.0f - 0.5f) / 0.5f
            val r = (((p shr 16) and 0xFF) / 255.0f - 0.5f) / 0.5f
            floatBuffer.put(b)
            floatBuffer.put(g)
            floatBuffer.put(r)
        }
        floatBuffer.rewind()

        val shape = longArrayOf(1, 3, inputH.toLong(), inputW.toLong())
        val inputName = session.inputNames.iterator().next()
        val tensor = OnnxTensor.createTensor(env, floatBuffer, shape)

        val result = session.run(mapOf(inputName to tensor))
        val output = result.get(session.outputNames.iterator().next()).get() as OnnxTensor

        // CTC 贪心解码
        val outputArray = output.floatBuffer.array()
        val outputShape = output.info.shape  // [1, seq_len, dict_size]
        val seqLen = outputShape[1].toInt()
        val dictSize = outputShape[2].toInt()

        val sb = StringBuilder()
        var totalConf = 0f
        var charCount = 0
        var lastIdx = 0  // 0 = CTC blank

        for (t in 0 until seqLen) {
            var maxIdx = 0
            var maxVal = Float.NEGATIVE_INFINITY
            for (c in 0 until dictSize) {
                val v = outputArray[t * dictSize + c]
                if (v > maxVal) { maxVal = v; maxIdx = c }
            }
            if (maxIdx != 0 && maxIdx != lastIdx) {
                if (maxIdx < dictionary.size) {
                    sb.append(dictionary[maxIdx])
                }
                totalConf += maxVal
                charCount++
            }
            lastIdx = maxIdx
        }

        result.close()
        val avgConf = if (charCount > 0) totalConf / charCount else 0f
        return Pair(sb.toString(), avgConf)
    }

    fun close() {
        session.close()
    }
}
```

**B) 准备 v5 字典文件：**

从 `PP-OCRv5_mobile_rec_infer/inference.yml` 中提取 `character_dict` 列表，保存为文本文件（每行一个字），放入：
```
app/src/main/assets/models/ppocr_v5_dict.txt
```

注意：需要在字典**开头**插入一个空行（对应 CTC 的 blank 索引 0），在**末尾**添加一个空格行。

**C) 在检测流程中调用识别：**

```kotlin
// 在 DetectionEngine.kt 或调用 OcrDetector 的地方：
val detector = OcrDetector(context)
val boxes = detector.detect(bitmap)
detector.close()

val recognizer = OcrRecognizer(context)
for (box in boxes) {
    // 从原图裁剪出文本区域
    val textRegion = Bitmap.createBitmap(bitmap, box.left, box.top, box.width(), box.height())
    val (text, confidence) = recognizer.recognize(textRegion)
    Log.d("OCR", "识别结果: '$text', 置信度: $confidence")
    textRegion.recycle()
}
recognizer.close()
```

---

### 四、Paddle-Lite-Demo 和 ocr/src 的作用

你下载的 `Paddle-Lite-Demo-develop` 和 `ocr/src` 是 **Paddle Lite C++ 部署方案**的参考代码。它们使用的推理引擎是 Paddle Lite（需要 `.nb` 格式模型），而你的项目使用 ONNX Runtime。

这两种方案的关系：

| 对比项 | 你当前项目 | Paddle-Lite-Demo |
|--------|-----------|-----------------|
| 推理引擎 | ONNX Runtime | Paddle Lite |
| 模型格式 | .onnx | .nb (NaiveBuffer) |
| 编程语言 | Kotlin (JNI by ONNX SDK) | C++ (JNI by 自建) |
| 模型转换 | paddle2onnx | OPT 工具 |
| 部署复杂度 | 低（直接替换模型文件） | 高（引入整套 C++ 工程） |

**如果你想切换到 Paddle Lite**，需要做大量工作：引入 Paddle Lite 的 `.so` 库和 `.jar`，将 C++ 源码通过 JNI 桥接到 Kotlin，用 OPT 工具把模型转成 `.nb` 格式。这会大幅增加项目复杂度，除非你对移动端推理性能有极致要求，否则不推荐。

**推荐方案**是继续使用 ONNX Runtime，只需要将 PP-OCRv5 模型转成 ONNX 格式后替换即可。

---

### 五、操作步骤总结

**最小替换（只换检测模型）：**

1. 安装 `paddlepaddle==3.0.0` + `paddle2onnx==2.0.2rc1`
2. 用 paddle2onnx 将 `PP-OCRv5_mobile_det_infer` 转为 `det_v5.onnx`
3. 将 `det_v5.onnx` 放入 `app/src/main/assets/models/`
4. 修改 `OcrDetector.kt` 中的模型路径 `det_v3.onnx` → `det_v5.onnx`
5. 将后处理 score 阈值从 0.5 调为 0.6
6. 编译运行，验证检测效果

**完整替换（检测 + 识别）：**

1. 上述 1-3 步 + 同样方式转换 rec 模型为 `rec_v5.onnx`
2. 新建 `OcrRecognizer.kt` 类（参考上面代码）
3. 准备 v5 字典文件 `ppocr_v5_dict.txt`
4. 在业务代码中检测后调用识别
5. 编译运行，验证检测和识别效果

---

### 六、可能遇到的问题

**模型转换报错**：PIR 格式（`inference.json`）兼容性不如旧版 `.pdmodel`。如果直接转换失败，尝试先用 PaddlePaddle 3.0 的 `paddle.jit.load` + `paddle.jit.save` 重新导出为标准格式，再转 ONNX。

**检测效果变差**：v5 模型可能需要微调后处理参数。可以先用原图在 Python 端跑 v5 模型验证效果，确认模型本身工作正常后再部署到 Android。

**ONNX Runtime 版本兼容性**：你项目当前使用 `onnxruntime-android:1.17.1`。如果 v5 模型使用了较新的算子（opset 14），可能需要升级 ONNX Runtime 版本到 1.19+。

**字典大小不匹配**：v5 识别模型输出维度是 18385（v5 新字典），不是旧版的 6625。确保字典文件与模型匹配。
