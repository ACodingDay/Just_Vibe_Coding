package com.yyt.dama.engine

import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import kotlin.math.max
import kotlin.math.min

/**
 * 身份证检测引擎 — 公共工具函数。
 *
 * 历史上的 `runDetection` / `runFullImageDetection` / `runDualSideDetection` /
 * `runTemplateDetection` 已迁移到 `com.yyt.dama.ocr.OcrFacadeImpl`（阶段四），
 * 双面拼接逻辑提取到 `com.yyt.dama.util.BitmapConcatUtil`（阶段三）。
 *
 * 本文件仅保留供 Facade 调用的两个公共函数（阶段五-14 清理）。
 */

/**
 * 对 OCR 原始框按行分组后统一扩展高度。
 *
 * 同一行内的文本框（垂直重叠）共享该行最大框高度作为扩展基准，
 * 避免中文框高、数字框矮导致的打码不完整。
 *
 * @param boxes   OCR 检测到的原始文本框
 * @param bitmap  原始图片
 * @param expand  扩展比例，0.2 表示上下各扩展行高度的 20%
 *
 * 已公开供 `com.yyt.dama.ocr.OcrFacadeImpl` 调用（阶段三-8 提取）。
 */
fun expandOcrBoxes(
    boxes: List<Rect>,
    bitmap: Bitmap,
    expand: Float
): List<Rect> {
    if (boxes.isEmpty()) return emptyList()
    val imgW = bitmap.width
    val imgH = bitmap.height

    // 按行分组：两个框垂直重叠则为同一行
    val rows = mutableListOf<MutableList<Rect>>()
    val sorted = boxes.sortedBy { it.top }
    for (box in sorted) {
        val existingRow = rows.find { row ->
            row.any { min(it.bottom, box.bottom) - max(it.top, box.top) > 0 }
        }
        if (existingRow != null) {
            existingRow.add(box)
        } else {
            rows.add(mutableListOf(box))
        }
    }

    return rows.flatMap { row ->
        val rowHeight = row.maxOf { it.height() }
        val padY = (rowHeight * expand).toInt().coerceAtLeast(2)
        val padX = (imgW * 0.02f).toInt().coerceAtLeast(4)
        Log.d("TemplateDetection",
            "  行分组: ${row.size}框, 最大高度=$rowHeight, padY=$padY, padX=$padX, 框=${row.map { "$it" }}")
        row.map { box ->
            val expanded = Rect(
                max(0, box.left - padX),
                max(0, box.top - padY),
                min(imgW, box.right + padX),
                min(imgH, box.bottom + padY)
            )
            Log.d("TemplateDetection",
                "    框 $box + padX=$padX padY=$padY → $expanded")
            expanded
        }
    }
}

/**
 * 将矩形向上下右扩展指定比例，左边界保持不变（避免超出身份证边缘）。
 *
 * @param region  原始矩形
 * @param imgW    图片宽度
 * @param imgH    图片高度
 * @param padding 扩展比例（0.2 = 上下右各扩展宽/高的 20%）
 *
 * 已公开供 `com.yyt.dama.ocr.OcrFacadeImpl` 调用（阶段三-8 提取）。
 */
fun expandRegion(
    region: Rect, imgW: Int, imgH: Int, padding: Float
): Rect {
    val padX = (region.width() * padding).toInt()
    val padY = (region.height() * padding).toInt()
    return Rect(
        region.left,  // 左边界不扩展
        max(0, region.top - padY),
        min(imgW, region.right + padX),
        min(imgH, region.bottom + padY)
    )
}
