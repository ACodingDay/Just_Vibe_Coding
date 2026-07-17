package com.yyt.dama.viewmodel

import android.app.Application
import android.graphics.BitmapFactory
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.yyt.dama.ocr.DetectionRequest
import com.yyt.dama.ocr.OcrFacadeImpl
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * ViewModel for HomeScreen.
 * Manages OCR test detection state.
 */
class HomeViewModel(application: Application) : AndroidViewModel(application) {

    private val ctx get() = getApplication<Application>()

    private val _isTestRunning = MutableStateFlow(false)
    val isTestRunning: StateFlow<Boolean> = _isTestRunning.asStateFlow()

    fun runTestDetection(
        onSuccess: (bitmap: android.graphics.Bitmap, regions: List<android.graphics.Rect>) -> Unit,
        onError: (Exception) -> Unit = {}
    ) {
        if (_isTestRunning.value) {
//            Log.d("Dama/HomeVM", "runTestDetection skipped: already running")
            return
        }
//        Log.d("Dama/HomeVM", "runTestDetection start")
        _isTestRunning.value = true
        viewModelScope.launch {
            try {
                // 先在主线程检查测试图片是否存在（避免 onError 在 IO 线程调用 Toast 导致崩溃）
                val assetExists = withContext(Dispatchers.IO) {
                    "test.jpg" in (ctx.assets.list("") ?: emptyArray())
                }
                if (!assetExists) {
                    onError(java.io.FileNotFoundException("test.jpg (asset missing)"))
                    return@launch
                }

                val bitmap = withContext(Dispatchers.IO) {
                    val bytes = ctx.assets.open("test.jpg").readBytes()
                    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                    val m = maxOf(opts.outWidth, opts.outHeight)
                    opts.inSampleSize = if (m > 2048) {
                        var s = 1; while (s * 2048 < m) s *= 2; s
                    } else 1
                    opts.inJustDecodeBounds = false
                    if (android.os.Build.VERSION.SDK_INT >= 33) {
                        opts.inPreferredColorSpace =
                            android.graphics.ColorSpace.get(android.graphics.ColorSpace.Named.SRGB)
                    }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)!!
                }
//                Log.d("Dama/HomeVM", "bitmap decoded: ${bitmap.width}x${bitmap.height}")

                val result = withContext(Dispatchers.IO) {
                    OcrFacadeImpl(ctx).detect(DetectionRequest(bitmap = bitmap))
                }
//                Log.d("Dama/HomeVM", "detection done: ${result.regions.size} regions, calling onSuccess")

                onSuccess(result.bitmap, result.regions)
//                Log.d("Dama/HomeVM", "onSuccess returned")
            } catch (e: Exception) {
//                Log.e("Dama/HomeVM", "Test detection failed", e)
                onError(e)
            } finally {
//                Log.d("Dama/HomeVM", "runTestDetection finally: isTestRunning → false")
                _isTestRunning.value = false
            }
        }
    }

    fun runDebugDetection(
        onSuccess: (bitmap: android.graphics.Bitmap) -> Unit,
        onError: (Exception) -> Unit = {}
    ) {
        if (_isTestRunning.value) return
        _isTestRunning.value = true
        viewModelScope.launch {
            try {
                val assetExists = withContext(Dispatchers.IO) {
                    "test.jpg" in (ctx.assets.list("") ?: emptyArray())
                }
                if (!assetExists) {
                    onError(java.io.FileNotFoundException("test.jpg (asset missing)"))
                    return@launch
                }

                val bitmap = withContext(Dispatchers.IO) {
                    val bytes = ctx.assets.open("test.jpg").readBytes()
                    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                    val m = maxOf(opts.outWidth, opts.outHeight)
                    opts.inSampleSize = if (m > 2048) {
                        var s = 1; while (s * 2048 < m) s *= 2; s
                    } else 1
                    opts.inJustDecodeBounds = false
                    if (android.os.Build.VERSION.SDK_INT >= 33) {
                        opts.inPreferredColorSpace =
                            android.graphics.ColorSpace.get(android.graphics.ColorSpace.Named.SRGB)
                    }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)!!
                }

                val result = withContext(Dispatchers.IO) {
                    OcrFacadeImpl(ctx).detect(DetectionRequest(bitmap = bitmap, debug = true))
                }

                bitmap.recycle()
                onSuccess(result.debugBitmap!!)
            } catch (e: Exception) {
                onError(e)
            } finally {
                _isTestRunning.value = false
            }
        }
    }
}
