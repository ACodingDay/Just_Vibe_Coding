package com.yyt.dama.ocr

import android.graphics.Bitmap
import android.graphics.Rect

/**
 * 检测结果 — [OcrFacade] 返回给界面层的标准输出。
 *
 * @property bitmap 原始图片引用（未被修改，调用方负责回收）
 * @property regions 检测到的打码区域（原图坐标）
 * @property debugBitmap 调试可视化图，仅在 [DetectionRequest.debug] = `true` 时非空
 */
data class DetectionResult(
    val bitmap: Bitmap,
    val regions: List<Rect>,
    val debugBitmap: Bitmap? = null,
)
