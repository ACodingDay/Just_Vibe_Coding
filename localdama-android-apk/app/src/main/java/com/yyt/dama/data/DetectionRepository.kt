package com.yyt.dama.data

import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.yyt.dama.navigation.DetectionSource
import java.util.concurrent.atomic.AtomicReference

private const val TAG = "Dama/DetectRepo"

/**
 * Singleton repository for sharing detection results across navigation destinations.
 *
 * Bitmaps are too large to pass as navigation arguments. This repository holds
 * references between screens and provides delayed recycling to avoid crashes during
 * exit animations.
 */
object DetectionRepository {

    /** Delay before recycling bitmaps after ResultScreen exits. */
    private const val RECYCLE_DELAY_MS = 500L

    private val handler = Handler(Looper.getMainLooper())
    private val _originalBitmap = AtomicReference<Bitmap?>(null)
    private val _regions = AtomicReference<List<Rect>>(emptyList())
    private val _source = AtomicReference(DetectionSource.DEFAULT)

    /** Pending recycle runnable — cancelled if a new result arrives before it fires. */
    private var pendingRecycle: Runnable? = null

    val originalBitmap: Bitmap? get() = _originalBitmap.get()
    val regions: List<Rect> get() = _regions.get()
    val source: DetectionSource get() = _source.get()

    /**
     * Store detection result for the ResultScreen to consume.
     * Cancels any pending recycle from a previous bitmap to prevent double-recycle.
     */
    fun setResult(bitmap: Bitmap, regions: List<Rect>, source: DetectionSource) {
//        Log.d(TAG, "setResult: bmp=${bitmap.width}x${bitmap.height} regions=${regions.size} source=$source")
        // Cancel any pending recycle from a previous bitmap
        pendingRecycle?.let { handler.removeCallbacks(it) }
        pendingRecycle = null

        _originalBitmap.set(bitmap)
        _regions.set(regions)
        _source.set(source)
    }

    /**
     * Clear references and schedule delayed bitmap recycling.
     * Call this when the ResultScreen exits. The [RECYCLE_DELAY_MS] delay ensures
     * exit animations can still render the bitmap safely.
     */
    fun clear() {
        val bitmap = _originalBitmap.getAndSet(null)
        _regions.set(emptyList())
        _source.set(DetectionSource.DEFAULT)
//        Log.d(TAG, "clear: bitmap=${if (bitmap != null) "present recycled=${bitmap.isRecycled}" else "null"}")

        if (bitmap != null && !bitmap.isRecycled) {
            val recycleRunnable = Runnable {
                if (!bitmap.isRecycled) {
                    bitmap.recycle()
//                    Log.d(TAG, "delayed recycle completed")
                }
                pendingRecycle = null
            }
            pendingRecycle = recycleRunnable
            handler.postDelayed(recycleRunnable, RECYCLE_DELAY_MS)
//            Log.d(TAG, "scheduled recycle in ${RECYCLE_DELAY_MS}ms")
        }
    }
}
