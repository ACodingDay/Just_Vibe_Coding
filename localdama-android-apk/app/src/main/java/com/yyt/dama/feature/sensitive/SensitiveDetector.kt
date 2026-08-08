package com.yyt.dama.feature.sensitive

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import com.yyt.dama.engine.OcrRecognizer
import com.yyt.dama.ocr.OcrStrategyFactory
import kotlin.math.max
import kotlin.math.min

/**
 * 敏感信息检测管道 — 串联「检测 → 识别 → 正则匹配 → 过滤」。
 *
 * 与身份证打码流程（[com.yyt.dama.ocr.OcrFacadeImpl]）的核心差异：
 * - 不依赖任何证件模板，对全图做文本检测
 * - 在文本检测后增加「文本识别」环节，用 OCR 文字结果驱动正则匹配
 * - 仅保留匹配到敏感信息的区域返回，与 [DetectionResult] 的 `List<Rect>` 格式一致
 *
 * 管道步骤：
 * 1. 调用 [OcrStrategyFactory] 创建检测策略，对整张图做 det 检测
 * 2. 按 det 框逐框裁剪 → 调用 [OcrRecognizer.recognize] 得到文本
 * 3. 遍历 [SensitivePattern] 列表，对每个识别结果做正则匹配
 * 4. 命中规则的文本框返回给调用方做打码渲染
 *
 * @param context Android Context（加载 det/rec 模型）
 */
class SensitiveDetector(
    private val context: Context,
    private val patterns: List<SensitivePattern> = defaultSensitivePatterns()
) {

    /**
     * 检测图片中的敏感信息区域。
     *
     * @param bitmap 待检测图片（调用方负责生命周期管理，本方法不回收）
     * @return 命中规则的文本框列表（原图坐标，可直接传给 [MosaicEngine] 打码）
     */
    fun detectSensitiveInfo(bitmap: Bitmap): List<Rect> {
        val imgW = bitmap.width
        val imgH = bitmap.height
        val enabledPatterns = patterns.filter { it.enabled }
        if (enabledPatterns.isEmpty()) return emptyList()

        val strategy = OcrStrategyFactory.create(context)
        val recognizer = OcrRecognizer(context)
        val matched = mutableListOf<Rect>()

        try {
            val boxes = strategy.detect(bitmap)
            Log.d(TAG, "全图检测到 ${boxes.size} 个文本框")

            for (box in boxes) {
                // det 框紧贴字形，部分会漏掉首尾字符，做轻度扩展提升识别率
                val padded = padBox(box, imgW, imgH, padRatio = 0.1f)
                // 钳制到图片边界内：det 框贴边时 coerceAtLeast 扩展可能越界导致崩溃
                val cropW = min(padded.width().coerceAtLeast(4), imgW - padded.left)
                val cropH = min(padded.height().coerceAtLeast(4), imgH - padded.top)
                if (cropW <= 0 || cropH <= 0) continue
                val crop = Bitmap.createBitmap(bitmap, padded.left, padded.top, cropW, cropH)

                val text = recognizer.recognize(crop)
                // createBitmap 在裁剪区覆盖全图时会返回原图同一实例，此时不能回收
                if (crop !== bitmap) crop.recycle()

                if (text.isBlank()) continue

                if (matchesAny(text, enabledPatterns)) {
                    // 打码区域用扩展后的框，避免 det 框漏字
                    matched.add(padded)
                    Log.d(TAG, "命中: \"${text.take(40)}\" → $padded")
                }
            }
        } finally {
            strategy.close()
            recognizer.close()
        }

        // 合并相邻命中区域，避免重叠打码渲染叠加变色
        val merged = mergeOverlapping(matched)
        Log.d(TAG, "命中 ${matched.size} 框 → 合并后 ${merged.size} 框")
        return merged
    }

    /** 判断文本是否命中任一敏感规则 */
    private fun matchesAny(text: String, patterns: List<SensitivePattern>): Boolean =
        patterns.any { it.regex.find(text) != null }

    /**
     * 对 det 框做轻度扩展，提升 rec 识别的完整度。
     *
     * 扩展幅度设为 10%（远小于 OcrFacadeImpl 的 1 倍行高），
     * 因为敏感信息多为单行文本，det 框通常已较贴合。
     */
    private fun padBox(box: Rect, imgW: Int, imgH: Int, padRatio: Float): Rect {
        val padX = (box.width() * padRatio).toInt().coerceAtLeast(2)
        val padY = (box.height() * padRatio).toInt().coerceAtLeast(2)
        return Rect(
            max(0, box.left - padX),
            max(0, box.top - padY),
            min(imgW, box.right + padX),
            min(imgH, box.bottom + padY)
        )
    }

    /**
     * 合并存在显著重叠的命中框，避免相同文本被打码两次导致颜色加深。
     *
     * 判定标准：两框交集面积 ≥ 任一框面积 50% 视为重叠。
     * 简单贪心 O(n²) 实现，命中框数量通常很少，无需优化。
     */
    private fun mergeOverlapping(boxes: List<Rect>): List<Rect> {
        if (boxes.isEmpty()) return emptyList()
        val sorted = boxes.sortedBy { it.top }
        val merged = mutableListOf<Rect>()
        for (box in sorted) {
            val overlapIdx = merged.indexOfFirst { existing ->
                overlapRatio(existing, box) >= 0.5f || overlapRatio(box, existing) >= 0.5f
            }
            if (overlapIdx >= 0) {
                val e = merged[overlapIdx]
                merged[overlapIdx] = Rect(
                    min(e.left, box.left),
                    min(e.top, box.top),
                    max(e.right, box.right),
                    max(e.bottom, box.bottom)
                )
            } else {
                merged.add(box)
            }
        }
        return merged
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
    }
}
