package com.yyt.dama.engine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.util.Log
import com.yyt.dama.feature.idcard.CardOrientation
import com.yyt.dama.feature.idcard.CardSide
import com.yyt.dama.feature.idcard.templateFor
import com.yyt.dama.feature.idcard.toRect
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * 模板调试可视化工具。
 *
 * 将模板字段区域、搜索区、OCR 原始检测框、最终打码区域
 * 全部画到一张图上，方便对比模板坐标与实际 OCR 结果的差异。
 *
 * 颜色说明：
 *   绿色框   = 模板文本字段区域（实线 = 文本，虚线 = 照片/国徽）
 *   黄色框   = 搜索区（模板区域 + searchPadding 扩展）
 *   红色框   = OCR 原始检测框
 *   蓝色框   = MosaicRegions 处理后的最终打码区域
 *   白色文字 = 字段标签
 *
 * 阶段五-16 清理：删除了 `runDebugDetection()`（逻辑已由 `OcrFacadeImpl` 统一编排），
 * 删除了重复的 `expandRawBoxes`/`expandRegionPublic`（改用本文件的公共 `expandRegion`）。
 */
object TemplateDebugVisualizer {

    private const val TAG = "TemplateDebug"

    /**
     * 生成一张调试可视化图。
     *
     * 由 `OcrFacadeImpl` 在 `DetectionRequest.debug = true` 时调用。
     *
     * @param original      原始图片
     * @param orientation   模板方向
     * @param side          正反面
     * @param searchPadding 搜索区扩展比例（与 Facade 检测时一致）
     * @param rawOcrBoxes   每个字段搜索区内的 OCR 原始检测框（原图坐标）
     * @param finalRegions  最终打码区域
     * @return 带调试标注的图片副本
     */
    fun visualize(
        original: Bitmap,
        orientation: CardOrientation = CardOrientation.LANDSCAPE,
        side: CardSide = CardSide.FRONT,
        searchPadding: Float = 0.4f,
        rawOcrBoxes: List<Rect> = emptyList(),
        finalRegions: List<Rect> = emptyList()
    ): Bitmap {
        val result = original.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(result)
        val imgW = original.width
        val imgH = original.height

        val templateFields = templateFor(orientation, side)

        // ── 1. 画搜索区（黄色半透明填充 + 边框）──
        val searchPaint = Paint().apply {
            color = Color.argb(40, 255, 235, 59)  // 黄色半透明
            style = Paint.Style.FILL
        }
        val searchBorderPaint = Paint().apply {
            color = Color.argb(180, 255, 193, 7)  // 深黄边框
            style = Paint.Style.STROKE
            strokeWidth = 2f
        }
        for (field in templateFields.filter { !it.isDashed }) {
            val region = field.toRect(imgW, imgH)
            // 复用 DetectionEngine 的公共 expandRegion（阶段五-16 消除重复实现）
            val searchZone = expandRegion(region, imgW, imgH, searchPadding)
            canvas.drawRect(searchZone, searchPaint)
            canvas.drawRect(searchZone, searchBorderPaint)
        }

        // ── 2. 画模板字段区域（绿色）──
        val solidPaint = Paint().apply {
            color = Color.argb(120, 76, 175, 80)  // 绿色半透明
            style = Paint.Style.STROKE
            strokeWidth = 3f
        }
        val dashedPaint = Paint().apply {
            color = Color.argb(120, 76, 175, 80)
            style = Paint.Style.STROKE
            strokeWidth = 3f
            pathEffect = android.graphics.DashPathEffect(floatArrayOf(15f, 10f), 0f)
        }
        for (field in templateFields) {
            val rect = field.toRect(imgW, imgH)
            canvas.drawRect(rect, if (field.isDashed) dashedPaint else solidPaint)

            // 画字段标签
            val labelPaint = Paint().apply {
                color = Color.WHITE
                textSize = imgH * 0.025f
                setShadowLayer(3f, 1f, 1f, Color.BLACK)
            }
            val fm = labelPaint.fontMetrics
            val labelY = rect.top - fm.descent.coerceAtMost(0f) - 2f
            canvas.drawText(field.label, rect.left.toFloat(), max(labelY, abs(fm.ascent) + 2f), labelPaint)
        }

        // ── 3. 画 OCR 原始检测框（红色）──
        val ocrPaint = Paint().apply {
            color = Color.argb(200, 244, 67, 54)  // 红色
            style = Paint.Style.STROKE
            strokeWidth = 2f
        }
        for (box in rawOcrBoxes) {
            canvas.drawRect(box, ocrPaint)
        }

        // ── 4. 画最终打码区域（蓝色）──
        val finalPaint = Paint().apply {
            color = Color.argb(200, 33, 150, 243)  // 蓝色
            style = Paint.Style.STROKE
            strokeWidth = 4f
        }
        for (region in finalRegions) {
            canvas.drawRect(region, finalPaint)
        }

        // ── 5. 画图例 ──
        val legendPaint = Paint().apply {
            color = Color.WHITE
            textSize = imgH * 0.03f
            setShadowLayer(4f, 2f, 2f, Color.BLACK)
        }
        val lineHeight = imgH * 0.05f
        val legendX = imgW * 0.02f
        var legendY = imgH * 0.05f

        canvas.drawRect(
            Rect(legendX.toInt(), legendY.toInt(),
                 (legendX + imgH * 0.03).toInt(), (legendY + imgH * 0.03).toInt()),
            solidPaint
        )
        canvas.drawText("模板字段", legendX + imgH * 0.04f, legendY + imgH * 0.025f, legendPaint)
        legendY += lineHeight

        canvas.drawRect(
            Rect(legendX.toInt(), legendY.toInt(),
                 (legendX + imgH * 0.03).toInt(), (legendY + imgH * 0.03).toInt()),
            searchBorderPaint
        )
        canvas.drawText("搜索区 (+${(searchPadding * 100).toInt()}%)", legendX + imgH * 0.04f, legendY + imgH * 0.025f, legendPaint)
        legendY += lineHeight

        canvas.drawRect(
            Rect(legendX.toInt(), legendY.toInt(),
                 (legendX + imgH * 0.03).toInt(), (legendY + imgH * 0.03).toInt()),
            ocrPaint
        )
        canvas.drawText("OCR原始框 (${rawOcrBoxes.size})", legendX + imgH * 0.04f, legendY + imgH * 0.025f, legendPaint)
        legendY += lineHeight

        canvas.drawRect(
            Rect(legendX.toInt(), legendY.toInt(),
                 (legendX + imgH * 0.03).toInt(), (legendY + imgH * 0.03).toInt()),
            finalPaint
        )
        canvas.drawText("最终打码区 (${finalRegions.size})", legendX + imgH * 0.04f, legendY + imgH * 0.025f, legendPaint)

        Log.d(TAG, "调试图生成完成: 模板${templateFields.size}字段, " +
                "OCR原始${rawOcrBoxes.size}框, 最终${finalRegions.size}区域, " +
                "图${imgW}x${imgH}")

        return result
    }
}
