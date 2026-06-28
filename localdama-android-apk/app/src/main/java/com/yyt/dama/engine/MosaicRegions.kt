package com.yyt.dama.engine

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import android.util.Log
import kotlin.math.max
import kotlin.math.min

/**
 * 马赛克区域计算工具类（通用，不耦合任何特定页面）。
 *
 * 提供三个独立能力，可按需组合使用：
 *
 *  1. [filterBlackText] — 从 OCR 检测框中筛选纯黑色文本区域
 *  2. [mergeNearby]     — 合并水平相邻的矩形区域
 *  3. [expandAll]       — 统一扩展矩形四周的像素余量
 *
 * 典型用法：
 * ```kotlin
 * val blackBoxes = MosaicRegions.filterBlackText(ocrBoxes, bitmap)
 * val merged     = MosaicRegions.mergeNearby(blackBoxes)
 * val final      = MosaicRegions.expandAll(merged, bitmap.width, bitmap.height)
 * ```
 *
 * 也可一步到位：
 * ```kotlin
 * val regions = MosaicRegions.process(ocrBoxes, bitmap)
 * ```
 */
object MosaicRegions {

    // ── HSV 阈值 ──────────────────────────────────
    // Android HSV: H ∈ [0, 360), S ∈ [0, 1], V ∈ [0, 1]

    /** 纯黑色像素：低饱和度 + 低明度 */
    private const val BLACK_S_MAX = 0.20f
    private const val BLACK_V_MAX = 0.40f

    /** 黑色像素占列总像素比例阈值 */
    private const val BLACK_COL_RATIO = 0.08f

    /** 连续黑色列最少宽度（px），过窄视为噪声 */
    private const val MIN_SEGMENT_WIDTH = 3

    // ── 合并参数 ──────────────────────────────────

    /** 合并间距 = 两框平均宽度 × 此比例 */
    private const val MERGE_GAP_RATIO = 0.5f

    // ── 扩展参数 ──────────────────────────────────

    /** 默认扩展比例（相对原图尺寸） */
    private const val DEFAULT_EXPAND_RATIO = 0.01f

    // ═══════════════════════════════════════════════
    //  公开 API
    // ═══════════════════════════════════════════════

    /**
     * 一步到位：颜色过滤 → 合并 → 扩展。
     *
     * @param boxes      OCR 检测到的包围框
     * @param bitmap     原始图片
     * @param expandRatio 扩展比例（相对原图尺寸，默认 1%）
     * @return 最终可用于打码的矩形区域列表
     */
    fun process(
        boxes: List<Rect>,
        bitmap: Bitmap,
        expandRatio: Float = DEFAULT_EXPAND_RATIO
    ): List<Rect> {
        val black = filterBlackText(boxes, bitmap)
        val merged = mergeNearby(black)
        val expanded = expandAll(merged, bitmap.width, bitmap.height, expandRatio)
        Log.d("MosaicRegions",
            "输入 ${boxes.size} 框 → 黑色 ${black.size} → 合并 ${merged.size} → 最终 ${expanded.size}")
        return expanded
    }

    /**
     * 从 OCR 检测框中筛选纯黑色文本区域。
     *
     * 对每个框做列级 HSV 分析，只保留黑色像素占比足够的列，
     * 非黑色像素（蓝色、红色、白色等）自动排除。
     *
     * @param boxes  OCR 检测框列表（原始图片坐标）
     * @param bitmap 原始图片
     * @return 黑色文本子区域列表（未合并、未扩展）
     */
    fun filterBlackText(boxes: List<Rect>, bitmap: Bitmap): List<Rect> {
        val result = mutableListOf<Rect>()
        val hsv = FloatArray(3)
        val imgW = bitmap.width
        val imgH = bitmap.height

        for (box in boxes) {
            val l = max(0, box.left)
            val t = max(0, box.top)
            val r = min(imgW, box.right)
            val b = min(imgH, box.bottom)
            val safeBox = Rect(l, t, r, b)
            if (safeBox.width() < 4 || safeBox.height() < 4) {
                result.add(box)
                continue
            }

            val segments = findBlackSegments(safeBox, bitmap, hsv)
            if (segments.isNotEmpty()) {
                result.addAll(segments)
            }
            // 框内无黑色 → 整框排除
        }
        return result
    }

    /**
     * 合并水平相邻的矩形区域。
     *
     * 两个矩形如果垂直方向有重叠、且水平间距不超过两者平均宽度的 [MERGE_GAP_RATIO]，
     * 则合并为一个更大的矩形。可反复调用直到不再变化。
     *
     * @param regions 待合并的矩形列表
     * @return 合并后的矩形列表
     */
    fun mergeNearby(regions: List<Rect>): List<Rect> {
        if (regions.size <= 1) return regions
        val sorted = regions.sortedBy { it.left }.toMutableList()
        var changed = true
        while (changed) {
            changed = false
            var i = 0
            while (i < sorted.size - 1) {
                val a = sorted[i]
                val b = sorted[i + 1]
                val vOverlap = min(a.bottom, b.bottom) - max(a.top, b.top)
                val gapThreshold = ((a.width() + b.width()) / 2 * MERGE_GAP_RATIO).toInt()
                val hGap = b.left - a.right
                if (vOverlap > 0 && hGap <= gapThreshold) {
                    sorted[i] = Rect(
                        min(a.left, b.left), min(a.top, b.top),
                        max(a.right, b.right), max(a.bottom, b.bottom)
                    )
                    sorted.removeAt(i + 1)
                    changed = true
                } else {
                    i++
                }
            }
        }
        return sorted
    }

    /**
     * 统一扩展矩形四周的像素余量。
     *
     * @param regions     待扩展的矩形列表
     * @param imgW        图片宽度（用于边界夹紧）
     * @param imgH        图片高度
     * @param expandRatio 扩展比例（相对图片尺寸，默认 1%）
     * @return 扩展后的矩形列表
     */
    fun expandAll(
        regions: List<Rect>,
        imgW: Int,
        imgH: Int,
        expandRatio: Float = DEFAULT_EXPAND_RATIO
    ): List<Rect> {
        val dW = (imgW * expandRatio).toInt()
        val dH = (imgH * expandRatio).toInt()
        return regions.map { expandRect(it, dW, dH, imgW, imgH) }
    }

    // ═══════════════════════════════════════════════
    //  内部实现
    // ═══════════════════════════════════════════════

    /** 逐列黑色像素分析，返回连续黑色列组成的子框 */
    private fun findBlackSegments(
        box: Rect,
        bitmap: Bitmap,
        hsv: FloatArray
    ): List<Rect> {
        val w = box.width()
        val h = box.height()

        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, box.left, box.top, w, h)

        val isBlackCol = BooleanArray(w)

        for (col in 0 until w) {
            var blackCount = 0
            for (row in 0 until h) {
                val px = pixels[row * w + col]
                Color.RGBToHSV(Color.red(px), Color.green(px), Color.blue(px), hsv)
                if (hsv[1] < BLACK_S_MAX && hsv[2] < BLACK_V_MAX) {
                    blackCount++
                }
            }
            isBlackCol[col] = blackCount.toFloat() / h > BLACK_COL_RATIO
        }

        val segments = mutableListOf<Rect>()
        var segStart = -1
        for (col in 0 until w) {
            if (isBlackCol[col]) {
                if (segStart < 0) segStart = col
            } else {
                if (segStart >= 0) {
                    if (col - segStart >= MIN_SEGMENT_WIDTH) {
                        segments.add(
                            Rect(box.left + segStart, box.top, box.left + col, box.bottom)
                        )
                    }
                    segStart = -1
                }
            }
        }
        if (segStart >= 0 && (w - segStart) >= MIN_SEGMENT_WIDTH) {
            segments.add(Rect(box.left + segStart, box.top, box.left + w, box.bottom))
        }

        return segments
    }

    /** 单框扩展并夹紧 */
    private fun expandRect(
        r: Rect, dW: Int, dH: Int, imgW: Int, imgH: Int
    ): Rect = Rect(
        max(0, r.left - dW),
        max(0, r.top - dH),
        min(imgW, r.right + dW),
        min(imgH, r.bottom + dH)
    )
}
