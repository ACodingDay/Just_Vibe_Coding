package com.yyt.dama.util

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import kotlin.math.max

/**
 * Bitmap 纵向拼接工具 — 用于双面身份证检测后的图片合并。
 *
 * 从 `DetectionEngine.runDualSideDetection` 提取（阶段三-18），
 * 供界面层在分别调 `OcrFacade` 检测正反面后做拼接。
 *
 * **设计依据**（决策结论 #3）：Facade 保持单图检测契约，
 * 拼接属界面层职责，不放入 Facade。
 */
object BitmapConcatUtil {

    /**
     * 纵向拼接两张图片（back 绘制在 front 下方）。
     *
     * 拼接图宽度取两张图的最大宽度，高度为两者之和；
     * 较窄的图左对齐绘制，右侧留白。
     *
     * @param front 上方图片
     * @param back  下方图片
     * @return 拼接后的新图片（ARGB_8888，独立于输入图片）
     */
    fun concatVertically(front: Bitmap, back: Bitmap): Bitmap {
        val combinedW = max(front.width, back.width)
        val combinedH = front.height + back.height
        val combined = Bitmap.createBitmap(combinedW, combinedH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(combined)
        canvas.drawBitmap(front, 0f, 0f, null)
        canvas.drawBitmap(back, 0f, front.height.toFloat(), null)
        return combined
    }

    /**
     * 纵向拼接两张图片，同时把 back 的 regions 坐标偏移到拼接图坐标系。
     *
     * back 的 regions 需要沿 Y 轴偏移 `front.height`，front 的 regions 坐标不变。
     * 合并后的区域列表可直接用于打码渲染。
     *
     * @param front        上方图片
     * @param frontRegions front 的检测区域（坐标不变）
     * @param back         下方图片
     * @param backRegions  back 的检测区域（Y 轴会被 +front.height 偏移）
     * @return [Pair]（拼接图片, 合并后的所有区域 = frontRegions + 偏移后的 backRegions）
     */
    fun concatVerticallyWithRegions(
        front: Bitmap,
        frontRegions: List<Rect>,
        back: Bitmap,
        backRegions: List<Rect>
    ): Pair<Bitmap, List<Rect>> {
        val combined = concatVertically(front, back)
        val yOffset = front.height
        val adjustedBack = backRegions.map { r ->
            Rect(r.left, r.top + yOffset, r.right, r.bottom + yOffset)
        }
        return Pair(combined, frontRegions + adjustedBack)
    }
}
