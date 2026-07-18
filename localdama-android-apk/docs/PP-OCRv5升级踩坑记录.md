## PP-OCRv3 → PP-OCRv5 升级踩坑全记录

### 背景

项目 `localdama-android-apk` 是一个隐私友好的图片马赛克工具，使用 OCR 文字检测自动定位证件上的敏感文字区域。原项目使用 PP-OCRv3 文字检测模型（`det_v3.onnx`），检测效果不理想，决定升级到 PP-OCRv5。

最终升级成功，检测框从 2 个提升到 7 个，与 Python 参考实现完全一致。整个过程耗时较长，踩了不少坑，特记录以供后来者参考。

---

### 核心架构

- 推理引擎：ONNX Runtime Android（从 1.17.1 升级到 1.22.0）
- 模型来源：[ppocrv5-onnx](https://github.com/HoVDuc/ppocrv5-onnx) 预转换的 ONNX 模型
- 预处理：DetResize（resize_long=960）+ ImageNet 归一化 + NCHW 平面格式
- 后处理：DB 二值化 → 形态学膨胀 → 连通域分析 → 置信度过滤 → 邻近合并

---

### 踩坑与排查过程

#### 坑 1：模型转换失败（paddle2onnx 在 Windows 上的兼容性问题）

**现象：** 尝试用 `paddle2onnx` 将 PaddlePaddle PIR 格式的 v5 模型转为 ONNX，遇到一连串问题：

- `paddle2onnx 2.0.2rc1` 在 Windows 上阻止 `paddlepaddle 3.0.0`（版本检查 bug）
- 手动 patch `__init__.py` 后，DLL 加载失败（`paddle2onnx_cpp2py_export` 缺少 `libpaddle.pyd`）
- 拷贝 `libpaddle.pyd` 后仍报 WinError 127（ABI 不兼容）
- `paddle2onnx 1.3.1` 不支持 PIR 格式（`inference.json`）

**解决：** 放弃本地转换，改用 GitHub 上 [HoVDuc/ppocrv5-onnx](https://github.com/HoVDuc/ppocrv5-onnx) 项目提供的预转换 ONNX 模型，直接从 Releases 页面下载。

**教训：** PaddlePaddle 的工具链在 Windows 上兼容性较差，优先考虑社区预转换模型。

---

#### 坑 2：替换模型后仍然只检测到 2 个框

**现象：** 将 `det_v3.onnx` 替换为 `det_v5.onnx` 后，检测效果没有提升，仍然只出 2 个框。

**排查过程：**

1. 用 Python 参考实现跑同一张图片 → 检测到 7-8 个框，确认模型本身没问题
2. 对比预处理参数，发现 v3 的 resize 取整方式（向上取整）与 v5 不同（四舍五入 `round(x/32)*32`）
3. 修正取整方式后仍然只有 2 个框
4. 发现后处理过滤条件过于严格（尺寸 >15px，置信度 >0.6），放宽后仍无改善

**真正的根因（最终定位）：** 见坑 6。

---

#### 坑 3：OOM 崩溃（内存溢出）

**现象：** 尝试提高 `inSampleSize` 阈值以获取更高分辨率输入时，`MosaicEngine.applyMosaic` 中 `source.copy()` + `IntArray` 分配 346MB，超出 192MB 堆内存限制。

**解决：** 将 `inSampleSize` 阈值设为 2048，在分辨率和内存间取得平衡。检测器内部会将图片缩到 960px，因此 2048px 的输入已经足够。

```kotlin
opts.inSampleSize = if (m > 2048) {
    var s = 1; while (s * 2048 < m) s *= 2; s
} else 1
```

---

#### 坑 4：OCR 测试页面无加载反馈

**现象：** 点击 OCR 测试按钮后界面卡住无响应，后台在做推理但用户无感知。

**解决：** 在 `HomeScreen.kt` 外层包裹 `Box`，添加半透明遮罩 + `CircularProgressIndicator` + "识别中..." 文字，通过 `isTestRunning` 状态控制显示/隐藏。

---

#### 坑 5：Android 像素值与 Python 不一致（Display P3 色彩空间）

**现象：** Android `BitmapFactory.decodeResource` 加载的像素值与 Python `cv2.imread` 不一致：

```
Android 像素(0,0): BGR = (42, 42, 44)  ← G/R 偏低
Python  像素(0,0): BGR = (42, 46, 47)
```

**排查过程：**

1. 确认 APK 中的 JPEG 文件 MD5 与原始文件完全一致 → AAPT 未修改
2. 发现 Android 设备的 `colorSpace` 报告为 Display P3，而非 sRGB
3. 现代 Android 设备在解码 JPEG 时可能将 sRGB 像素转换到 Display P3 色彩空间

**解决：**

- 从 `assets/` 加载原始字节（`decodeByteArray`），绕过 `decodeResource` 的资源处理管线
- API 33+ 强制指定 `inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)`

```kotlin
val bytes = context.assets.open("test.jpg").readBytes()
val opts = BitmapFactory.Options()
if (Build.VERSION.SDK_INT >= 33) {
    opts.inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
}
val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)!!
```

---

#### 坑 6（终极 Bug）：NCHW 张量格式写错 —— 交错 vs 平面

**现象：** 所有前置问题修复后，Android 概率图仍与 Python 完全不同（avg=0.092 vs 0.057），无论更换 ONNX Runtime 版本（1.17.1 → 1.22.0）、关闭图优化（ALL_OPT → NO_OPT）、换真机测试，结果均不变。

**排查过程（关键突破）：**

逐一对比 Python 和 Android 模型输入 tensor 的前 9 个值，发现像素 0 的 B 通道一致（-1.072），但 G 和 R 通道完全不同。

```
Android: [-1.072, -1.230, -1.313, -1.107, -1.230, -1.313, ...]
Python:  [-1.072, -1.090, -1.038, -1.072, -1.072, -1.090, ...]
```

**根因：** v3 遗留的预处理代码按**逐像素交错格式**写入 FloatBuffer：

```
// 错误：交错格式 (HWC)
for (p in pixels) {
    floatBuffer.put(B); floatBuffer.put(G); floatBuffer.put(R);
}
```

但 ONNX 模型输入 shape `[1, 3, H, W]` 要求 **NCHW 平面格式**：

```
// 正确：平面格式 (NCHW)
// 先写所有 B 通道像素
for (p in pixels) { floatBuffer.put(B); }
// 再写所有 G 通道像素
for (p in pixels) { floatBuffer.put(G); }
// 最后写所有 R 通道像素
for (p in pixels) { floatBuffer.put(R); }
```

交错格式下，模型把 G/R 通道数据当作 B 通道处理，导致整个概率图错乱。这个 bug 在 v3 时就存在，只是 v3 模型恰好能勉强出一些结果。

**修复后效果：**

| 指标 | 修复前 | 修复后 | Python 参考值 |
|---|---|---|---|
| 概率图 avg | 0.092 | 0.056 | 0.057 |
| >0.2 像素数 | 66,116 | 40,425 | ~41,006 |
| 检测框数 | 2 | 7 | 7 |

---

### 最终修改清单

| 文件 | 修改内容 |
|---|---|
| `build.gradle.kts` | ONNX Runtime 1.17.1 → 1.22.0 |
| `OcrDetector.kt` | 模型 det_v3 → det_v5；NCHW 平面格式写入；resize 取整改为 round；后处理阈值调整（thresh=0.3, score>0.3）；添加形态学膨胀 |
| `DamaNavGraph.kt` | 图片从 assets 加载 + sRGB 色彩空间强制；inSampleSize 阈值 2048；添加 isTestRunning 状态管理 |
| `HomeScreen.kt` | 添加 OCR 检测加载遮罩 UI |
| `assets/models/Paddle/` | 添加 det_v5.onnx、rec_v5.onnx、ppocrv5_dict.txt；删除 det_v3.onnx |

### 关键参数配置（与 Python 参考实现对齐）

```
预处理：
  resize_long = 960
  取整方式 = round(x/32) * 32
  归一化 = ImageNet (mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225])
  张量格式 = NCHW 平面（BGR 通道顺序）

后处理：
  二值化阈值 = 0.3
  形态学膨胀 = 3×3 十字核
  最小连通域 = 20 像素
  最小框尺寸 = 5×5
  置信度阈值 = 0.3
  合并间距 = 6 像素（原图坐标）
  最终过滤 = 宽>10 且 高>10
```

### 排查方法论总结

1. **用 Python 参考实现做 ground truth**：确认模型本身能力上限
2. **逐层对比**：预处理像素值 → 归一化 tensor 值 → 概率图统计 → 后处理各阶段框数
3. **控制变量**：ONNX Runtime 版本、图优化级别、模拟器 vs 真机、色彩空间
4. **关键对比技巧**：将 Python 和 Android 的前 N 个 tensor 值逐个对比，最终定位到数据写入顺序问题
