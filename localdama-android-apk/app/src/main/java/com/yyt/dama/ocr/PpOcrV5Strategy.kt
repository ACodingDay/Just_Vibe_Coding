package com.yyt.dama.ocr

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import androidx.core.graphics.scale
import java.nio.FloatBuffer
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * PP-OCRv5 检测策略 — 封装 v5 模型的完整检测流程。
 *
 * 完整封装：
 * - 模型加载: `assets/models/det_v5.onnx`
 * - 预处理: maxSide=960, 对齐 32, BGR 通道, ImageNet 归一化
 *   （mean=[0.406, 0.456, 0.485], std=[0.225, 0.224, 0.229]）
 * - 推理: ONNX Runtime, intraOpNumThreads=4, ALL_OPT
 * - 后处理: 阈值 0.3 二值化 → 3x3 十字膨胀 → 8 连通 floodfill → 框合并
 *
 * 算法行为与原 `com.yyt.dama.engine.OcrDetector`（model=PP_OCR_V5）完全一致，
 * 迁移自该类，便于回归验证。原 OcrDetector 将在阶段五删除。
 *
 * 资源管理：[close] 释放 ONNX session。当前由 [OcrFacadeImpl] 在单次 detect 内
 * 创建并 close；未来可由 Facade 持有做 session 复用。
 *
 * @param context Android Context（用于加载 assets 下的模型文件）
 */
class PpOcrV5Strategy(context: Context) : OcrStrategy {

    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private val session: OrtSession

    // ── 预处理参数（PP-OCRv5 专用） ──

    /** 输入图最长边上限，超过则等比缩放 */
    private val maxSide = 960

    /** 尺寸对齐倍数（PP-OCR 要求 32 的倍数） */
    private val alignMultiple = 32

    /** 通道均值（BGR 顺序：mean[0]=B, mean[1]=G, mean[2]=R） */
    private val mean = floatArrayOf(0.406f, 0.456f, 0.485f)

    /** 通道标准差（BGR 顺序） */
    private val std = floatArrayOf(0.225f, 0.224f, 0.229f)

    // ── 后处理参数 ──

    /** 二值化阈值：prob > binThresh 视为文本像素 */
    private val binThresh = 0.3f

    /** 框置信度阈值：框内平均 prob > scoreThresh 才保留 */
    private val scoreThresh = 0.3f

    /** 最终过滤的最小框宽（像素） */
    private val minBoxWidth = 10

    /** 最终过滤的最小框高（像素） */
    private val minBoxHeight = 10

    init {
        val modelBytes = context.assets.open(MODEL_PATH).readBytes()
        OrtSession.SessionOptions().use { options ->
            options.setIntraOpNumThreads(4)
            options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            session = env.createSession(modelBytes, options)
        } // options 在此自动 close，释放原生句柄
    }

    /**
     * 全图检测 — 对完整图片做 OCR，返回文本框列表（原图坐标）。
     *
     * 流程：预处理 → ONNX 推理 → 后处理 → 返回框。
     * 内部回收 resizedBitmap；调用方负责原图 [bitmap] 的回收。
     */
    override fun detect(bitmap: Bitmap): List<Rect> {
        Log.d(TAG, "原图尺寸: ${bitmap.width}x${bitmap.height}")
        val preResult = preprocess(bitmap)

        val inputName = session.inputNames.iterator().next()
        val outName = session.outputNames.iterator().next()

        val result = session.run(mapOf(inputName to preResult.tensor))
        val output = result.get(outName).get() as OnnxTensor

        val prob = output.floatBuffer.array()
        val shape = output.info.shape
        val h = shape[2].toInt()
        val w = shape[3].toInt()

        val boxes = postprocess(prob, h, w, preResult)
        result.close()
        preResult.resizedBitmap.recycle()
        Log.d(TAG, "检测到 ${boxes.size} 个文本区域框")
        return boxes
    }

    /**
     * 区域检测 — 仅对 bitmap 的指定矩形区域做 OCR。
     *
     * 返回的检测框坐标已映射回原图坐标系。
     * 多次调用共享同一个 ONNX session，调用者负责最终 [close]。
     *
     * @param bitmap 完整原图
     * @param region 需要检测的区域（原图坐标，会被 clamp 到图片范围内）
     * @return 区域内的文本框列表（原图坐标）
     */
    override fun detectInRegion(bitmap: Bitmap, region: Rect): List<Rect> {
        val imgW = bitmap.width
        val imgH = bitmap.height

        // 将 region clamp 到图片范围内，避免越界裁剪
        val rl = max(0, region.left).coerceAtMost(imgW)
        val rt = max(0, region.top).coerceAtMost(imgH)
        val rr = max(0, region.right).coerceAtMost(imgW)
        val rb = max(0, region.bottom).coerceAtMost(imgH)
        val regionW = rr - rl
        val regionH = rb - rt
        if (regionW < 16 || regionH < 16) return emptyList()

        // 裁剪区域后送入预处理
        val cropped = Bitmap.createBitmap(bitmap, rl, rt, regionW, regionH)
        val preResult = preprocess(cropped)
        cropped.recycle()

        val inputName = session.inputNames.iterator().next()
        val outName = session.outputNames.iterator().next()

        val result = session.run(mapOf(inputName to preResult.tensor))
        val output = result.get(outName).get() as OnnxTensor

        val prob = output.floatBuffer.array()
        val shape = output.info.shape
        val h = shape[2].toInt()
        val w = shape[3].toInt()

        // postprocess 返回的是裁剪区域坐标，需映射回原图
        val boxes = postprocess(prob, h, w, preResult)
        result.close()
        preResult.resizedBitmap.recycle()

        Log.d(TAG, "区域 [${rl},${rt},${rr},${rb}] 检测到 ${boxes.size} 个文本框")

        // 把裁剪区域坐标映射回原图坐标（加上裁剪起点偏移）
        return boxes.map { box ->
            Rect(box.left + rl, box.top + rt, box.right + rl, box.bottom + rt)
        }
    }

    /**
     * 预处理 — resize + NCHW 平面格式 + 通道归一化。
     *
     * PP-OCRv5 使用 BGR 通道顺序（与 v3 的 RGB 不同）：
     * - 第一个写入通道取像素 B 分量（`p and 0xFF`），用 mean[0]/std[0] 归一化
     * - 第二个写入通道取像素 G 分量（`p shr 8 and 0xFF`），用 mean[1]/std[1] 归一化
     * - 第三个写入通道取像素 R 分量（`p shr 16 and 0xFF`），用 mean[2]/std[2] 归一化
     *
     * 尺寸对齐：`round(scaled / alignMultiple) * alignMultiple`，保证是 32 的倍数。
     */
    private fun preprocess(bitmap: Bitmap): PreprocessResult {
        val originalW = bitmap.width
        val originalH = bitmap.height

        val ratio = if (maxOf(originalW, originalH) > maxSide) {
            maxSide.toFloat() / maxOf(originalW, originalH)
        } else {
            1.0f
        }

        // 尺寸对齐: round(x / alignMultiple) * alignMultiple
        val newW = maxOf((originalW * ratio / alignMultiple.toFloat()).roundToInt() * alignMultiple, alignMultiple)
        val newH = maxOf((originalH * ratio / alignMultiple.toFloat()).roundToInt() * alignMultiple, alignMultiple)

        val resized = bitmap.scale(newW, newH)
        Log.d(TAG, "预处理: ${originalW}x${originalH} -> ${newW}x${newH}")

        val floatBuffer = FloatBuffer.allocate(3 * newH * newW)
        val pixels = IntArray(newW * newH)
        resized.getPixels(pixels, 0, newW, 0, 0, newW, newH)

        // NCHW 平面格式：按通道顺序依次写入（BGR）
        for (p in pixels) {
            floatBuffer.put(((p and 0xFF) / 255.0f - mean[0]) / std[0])
        }
        for (p in pixels) {
            floatBuffer.put((((p shr 8) and 0xFF) / 255.0f - mean[1]) / std[1])
        }
        for (p in pixels) {
            floatBuffer.put((((p shr 16) and 0xFF) / 255.0f - mean[2]) / std[2])
        }
        floatBuffer.rewind()

        val shape = longArrayOf(1, 3, newH.toLong(), newW.toLong())
        val tensor = OnnxTensor.createTensor(env, floatBuffer, shape)

        return PreprocessResult(
            tensor = tensor,
            originalW = originalW,
            originalH = originalH,
            modelW = newW,
            modelH = newH,
            resizedBitmap = resized
        )
    }

    /**
     * 后处理 — 二值化 + 膨胀 + 连通域 + 框合并。
     *
     * 流程：
     * 1. 二值化：prob > binThresh 视为前景
     * 2. 3x3 十字膨胀：连接相邻文字笔画
     * 3. 8 连通 floodfill：找连通域 bounding box
     * 4. 过滤：pixelCount > 20 且宽高 > 5 且 score > scoreThresh
     * 5. 按 score 降序排序
     * 6. 合并相邻框（gap ≤ 6）
     * 7. 过滤最小尺寸（宽高 > minBoxWidth / minBoxHeight）
     *
     * 返回的坐标映射回原图尺寸（基于 pre.originalW / originalH）。
     */
    private fun postprocess(
        prob: FloatArray,
        h: Int,
        w: Int,
        pre: PreprocessResult
    ): List<Rect> {
        val rawBoxes = mutableListOf<Pair<Rect, Float>>()

        var binary = BooleanArray(h * w)
        for (i in prob.indices) {
            binary[i] = prob[i] > binThresh
        }

        // Morphological dilation (3x3 cross) to fill small gaps between text strokes
        binary = dilate3x3(binary, w, h)

        val visited = BooleanArray(h * w)
        val stack = ArrayDeque<Int>()
        // 8 连通方向的 (dy, dx) 对：(-1,-1), (-1,0), (-1,1), (0,-1), (0,1), (1,-1), (1,0), (1,1)
        val dirs8 = intArrayOf(-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1)

        for (y in 0 until h) {
            for (x in 0 until w) {
                val idx = y * w + x
                if (!binary[idx] || visited[idx]) continue

                stack.clear()
                stack.add(idx)

                var minX = x; var maxX = x
                var minY = y; var maxY = y
                var pixelCount = 0

                while (stack.isNotEmpty()) {
                    val cur = stack.removeLast()
                    val cy = cur / w
                    val cx = cur % w

                    if (visited[cur]) continue
                    visited[cur] = true

                    minX = min(minX, cx); maxX = max(maxX, cx)
                    minY = min(minY, cy); maxY = max(maxY, cy)
                    pixelCount++

                    var di = 0
                    while (di < 16) {
                        val ny = cy + dirs8[di]
                        val nx = cx + dirs8[di + 1]
                        if (ny in 0 until h && nx in 0 until w) {
                            val nIdx = ny * w + nx
                            if (binary[nIdx] && !visited[nIdx]) stack.add(nIdx)
                        }
                        di += 2
                    }
                }

                // 连通域 bounding box 从模型图坐标映射回原图坐标
                val left = (minX * pre.originalW.toFloat() / w).toInt()
                val top = (minY * pre.originalH.toFloat() / h).toInt()
                val right = ((maxX + 1f) * pre.originalW.toFloat() / w).toInt()
                val bottom = ((maxY + 1f) * pre.originalH.toFloat() / h).toInt()

                val rw = right - left
                val rh = bottom - top

                val score = computeBoxScore(prob, minX, maxX, minY, maxY, w, h)

                if (pixelCount > 20 && rw > 5 && rh > 5 && score > scoreThresh) {
                    rawBoxes.add(Pair(Rect(left, top, right, bottom), score))
                }
            }
        }

        val filtered = rawBoxes.sortedByDescending { it.second }.map { it.first }
        val merged = mergeNearbyBoxes(filtered)

        return merged.filter { rect ->
            rect.width() > minBoxWidth && rect.height() > minBoxHeight
        }
    }

    /** 计算框内 prob 平均值，作为该框的置信度分数 */
    private fun computeBoxScore(
        prob: FloatArray,
        minX: Int, maxX: Int, minY: Int, maxY: Int,
        mapW: Int, mapH: Int
    ): Float {
        val cx1 = maxOf(minX, 0)
        val cx2 = minOf(maxX, mapW - 1)
        val cy1 = maxOf(minY, 0)
        val cy2 = minOf(maxY, mapH - 1)
        if (cx2 <= cx1 || cy2 <= cy1) return 0f
        var sum = 0f; var count = 0
        for (y in cy1..cy2) {
            val row = y * mapW
            for (x in cx1..cx2) { sum += prob[row + x]; count++ }
        }
        return if (count > 0) sum / count else 0f
    }

    /**
     * 合并相邻框 — 贪心合并 gap ≤ 6 的框。
     *
     * 按 score 降序处理（调用方已排序），每个框尝试吸收后续所有未使用框，
     * 吸收后继续扫描直到无新合并（changed = false）。
     */
    private fun mergeNearbyBoxes(boxes: List<Rect>): List<Rect> {
        if (boxes.isEmpty()) return emptyList()
        val merged = mutableListOf<Rect>()
        val used = BooleanArray(boxes.size)
        for (i in boxes.indices) {
            if (used[i]) continue
            var a = boxes[i]; used[i] = true
            var changed = true
            while (changed) {
                changed = false
                for (j in (i + 1) until boxes.size) {
                    if (used[j]) continue
                    val b = boxes[j]
                    val gapX = if (a.left > b.right) a.left - b.right else if (b.left > a.right) b.left - a.right else 0
                    val gapY = if (a.top > b.bottom) a.top - b.bottom else if (b.top > a.bottom) b.top - a.bottom else 0
                    if (gapX <= 6 && gapY <= 6) {
                        a = Rect(min(a.left, b.left), min(a.top, b.top), max(a.right, b.right), max(a.bottom, b.bottom))
                        used[j] = true; changed = true
                    }
                }
            }
            merged.add(a)
        }
        return merged
    }

    /** 3x3 十字核膨胀 — 连接相邻文字像素（上下左右），填充小的笔画间隙 */
    private fun dilate3x3(binary: BooleanArray, w: Int, h: Int): BooleanArray {
        val result = BooleanArray(w * h)
        for (y in 0 until h) {
            for (x in 0 until w) {
                val i = y * w + x
                if (binary[i]) {
                    result[i] = true
                    if (y > 0) result[i - w] = true
                    if (y < h - 1) result[i + w] = true
                    if (x > 0) result[i - 1] = true
                    if (x < w - 1) result[i + 1] = true
                }
            }
        }
        return result
    }

    /** 释放 ONNX session 原生资源 */
    override fun close() {
        session.close()
    }

    /** 预处理结果 — 携带推理后的尺寸映射信息，供后处理坐标还原使用 */
    private data class PreprocessResult(
        val tensor: OnnxTensor,
        val originalW: Int,
        val originalH: Int,
        val modelW: Int,
        val modelH: Int,
        val resizedBitmap: Bitmap
    )

    private companion object {
        private const val TAG = "OCR"
        private const val MODEL_PATH = "models/det_v5.onnx"
    }
}
