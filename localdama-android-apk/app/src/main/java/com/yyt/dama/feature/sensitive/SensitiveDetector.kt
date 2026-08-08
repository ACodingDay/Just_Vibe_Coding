package com.yyt.dama.feature.sensitive

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import com.yyt.dama.engine.OcrRecognizer
import com.yyt.dama.engine.groupBoxesByRows
import com.yyt.dama.ocr.OcrStrategy
import com.yyt.dama.ocr.OcrStrategyFactory
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorService
import java.util.concurrent.Future
import kotlin.math.max
import kotlin.math.min

/**
 * 敏感信息检测管道 — 串联「检测 → 行级识别 → 归一化 → 正则匹配 → 过滤」。
 *
 * 与身份证打码流程（[com.yyt.dama.ocr.OcrFacadeImpl]）的核心差异：
 * - 不依赖任何证件模板，对全图做文本检测
 * - 在文本检测后增加「文本识别」环节，用 OCR 文字结果驱动正则匹配
 * - 仅保留匹配到敏感信息的区域返回，与 [DetectionResult] 的 `List<Rect>` 格式一致
 *
 * 管道步骤：
 * 1. 调用 [OcrStrategyFactory] 创建检测策略，对整张图做 det 检测
 * 2. 按行分组：det 可能把一段数字拆成多个框（如带空格的卡号），
 *    同行的框合并后整行裁剪识别，保证正则能匹配到完整数字串
 * 3. 对识别文本做归一化（去空白/连字符）后遍历 [SensitivePattern] 匹配
 * 4. 命中规则的行框返回给调用方做打码渲染
 *
 * 性能优化：
 * - det 策略与 rec 识别器懒加载并缓存，多次检测复用，避免重复加载 ONNX 模型
 * - 各行识别并行提交到固定线程池（OrtSession.run 线程安全），
 *   避免几十行串行推理耗时过长
 *
 * 资源管理：使用完毕需调用 [close] 释放模型与线程池（UI 层在页面销毁时调用）。
 *
 * @param context Android Context（加载 det/rec 模型）
 */
class SensitiveDetector(
    private val context: Context,
    private val patterns: List<SensitivePattern> = defaultSensitivePatterns()
) : AutoCloseable {

    private val enabledPatterns = patterns.filter { it.enabled }

    /** 缓存的 OCR 引擎，首次检测时懒加载，后续复用 */
    private var strategy: OcrStrategy? = null
    private var recognizer: OcrRecognizer? = null

    /** 行识别并行池：固定 4 路，共享同一 OrtSession */
    private val executor: ExecutorService = Executors.newFixedThreadPool(REC_PARALLELISM) { r ->
        Thread(r, "dama-rec").apply { isDaemon = true }
    }

    /**
     * 关闭/在途状态锁。
     *
     * [close] 与 [detectSensitiveInfo] 可能并发（用户检测中按返回）：
     * 若在途检测尚未结束就 close 掉 ONNX session，正在推理的线程会
     * 触发原生崩溃。因此 close 只标记关闭，待在途检测全部结束后
     * 由最后一个 finally 统一释放引擎。
     */
    private val closeLock = Object()
    private var closed = false
    private var inFlight = 0

    /**
     * 检测图片中的敏感信息区域。
     *
     * @param bitmap 待检测图片（调用方负责生命周期管理，本方法不回收）
     * @return 命中规则的行框列表（原图坐标，可直接传给 [MosaicEngine] 打码）
     */
    fun detectSensitiveInfo(bitmap: Bitmap): List<Rect> {
        val imgW = bitmap.width
        val imgH = bitmap.height

        val strategy: OcrStrategy
        val recognizer: OcrRecognizer
        synchronized(closeLock) {
            if (closed || enabledPatterns.isEmpty()) return emptyList()
            strategy = this.strategy ?: OcrStrategyFactory.create(context).also { this.strategy = it }
            recognizer = this.recognizer ?: OcrRecognizer(context).also { this.recognizer = it }
            inFlight++
        }

        return try {
            val boxes = try {
                strategy.detect(bitmap)
            } catch (e: Exception) {
                Log.e(TAG, "全图检测失败", e)
                return emptyList()
            }
            Log.d(TAG, "全图检测到 ${boxes.size} 个文本框")

            // 按行分组：被 det 拆开的数字段（如带空格/连字符的卡号、手机号）
            // 在同一行内合并裁剪识别，整行文本才能命中完整数字正则
            val rows = groupBoxesByRows(boxes)
            Log.d(TAG, "按行合并为 ${rows.size} 行，并行识别中…")

            // 并行提交各行识别任务，保持行顺序收集结果
            val futures: List<Future<RowResult?>> = rows.map { row ->
                executor.submit(Callable { recognizeRow(bitmap, imgW, imgH, recognizer, row) })
            }

            val matched = mutableListOf<Rect>()
            for (future in futures) {
                val result = try {
                    future.get()
                } catch (e: Exception) {
                    Log.w(TAG, "行识别任务异常", e)
                    null
                }
                if (result != null) {
                    if (matchesAny(result.text, enabledPatterns)) {
                        matched.add(result.rect)
                        Log.d(TAG, "命中: \"${result.text.take(40)}\" → ${result.rect}")
                    }
                }
            }

            // 合并相邻命中区域，避免重叠打码渲染叠加变色
            val merged = mergeOverlapping(matched)
            Log.d(TAG, "命中 ${matched.size} 行 → 合并后 ${merged.size} 框")
            merged
        } finally {
            synchronized(closeLock) {
                inFlight--
                // 关闭请求发生在检测期间时，由最后一个在途调用统一释放引擎
                if (closed && inFlight == 0) releaseEngines()
            }
        }
    }

    /**
     * 释放 OCR 模型与线程池。
     *
     * 若检测仍在进行，仅标记关闭，引擎由检测的 finally 释放；
     * 关闭后再次调用 [detectSensitiveInfo] 直接返回空结果。
     */
    override fun close() {
        synchronized(closeLock) {
            if (closed) return
            closed = true
            if (inFlight == 0) releaseEngines()
        }
    }

    private fun releaseEngines() {
        executor.shutdown()
        strategy?.close()
        recognizer?.close()
        strategy = null
        recognizer = null
    }

    /** 识别结果：命中候选行框（原图坐标）与其识别文本 */
    private data class RowResult(val rect: Rect, val text: String)

    /**
     * 整行裁剪识别。
     *
     * 行框取该行所有 det 框的并集并轻度扩展：X 扩展 10%（det 漏首尾字符）、
     * Y 扩展 50% 行高（det 框偏矮，恢复被裁字形），钳制在图片边界内。
     * 返回的扩展行框同时用作打码区域。
     */
    private fun recognizeRow(
        bitmap: Bitmap,
        imgW: Int,
        imgH: Int,
        recognizer: OcrRecognizer,
        row: List<Rect>
    ): RowResult? {
        val rect = padRow(row, imgW, imgH)
        val cropW = min(rect.width().coerceAtLeast(4), imgW - rect.left)
        val cropH = min(rect.height().coerceAtLeast(4), imgH - rect.top)
        if (cropW <= 0 || cropH <= 0) return null

        return try {
            val crop = Bitmap.createBitmap(bitmap, rect.left, rect.top, cropW, cropH)
            val text = try {
                recognizer.recognize(crop)
            } finally {
                // createBitmap 在裁剪区覆盖全图时会返回原图同一实例，此时不能回收
                if (crop !== bitmap) crop.recycle()
            }
            if (text.isBlank()) null else RowResult(rect, text)
        } catch (e: Exception) {
            Log.w(TAG, "行识别失败: $rect", e)
            null
        }
    }

    /** 对行内 det 框并集做轻度扩展，提升 rec 识别的完整度 */
    private fun padRow(row: List<Rect>, imgW: Int, imgH: Int): Rect {
        val left = row.minOf { it.left }
        val top = row.minOf { it.top }
        val right = row.maxOf { it.right }
        val bottom = row.maxOf { it.bottom }
        val padX = ((right - left) * ROW_PAD_X_RATIO).toInt().coerceAtLeast(2)
        val padY = ((bottom - top) * ROW_PAD_Y_RATIO).toInt().coerceAtLeast(2)
        return Rect(
            max(0, left - padX),
            max(0, top - padY),
            min(imgW, right + padX),
            min(imgH, bottom + padY)
        )
    }

    /**
     * 判断文本是否命中任一敏感规则。
     *
     * 两阶段匹配：
     * 1. 先去空白（OCR 数字串常带空格，如"6222 0202 1234 5678"）；
     * 2. 仍无命中再去连字符（"138-1234-5678"）。连字符不能在第一阶段
     *    就移除，否则会拆散邮箱地址中的连字符（如 a.b-c@example.com）。
     */
    private fun matchesAny(text: String, patterns: List<SensitivePattern>): Boolean {
        val wsStripped = normalizeOcrText(text)
        if (patterns.any { it.regex.find(wsStripped) != null }) return true
        return patterns.any { it.regex.find(normalizeOcrTextStrict(text)) != null }
    }

    /**
     * 合并存在显著重叠的命中框，避免相同文本被打码两次导致颜色加深。
     *
     * 判定标准：两框交集面积 ≥ 任一框面积 50% 视为重叠。
     * 多轮扫描直到不再发生合并：A∪B 与 C 重叠时，合并后的
     * 新框必须在下一轮继续与 C 合并，单轮贪心会残留重叠。
     * 命中框数量通常很少，O(n²) 多轮代价可忽略。
     */
    private fun mergeOverlapping(boxes: List<Rect>): List<Rect> {
        var current = boxes
        var changed = true
        while (changed && current.size > 1) {
            changed = false
            val next = mutableListOf<Rect>()
            for (box in current) {
                val overlapIdx = next.indexOfFirst { existing ->
                    overlapRatio(existing, box) >= 0.5f || overlapRatio(box, existing) >= 0.5f
                }
                if (overlapIdx >= 0) {
                    val e = next[overlapIdx]
                    next[overlapIdx] = Rect(
                        min(e.left, box.left),
                        min(e.top, box.top),
                        max(e.right, box.right),
                        max(e.bottom, box.bottom)
                    )
                    changed = true
                } else {
                    next.add(box)
                }
            }
            current = next
        }
        return current
    }

    private fun overlapRatio(a: Rect, b: Rect): Float {
        val l = max(a.left, b.left)
        val t = max(a.top, b.top)
        val r = min(a.right, b.right)
        val bot = min(a.bottom, b.bottom)
        if (l >= r || t >= bot) return 0f
        val inter = (r - l).toFloat() * (bot - t).toFloat()
        val area = a.width().toFloat() * a.height().toFloat()
        return if (area > 0f) inter / area else 0f
    }

    private companion object {
        private const val TAG = "SensitiveDetector"

        /** 行识别并行度：4 路并发 + session 内部 intraOp 线程，兼顾小核设备 */
        private const val REC_PARALLELISM = 4

        /** 行框水平扩展比例（det 框可能漏行首/行尾字符） */
        private const val ROW_PAD_X_RATIO = 0.1f

        /** 行框垂直扩展比例（det 框偏矮，恢复被裁字形） */
        private const val ROW_PAD_Y_RATIO = 0.5f
    }
}
