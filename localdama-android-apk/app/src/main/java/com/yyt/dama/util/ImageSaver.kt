package com.yyt.dama.util

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

/**
 * Result of a save-to-gallery operation.
 */
sealed class SaveResult {
    data class Success(val uri: Uri) : SaveResult()
    data class Failure(val message: String) : SaveResult()
}

/**
 * Image saving and sharing utility.
 * Returns results instead of showing Toasts directly,
 * allowing callers to display feedback via Snackbar or other UI.
 */
object ImageSaver {

    private const val SAVE_DIR = "Dama"

    /**
     * Save Bitmap to system gallery Pictures/Dama directory.
     *
     * @return [SaveResult.Success] with the content Uri, or [SaveResult.Failure] on error.
     */
    fun saveToGallery(
        context: Context,
        bitmap: Bitmap,
        filename: String = "dama_${System.currentTimeMillis()}"
    ): SaveResult {
        return try {
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, "$filename.png")
                put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$SAVE_DIR")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
            }

            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
                ?: return SaveResult.Failure("Failed to create media entry")

            resolver.openOutputStream(uri)?.use { stream ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentValues.clear()
                contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
            }

            SaveResult.Success(uri)
        } catch (e: Exception) {
            SaveResult.Failure(e.message ?: "Unknown error")
        }
    }

    /**
     * Share image via system share sheet.
     * This is fire-and-forget; the system chooser provides its own UI feedback.
     */
    fun shareImage(context: Context, bitmap: Bitmap) {
        try {
            val cachePath = File(context.cacheDir, "shared_images")
            cachePath.mkdirs()
            val file = File(cachePath, "share_${System.currentTimeMillis()}.png")
            FileOutputStream(file).use { stream ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
            }

            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, null))
        } catch (e: Exception) {
            // Sharing failures are silently ignored; system provides its own UI
            android.util.Log.e("ImageSaver", "Share failed", e)
        }
    }
}
