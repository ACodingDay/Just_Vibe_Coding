package com.yyt.dama.util

import android.graphics.Bitmap
import android.graphics.Matrix
import kotlin.math.roundToInt

/**
 * 取景框在屏幕上的百分比坐标（0~1 范围）。
 *
 * 用于将取景框从屏幕坐标系映射到任意分辨率的照片坐标系。
 * 参考 CameraCrop 项目的百分比映射算法：
 *   取景框在屏幕上占百分之几 → 照片上也占同样的百分之几
 *
 * @param left   取景框左边界占屏幕宽的比例（0.0 ~ 1.0）
 * @param top    取景框上边界占屏幕高的比例（0.0 ~ 1.0）
 * @param right  取景框右边界占屏幕宽的比例（0.0 ~ 1.0）
 * @param bottom 取景框下边界占屏幕高的比例（0.0 ~ 1.0）
 */
data class OverlayPercentRect(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float
) {
    val widthPercent: Float get() = right - left
    val heightPercent: Float get() = bottom - top
}

/**
 * 相机照片裁剪工具。
 *
 * 采用 CameraCrop 项目的「两步裁剪法」（+ 方向对齐前置步骤）：
 *
 *   全分辨率照片 (如 4000×3000 横向)
 *       │
 *       ├─ Step 0: rotateToMatchScreen()
 *       │   如果照片方向与屏幕方向不一致，旋转 90° 使其对齐。
 *       │   例：横向传感器照片 → 旋转 90° → 竖向（与竖屏一致）
 *       │
 *       ├─ Step 1: cropToPreviewRatio()
 *       │   裁剪为与 PreviewView 等宽高比（中心对齐），
 *       │   消除相机传感器与屏幕纵横比不一致带来的偏差。
 *       │
 *       ├─ Step 2: cropToOverlay()
 *       │   用取景框的百分比坐标，从等比例图中裁出卡片区域。
 *       │   百分比天然跨分辨率，无需手动 scale/cropOffset。
 *       │
 *       └─ 裁剪图 → OCR
 *
 * 参考：https://github.com/wildma/IDCardCamera (CameraCrop 基于该项目)
 */
object CropUtils {

    /**
     * Step 0 — 方向对齐：如果照片方向和屏幕方向不一致，旋转照片 90°。
     *
     * 相机传感器通常输出横向照片（宽 > 高），但手机通常是竖屏握持。
     * 如果直接对横向照片用竖向屏幕的 viewRatio 做等比例裁剪，
     * 会产生方向错误的结果（横向照片被裁成竖向）。
     *
     * 例：传感器输出 4000×3000（横向），竖屏 viewRatio=0.45。
     * 不旋转 → cropToPreviewRatio 裁出 1350×3000（竖向）→ 卡片方向错误。
     * 旋转90° → 3000×4000（竖向）→ cropToPreviewRatio 裁出 1800×4000（竖向）→ 正确。
     *
     * 参考 CameraCrop 项目的 cropImage 方向处理：
     *   竖屏时 bitmapH = max(w,h), bitmapW = min(w,h)，本质就是方向统一。
     *
     * @param photo     相机原始照片
     * @param viewRatio 屏幕宽高比 = viewW / viewH
     *                  > 1.0 表示横屏，< 1.0 表示竖屏
     * @return 方向与屏幕对齐的照片；如果方向一致则返回原图
     */
    fun rotateToMatchScreen(photo: Bitmap, viewRatio: Float): Bitmap {
        val photoIsLandscape = photo.width > photo.height
        val screenIsLandscape = viewRatio > 1.0f

        if (photoIsLandscape == screenIsLandscape) {
            // 方向一致，无需旋转
            return photo
        }

        // 方向不一致 → 旋转 90°
        val matrix = Matrix()
        matrix.postRotate(90f)
        val rotated = Bitmap.createBitmap(photo, 0, 0, photo.width, photo.height, matrix, true)
        if (rotated !== photo) {
            // 旋转产生了新位图，原图不再需要
            photo.recycle()
        }
        return rotated
    }

    /**
     * Step 1 — 等比例裁剪：将照片裁剪为与预览 View 等宽高比（中心对齐）。
     *
     * 前提：照片已通过 [rotateToMatchScreen] 与屏幕方向对齐。
     * 相机传感器（如 4:3）和屏幕 PreviewView（如 9:20）纵横比通常不一致。
     * 这一步从照片中心裁出与屏幕等比例的区域，确保后续百分比映射准确。
     *
     * @param photo     已与屏幕方向对齐的照片
     * @param viewRatio 屏幕 PreviewView 的宽高比 = viewWidth / viewHeight
     * @return 与屏幕等宽高比的中间结果图片，或原图（如果比例完全一致）
     */
    fun cropToPreviewRatio(photo: Bitmap, viewRatio: Float): Bitmap {
        val photoW = photo.width
        val photoH = photo.height
        val photoRatio = photoW.toFloat() / photoH

        if (Math.abs(photoRatio - viewRatio) < 0.001f) {
            // 比例一致，无需裁剪
            return photo
        }

        return if (photoRatio > viewRatio) {
            // 照片更"扁"（宽比例更大）→ 按高度对齐，左右裁掉多余部分
            // 类似 CameraX FILL_CENTER 的行为：高度填满，宽度裁切
            val needW = (photoH * viewRatio).roundToInt()
            Bitmap.createBitmap(photo, (photoW - needW) / 2, 0, needW, photoH)
        } else {
            // 照片更"窄"（高比例更大）→ 按宽度对齐，上下裁掉多余部分
            val needH = (photoW / viewRatio).roundToInt()
            Bitmap.createBitmap(photo, 0, (photoH - needH) / 2, photoW, needH)
        }
    }

    /**
     * Step 2 — 取景框裁剪：用百分比坐标从等比例图中裁出卡片区域。
     *
     * 因为 [ratioBitmap] 已经和 PreviewView 等宽高比，
     * 取景框在屏幕上的百分比坐标可以直接映射到图片像素坐标。
     *
     * @param ratioBitmap 第一步裁剪后的等比例图片
     * @param overlay     取景框在屏幕上的百分比坐标
     * @return 取景框内的卡片区域图片
     */
    fun cropToOverlay(ratioBitmap: Bitmap, overlay: OverlayPercentRect): Bitmap {
        val x = (overlay.left * ratioBitmap.width).roundToInt()
            .coerceIn(0, ratioBitmap.width)
        val y = (overlay.top * ratioBitmap.height).roundToInt()
            .coerceIn(0, ratioBitmap.height)
        val w = (overlay.widthPercent * ratioBitmap.width).roundToInt()
            .coerceAtMost(ratioBitmap.width - x)
        val h = (overlay.heightPercent * ratioBitmap.height).roundToInt()
            .coerceAtMost(ratioBitmap.height - y)

        return Bitmap.createBitmap(ratioBitmap, x, y, w, h)
    }

    /**
     * 组合入口：方向对齐 → 等比例裁剪 → 取景框裁剪 → 卡片区域图片。
     *
     * @param photo      全分辨率相机照片（可能是横向传感器输出）
     * @param viewRatio  屏幕 PreviewView 宽高比
     * @param overlay    取景框百分比坐标
     * @return 裁剪后的卡片区域图片（方向与屏幕一致）
     */
    fun cropCameraPhoto(photo: Bitmap, viewRatio: Float, overlay: OverlayPercentRect): Bitmap {
        // Step 0: 方向对齐（参考 CameraCrop 的 cropImage 中的旋转逻辑）
        val oriented = rotateToMatchScreen(photo, viewRatio)

        // Step 1: 等比例裁剪
        val ratioBmp = cropToPreviewRatio(oriented, viewRatio)
        if (ratioBmp === oriented) {
            return cropToOverlay(oriented, overlay)
        }
        val result = cropToOverlay(ratioBmp, overlay)
        if (ratioBmp !== result) {
            ratioBmp.recycle()
        }
        return result
    }
}
