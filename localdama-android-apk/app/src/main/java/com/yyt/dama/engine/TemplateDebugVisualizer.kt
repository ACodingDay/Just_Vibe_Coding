package com.yyt.dama.engine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.util.Log
import com.yyt.dama.feature.idcard.CardOrientation
import com.yyt.dama.feature.idcard.CardSide
import com.yyt.dama.feature.idcard.IdCardField
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
 */
object TemplateDebugVisualizer {

    private const val TAG = "TemplateDebug"

    /**
     * 生成一张调试可视化图。
     *
     * @param original      原始图片
     * @param orientation   模板方向
     * @param side          正反面
     * @param searchPadding 搜索区扩展比例（与 runTemplateDetection 一致）
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
            val searchZone = expandRegionPublic(region, imgW, imgH, searchPadding)
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

    /**
     * 调试用：运行模板检测并返回可视化结果图。
     *
     * 与 runTemplateDetection 使用相同的检测流程：
     *   1. 模板字段区域 + 20% 搜索扩展 → 缩小 OCR 范围
     *   2. OCR 原始框 + 20% 像素扩展 → 最终打码区域
     */
    fun runDebugDetection(
        context: android.content.Context,
        original: Bitmap,
        orientation: CardOrientation = CardOrientation.LANDSCAPE,
        side: CardSide = CardSide.FRONT,
        searchPadding: Float = 0.2f,
        finalExpand: Float = 0.2f
    ): Bitmap {
        val imgW = original.width
        val imgH = original.height

        val textFields = templateFor(orientation, side).filter { !it.isDashed }
        Log.d(TAG, "调试检测: ${imgW}x${imgH}, ${textFields.size}个文本字段, " +
                "搜索扩展${searchPadding * 100}%, 最终扩展${finalExpand * 100}%")

        val detector = OcrDetector(context)
        val allRawBoxes = mutableListOf<Rect>()
        val allFinalRegions = mutableListOf<Rect>()

        try {
            for (field in textFields) {
                val region = field.toRect(imgW, imgH)
                val searchZone = expandRegionPublic(region, imgW, imgH, searchPadding)

                Log.d(TAG, "→ [${field.label}] 模板=$region 搜索区=$searchZone")

                val boxes = detector.detectInRegion(original, searchZone)
                allRawBoxes.addAll(boxes)

                // 计算该字段所有 OCR 框的合并边界（像素坐标 + 百分比坐标）
                val mergedBounds = if (boxes.isEmpty()) Rect()
                else Rect(
                    boxes.minOf { it.left }, boxes.minOf { it.top },
                    boxes.maxOf { it.right }, boxes.maxOf { it.bottom }
                )
                val pctStr = if (boxes.isNotEmpty()) {
                    "pct=(%.3f,%.3f,%.3f,%.3f)".format(
                        mergedBounds.left.toFloat() / imgW,
                        mergedBounds.top.toFloat() / imgH,
                        (mergedBounds.right - mergedBounds.left).toFloat() / imgW,
                        (mergedBounds.bottom - mergedBounds.top).toFloat() / imgH
                    )
                } else { "" }

                Log.d(TAG, "  [${field.label}] OCR=${boxes.size}框, " +
                        "合并边界=$mergedBounds $pctStr, " +
                        "各框=${boxes.map { "$it" }}")

                // OCR 原始框直接扩展作为打码区域（与 runTemplateDetection 一致）
                val expanded = expandRawBoxes(boxes, imgW, imgH, finalExpand)
                allFinalRegions.addAll(expanded)

                Log.d(TAG, "  [${field.label}] OCR=${boxes.size}框 → 最终=${expanded.size}区域")
            }
        } finally {
            detector.close()
        }

        Log.d(TAG, "总计: OCR原始${allRawBoxes.size}框, 最终${allFinalRegions.size}区域")

        return visualize(
            original, orientation, side, searchPadding,
            allRawBoxes, allFinalRegions
        )
    }

    /** 对 OCR 原始框按行分组后统一扩展高度（与 DetectionEngine.expandOcrBoxes 一致） */
    private fun expandRawBoxes(
        boxes: List<Rect>, imgW: Int, imgH: Int, expand: Float
    ): List<Rect> {
        if (boxes.isEmpty()) return emptyList()

        val rows = mutableListOf<MutableList<Rect>>()
        val sorted = boxes.sortedBy { it.top }
        for (box in sorted) {
            val existingRow = rows.find { row ->
                row.any { min(it.bottom, box.bottom) - max(it.top, box.top) > 0 }
            }
            if (existingRow != null) existingRow.add(box)
            else rows.add(mutableListOf(box))
        }

        return rows.flatMap { row ->
            val rowHeight = row.maxOf { it.height() }
            val padY = (rowHeight * expand).toInt().coerceAtLeast(2)
            val padX = (imgW * 0.02f).toInt().coerceAtLeast(4)
            row.map { box ->
                Rect(
                    max(0, box.left - padX),
                    max(0, box.top - padY),
                    min(imgW, box.right + padX),
                    min(imgH, box.bottom + padY)
                )
            }
        }
    }

    /** 搜索区扩展：左边界保持不变，上下右扩展（与 DetectionEngine.expandRegion 一致） */
    private fun expandRegionPublic(
        region: Rect, imgW: Int, imgH: Int, padding: Float
    ): Rect {
        val padX = (region.width() * padding).toInt()
        val padY = (region.height() * padding).toInt()
        return Rect(
            region.left,
            max(0, region.top - padY),
            min(imgW, region.right + padX),
            min(imgH, region.bottom + padY)
        )
    }
}
