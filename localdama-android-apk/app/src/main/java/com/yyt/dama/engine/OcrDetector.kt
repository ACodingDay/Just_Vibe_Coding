package com.yyt.dama.engine

import ai.onnxruntime.*
import android.content.Context
import android.graphics.*
import android.util.Log
import androidx.core.graphics.scale
import java.io.Closeable
import java.nio.FloatBuffer
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class OcrDetector(context: Context) : Closeable {

    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private val session: OrtSession

    init {
        val modelBytes = context.assets.open("models/det_v5.onnx").readBytes()
        OrtSession.SessionOptions().use { options ->
            options.setIntraOpNumThreads(4)
            options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            session = env.createSession(modelBytes, options)
        } // options 在此自动 close，释放原生句柄
    }

    fun detect(bitmap: Bitmap): List<Rect> {
        Log.d("OCR", "原图尺寸: ${bitmap.width}x${bitmap.height}")
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
        Log.d("OCR", "检测到 ${boxes.size} 个文本区域框")
        return boxes
    }

    /**
     * 仅对 bitmap 的指定矩形区域做 OCR 检测。
     *
     * 返回的检测框坐标已映射回原图坐标系。
     * 多次调用共享同一个 ONNX session，调用者负责最终 [close]。
     *
     * @param bitmap 完整原图
     * @param region 需要检测的区域（原图坐标）
     * @return 区域内的文本框列表（原图坐标）
     */
    fun detectInRegion(bitmap: Bitmap, region: Rect): List<Rect> {
        val imgW = bitmap.width
        val imgH = bitmap.height

        val rl = max(0, region.left).coerceAtMost(imgW)
        val rt = max(0, region.top).coerceAtMost(imgH)
        val rr = max(0, region.right).coerceAtMost(imgW)
        val rb = max(0, region.bottom).coerceAtMost(imgH)
        val regionW = rr - rl
        val regionH = rb - rt
        if (regionW < 16 || regionH < 16) return emptyList()

        // 裁剪区域
        val cropped = Bitmap.createBitmap(bitmap, rl, rt, regionW, regionH)

        // 预处理 + 推理
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

        // postprocess 返回的是裁剪区域坐标
        val boxes = postprocess(prob, h, w, preResult)
        result.close()
        preResult.resizedBitmap.recycle()

        Log.d("OCR", "区域 [${rl},${rt},${rr},${rb}] 检测到 ${boxes.size} 个文本框")

        // 映射回原图坐标
        return boxes.map { box ->
            Rect(box.left + rl, box.top + rt, box.right + rl, box.bottom + rt)
        }
    }

    data class PreprocessResult(
        val tensor: OnnxTensor,
        val originalW: Int,
        val originalH: Int,
        val modelW: Int,
        val modelH: Int,
        val resizedBitmap: Bitmap
    )

    private fun preprocess(bitmap: Bitmap): PreprocessResult {
        val maxSide = 960
        val originalW = bitmap.width
        val originalH = bitmap.height

        val ratio = if (maxOf(originalW, originalH) > maxSide) {
            maxSide.toFloat() / maxOf(originalW, originalH)
        } else {
            1.0f
        }

        // v5 官方: round(x/32)*32
        val newW = maxOf((originalW * ratio / 32f).roundToInt() * 32, 32)
        val newH = maxOf((originalH * ratio / 32f).roundToInt() * 32, 32)

        val resized = bitmap.scale(newW, newH)
        Log.d("OCR", "预处理: ${originalW}x${originalH} -> ${newW}x${newH}")

        val floatBuffer = FloatBuffer.allocate(3 * newH * newW)
        val pixels = IntArray(newW * newH)
        resized.getPixels(pixels, 0, newW, 0, 0, newW, newH)

        // NCHW 平面格式: 先写所有 B 通道，再写所有 G 通道，最后写所有 R 通道
        for (p in pixels) {
            floatBuffer.put(((p and 0xFF) / 255.0f - 0.406f) / 0.225f)
        }
        for (p in pixels) {
            floatBuffer.put((((p shr 8) and 0xFF) / 255.0f - 0.456f) / 0.224f)
        }
        for (p in pixels) {
            floatBuffer.put((((p shr 16) and 0xFF) / 255.0f - 0.485f) / 0.229f)
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

    private fun postprocess(
        prob: FloatArray,
        h: Int,
        w: Int,
        pre: PreprocessResult
    ): List<Rect> {
        val rawBoxes = mutableListOf<Pair<Rect, Float>>()
        val thresh = 0.3f

        var binary = BooleanArray(h * w)
        for (i in prob.indices) {
            binary[i] = prob[i] > thresh
        }

        // Morphological dilation (3x3 cross) to fill small gaps between text strokes
        binary = dilate3x3(binary, w, h)

        val visited = BooleanArray(h * w)
        val stack = ArrayDeque<Int>()
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

                val left = (minX * pre.originalW.toFloat() / w).toInt()
                val top = (minY * pre.originalH.toFloat() / h).toInt()
                val right = ((maxX + 1f) * pre.originalW.toFloat() / w).toInt()
                val bottom = ((maxY + 1f) * pre.originalH.toFloat() / h).toInt()

                val rw = right - left
                val rh = bottom - top

                val score = computeBoxScore(prob, minX, maxX, minY, maxY, w, h)

                if (pixelCount > 20 && rw > 5 && rh > 5 && score > 0.3f) {
                    rawBoxes.add(Pair(Rect(left, top, right, bottom), score))
                }
            }
        }

        val filtered = rawBoxes.sortedByDescending { it.second }.map { it.first }
        val merged = mergeNearbyBoxes(filtered)

        return merged.filter { rect ->
            rect.width() > 10 && rect.height() > 10
        }
    }

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

    /** Morphological dilation with 3x3 cross kernel to connect nearby text pixels */
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

    override fun close() {
        session.close()
    }
}
