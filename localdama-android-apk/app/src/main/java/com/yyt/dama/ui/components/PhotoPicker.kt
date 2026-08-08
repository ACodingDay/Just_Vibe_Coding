package com.yyt.dama.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import kotlin.math.max

/**
 * 通用图片加载器 — 从字节流解码 Bitmap。
 *
 * 两遍解码：先取尺寸，再用 `inSampleSize` 降采样长边到 [maxSide]，
 * 避免大图直接解码导致 OOM。解码后按 EXIF 方向旋转（相册/相机直出的
 * JPEG 常带 orientation 标签，不旋转会让文字侧躺、OCR 识别率骤降）。
 * SDK 33+ 显式指定 sRGB 色彩空间。
 * `IdCardEditScreen` / `HomeViewModel` / 敏感信息页均复用此处。
 */
object ImageLoader {

    /**
     * 从 Uri 解码图片。
     *
     * @param context Android Context
     * @param uri 图片 Uri
     * @param maxSide 长边上限，默认 2048
     * @return 解码并校正方向后的 Bitmap，失败返回 null
     */
    suspend fun decodeFromUri(
        context: Context,
        uri: Uri,
        maxSide: Int = 2048
    ): Bitmap? = withContext(Dispatchers.IO) {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: return@withContext null
        decode(bytes, maxSide)
    }

    /**
     * 从字节流解码图片（两遍解码 + 长边降采样 + EXIF 旋转 + sRGB）。
     *
     * @param bytes 图片原始字节
     * @param maxSide 长边上限，默认 2048
     * @return 解码并校正方向后的 Bitmap，失败返回 null
     */
    fun decode(bytes: ByteArray, maxSide: Int = 2048): Bitmap? {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
        val m = max(opts.outWidth, opts.outHeight)
        opts.inSampleSize = if (m > maxSide) {
            var s = 1
            while (s * maxSide < m) s *= 2
            s
        } else 1
        opts.inJustDecodeBounds = false
        if (Build.VERSION.SDK_INT >= 33) {
            opts.inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
        }
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return null
        return rotateByExif(bitmap, bytes)
    }

    /**
     * 按 EXIF orientation 标签旋转解码结果。
     *
     * 手机相册/相机直出的 JPEG 竖拍照片带 90° 方向标签，`BitmapFactory`
     * 解码时不校正方向，直接送去 OCR 会让文字侧躺导致识别率骤降。
     */
    private fun rotateByExif(bitmap: Bitmap, bytes: ByteArray): Bitmap {
        val orientation = try {
            ExifInterface(ByteArrayInputStream(bytes))
                .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } catch (e: Exception) {
            ExifInterface.ORIENTATION_NORMAL
        }
        val degrees = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90
            ExifInterface.ORIENTATION_ROTATE_180 -> 180
            ExifInterface.ORIENTATION_ROTATE_270 -> 270
            else -> 0
        }
        return rotateByDegrees(bitmap, degrees)
    }

    /**
     * 按角度旋转位图，旋转后实例不同时回收原图。
     *
     * 相机路径（`imageInfo.rotationDegrees`，见 CameraScreen）与
     * 相册路径（EXIF 方向）共用；角度是 90 的倍数时不会产生多余边距。
     */
    fun rotateByDegrees(bitmap: Bitmap, degrees: Int): Bitmap {
        if (degrees % 360 == 0) return bitmap
        val rotated = Bitmap.createBitmap(
            bitmap, 0, 0, bitmap.width, bitmap.height,
            Matrix().apply { postRotate((degrees % 360).toFloat()) }, true
        )
        if (rotated !== bitmap) bitmap.recycle()
        return rotated
    }
}

/**
 * 相册选取启动器 — 通用可复用 Composable。
 *
 * 封装 `ActivityResultContracts.PickVisualMedia`，
 * 业务方调用 [PhotoPickerLauncher.launch] 弹出系统相册，
 * 选取完成后通过构造时传入的 [onPicked] 回调返回 Uri。
 *
 * 用法：
 * ```
 * val picker = rememberPhotoPicker { uri ->
 *     scope.launch { ImageLoader.decodeFromUri(context, uri)?.let { bmp -> ... } }
 * }
 * Button(onClick = { picker.launch() }) { ... }
 * ```
 */
class PhotoPickerLauncher(private val launcher: androidx.activity.result.ActivityResultLauncher<PickVisualMediaRequest>) {
    fun launch() {
        launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }
}

/**
 * 记忆化一个相册选取启动器。
 *
 * @param onPicked 选取完成回调，Uri 可能为 null（用户取消）
 */
@Composable
fun rememberPhotoPicker(onPicked: (Uri?) -> Unit): PhotoPickerLauncher {
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri -> onPicked(uri) }
    return remember(launcher) { PhotoPickerLauncher(launcher) }
}
