package com.yyt.dama.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.yyt.dama.ocr.DetectionRequest
import com.yyt.dama.ocr.OcrFacadeImpl
import com.yyt.dama.ui.components.ImageLoader
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

    /**
     * 加载 assets 下的 test.jpg（两遍解码 + 长边 2048 降采样 + sRGB，复用 [ImageLoader]）。
     *
     * @throws java.io.FileNotFoundException 测试图片不存在时抛出
     */
    private suspend fun loadTestBitmap(): android.graphics.Bitmap = withContext(Dispatchers.IO) {
        if ("test.jpg" !in (ctx.assets.list("") ?: emptyArray())) {
            throw java.io.FileNotFoundException("test.jpg (asset missing)")
        }
        val bytes = ctx.assets.open("test.jpg").readBytes()
        ImageLoader.decode(bytes)
            ?: throw java.io.IOException("test.jpg decode failed")
    }

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
                val bitmap = loadTestBitmap()
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
                val bitmap = loadTestBitmap()

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

    /**
     * 文本识别测试 — 按 OCR 测试的搜索区做 det 检测 + 整行 rec 识别，
     * 识别到的文本/数字打印到日志（tag: OCR-Probe）。
     *
     * @param onDone 成功回调，参数为识别到的文本行总数
     */
    fun runTextRecognitionTest(
        onDone: (lineCount: Int) -> Unit = {},
        onError: (Exception) -> Unit = {}
    ) {
        if (_isTestRunning.value) return
        _isTestRunning.value = true
        viewModelScope.launch {
            try {
                val bitmap = loadTestBitmap()

                val results = withContext(Dispatchers.IO) {
                    com.yyt.dama.ocr.OcrTextProbe.probe(ctx, bitmap)
                }
                val lineCount = results.sumOf { it.lines.size }
                Log.d("Dama/HomeVM", "文本识别测试完成: ${results.size} 字段, $lineCount 行")

                bitmap.recycle()
                onDone(lineCount)
            } catch (e: Exception) {
                Log.e("Dama/HomeVM", "文本识别测试失败", e)
                onError(e)
            } finally {
                _isTestRunning.value = false
            }
        }
    }
}
