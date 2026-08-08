package com.yyt.dama.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
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
import kotlin.math.max

/**
 * 通用图片加载器 — 从字节流解码 Bitmap。
 *
 * 两遍解码：先取尺寸，再用 `inSampleSize` 降采样长边到 [maxSide]，
 * 避免大图直接解码导致 OOM。SDK 33+ 显式指定 sRGB 色彩空间。
 * `IdCardEditScreen` / `HomeViewModel` / 敏感信息页均复用此处。
 */
object ImageLoader {

    /**
     * 从 Uri 解码图片。
     *
     * @param context Android Context
     * @param uri 图片 Uri
     * @param maxSide 长边上限，默认 2048
     * @return 解码后的 Bitmap，失败返回 null
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
     * 从字节流解码图片（两遍解码 + 长边降采样 + sRGB）。
     *
     * @param bytes 图片原始字节
     * @param maxSide 长边上限，默认 2048
     * @return 解码后的 Bitmap，失败返回 null
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
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
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
