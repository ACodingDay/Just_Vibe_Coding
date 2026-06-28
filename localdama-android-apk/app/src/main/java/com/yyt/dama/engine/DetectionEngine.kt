package com.yyt.dama.engine

import android.content.Context
import android.graphics.*
import android.util.Log
import com.yyt.dama.feature.idcard.CardOrientation
import com.yyt.dama.feature.idcard.CardSide
import com.yyt.dama.feature.idcard.overlapRatio
import com.yyt.dama.feature.idcard.templateFor
import com.yyt.dama.feature.idcard.toRect
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * 身份证检测引擎。
 * 根据卡片在屏幕上的 overlay 位置，裁剪原图 → 全图检测 → 模板区域过滤。
 *
 * @return Pair(裁剪后的原图副本, 过滤后的检测区域列表)
 */
fun runDetection(
    context: Context,
    original: Bitmap,
    cardOffsetY: Float,
    screenW: Float,
    cardH: Float,
    orientation: CardOrientation = CardOrientation.LANDSCAPE
): Pair<Bitmap, List<Rect>> {
    val imgW = original.width
    val imgH = original.height
    val scale = imgW / screenW

    // 卡片在原图上的裁剪区域
    val cropY = max(0, (cardOffsetY * scale).roundToInt())
    val cropH = min(imgH - cropY, (cardH * scale).roundToInt())

    // 裁剪原图的指定区域（createBitmap 创建的是共享像素的 view，不额外分配内存）
    // 不能单独 recycle，因为它与 original 共享像素缓冲区
    val cropped = Bitmap.createBitmap(original, 0, cropY, imgW, cropH)

    val detector = OcrDetector(context)
    val allBoxes = detector.detect(cropped)
    detector.close()

    // 模板过滤（排除照片区域，照片不需要 OCR 文本匹配）
    val regionRects = templateFor(orientation).filter { !it.isDashed }.map { it.toRect(imgW, cropH) }
    val filtered = allBoxes.filter { box ->
        regionRects.any { r -> overlapRatio(box, r) > 0.15f }
    }

    // 返回裁剪原图副本 + 检测区域（不画红框，由 ResultScreen 处理显示）
    return Pair(cropped, filtered)
}

/**
 * 全图检测（适用于相机拍照场景）。
 *
 * 直接对完整图片执行 OCR，然后用模板区域过滤。
 * 无需 overlay 偏移量参数，因为相机拍摄的照片中卡片通常占据主要画面。
 *
 * @param context     用于加载 ONNX 模型
 * @param original    原始图片
 * @param orientation 模板方向
 * @param side        正反面（决定使用哪套模板）
 * @return Pair(原图引用, 过滤后的检测区域列表)
 */
fun runFullImageDetection(
    context: Context,
    original: Bitmap,
    orientation: CardOrientation = CardOrientation.LANDSCAPE,
    side: CardSide = CardSide.FRONT
): Pair<Bitmap, List<Rect>> {
    val imgW = original.width
    val imgH = original.height

    val detector = OcrDetector(context)
    val allBoxes = detector.detect(original)
    detector.close()

    // 使用对应正反面的模板过滤
    val regionRects = templateFor(orientation, side)
        .filter { !it.isDashed }
        .map { it.toRect(imgW, imgH) }

    val filtered = allBoxes.filter { box ->
        regionRects.any { r -> overlapRatio(box, r) > 0.15f }
    }

    Log.d("DetectionEngine",
        "全图检测 ${imgW}x${imgH}，面=${side}，模板区域=${regionRects.size}，" +
        "原始检测=${allBoxes.size}，过滤后=${filtered.size}")

    return Pair(original, filtered)
}

/**
 * 双面检测：对正反面分别执行 OCR，并将两张图纵向拼接。
 *
 * @return Triple(拼接后的图片, 正面区域列表, 反面区域列表)
 *         反面区域的坐标已偏移到拼接图的坐标系中。
 */
fun runDualSideDetection(
    context: Context,
    frontBitmap: Bitmap,
    backBitmap: Bitmap,
    orientation: CardOrientation = CardOrientation.LANDSCAPE
): Triple<Bitmap, List<Rect>, List<Rect>> {
    // 分别检测
    val (_, frontRegions) = runFullImageDetection(context, frontBitmap, orientation, CardSide.FRONT)
    val (_, backRegions) = runFullImageDetection(context, backBitmap, orientation, CardSide.BACK)

    // 纵向拼接两张图（用于 ResultScreen 展示）
    val combinedW = max(frontBitmap.width, backBitmap.width)
    val combinedH = frontBitmap.height + backBitmap.height
    val combined = Bitmap.createBitmap(combinedW, combinedH, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(combined)
    canvas.drawBitmap(frontBitmap, 0f, 0f, null)
    canvas.drawBitmap(backBitmap, 0f, frontBitmap.height.toFloat(), null)

    // 反面区域偏移到拼接图坐标系
    val yOffset = frontBitmap.height
    val adjustedBackRegions = backRegions.map { r ->
        Rect(r.left, r.top + yOffset, r.right, r.bottom + yOffset)
    }

    Log.d("DetectionEngine",
        "双面检测：正面${frontRegions.size}个区域，反面${backRegions.size}个区域")

    return Triple(combined, frontRegions, adjustedBackRegions)
}

/**
 * 模板驱动的区域 OCR 检测。
 *
 * 将身份证模板的文本字段区域映射到原图上，
 * 每个区域向外扩展一定比例作为"搜索区"，
 * 仅在搜索区内执行 OCR，用实际检测到的文本框做打码。
 *
 * 模板仅用于缩小搜索范围，不直接决定打码区域，
 * 从而容忍拍照时的位置偏移和轻微旋转。
 *
 * @param context       用于加载 ONNX 模型
 * @param original      原始图片（不会被修改）
 * @param orientation   模板方向（默认横向）
 * @param searchPadding 搜索区扩展比例，0.4 表示四周各扩展模板宽/高的 40%
 * @return 检测到的打码区域列表（原图坐标）
 */
fun runTemplateDetection(
    context: Context,
    original: Bitmap,
    orientation: CardOrientation = CardOrientation.LANDSCAPE,
    searchPadding: Float = 0.4f
): List<Rect> {
    val imgW = original.width
    val imgH = original.height

    // 排除照片字段（isDashed），只保留文本区域
    val textFields = templateFor(orientation).filter { !it.isDashed }
    Log.d("TemplateDetection",
        "原图 ${imgW}x${imgH}，模板文本区域 ${textFields.size} 个，搜索扩展 ${searchPadding * 100}%")

    val detector = OcrDetector(context)
    val allRegions = mutableListOf<Rect>()

    try {
        for (field in textFields) {
            val region = field.toRect(imgW, imgH)

            // 扩展为搜索区，容忍拍照偏移
            val searchZone = expandRegion(region, imgW, imgH, searchPadding)
            Log.d("TemplateDetection",
                "→ 字段 [${field.label}] 模板 $region → 搜索区 $searchZone")

            // 在搜索区内做 OCR
            val boxes = detector.detectInRegion(original, searchZone)

            // 颜色过滤 + 合并 + 扩展
            val processed = MosaicRegions.process(boxes, original)

            allRegions.addAll(processed)
        }
    } finally {
        detector.close()
    }

    Log.d("TemplateDetection", "共检测到 ${allRegions.size} 个打码区域")
    return allRegions
}

/**
 * 将矩形向四周扩展指定比例，并夹紧到图片边界。
 *
 * @param region  原始矩形
 * @param imgW    图片宽度
 * @param imgH    图片高度
 * @param padding 扩展比例（0.4 = 四周各扩展宽/高的 40%）
 */
private fun expandRegion(
    region: Rect, imgW: Int, imgH: Int, padding: Float
): Rect {
    val padX = (region.width() * padding).toInt()
    val padY = (region.height() * padding).toInt()
    return Rect(
        max(0, region.left - padX),
        max(0, region.top - padY),
        min(imgW, region.right + padX),
        min(imgH, region.bottom + padY)
    )
}
