package com.yyt.dama.engine

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

/**
 * 马赛克引擎。
 * 对指定区域应用不同风格的隐私打码。
 */
object MosaicEngine {

    /**
     * 对 bitmap 的指定区域应用打码。
     *
     * @param source    原始 Bitmap（不会被修改）
     * @param regions   需要打码的区域列表
     * @param style     打码风格，见 [MosaicStyle]
     * @return 打码后的新 Bitmap
     */
    fun applyMosaic(
        source: Bitmap,
        regions: List<Rect>,
        style: MosaicStyle = MosaicStyle.Pixelate()
    ): Bitmap {
        val result = source.copy(Bitmap.Config.ARGB_8888, true)
        if (regions.isEmpty()) return result

        val w = result.width
        val h = result.height
        val pixels = IntArray(w * h)
        result.getPixels(pixels, 0, w, 0, 0, w, h)

        for (region in regions) {
            val rl = max(0, region.left)
            val rt = max(0, region.top)
            val rr = min(w, region.right)
            val rb = min(h, region.bottom)
            if (rl >= rr || rt >= rb) continue

            when (style) {
                is MosaicStyle.Pixelate -> {
                    applyPixelate(pixels, w, rl, rt, rr, rb, style.blockSize)
                    if (style.noise > 0) applyNoise(pixels, w, rl, rt, rr, rb, style.noise)
                }
                is MosaicStyle.FillWhite -> applyFillWhite(pixels, w, rl, rt, rr, rb)
                is MosaicStyle.Blur -> {
                    applyBlur(pixels, w, rl, rt, rr, rb, style.radius)
                    if (style.noise > 0) applyNoise(pixels, w, rl, rt, rr, rb, style.noise)
                }
            }
        }

        result.setPixels(pixels, 0, w, 0, 0, w, h)
        return result
    }

    // ── 像素化马赛克 ──────────────────────────────────

    private fun applyPixelate(
        pixels: IntArray, w: Int,
        rl: Int, rt: Int, rr: Int, rb: Int,
        blockSize: Int
    ) {
        if (blockSize <= 0) return
        var y = rt
        while (y < rb) {
            val blockBottom = min(y + blockSize, rb)
            var x = rl
            while (x < rr) {
                val blockRight = min(x + blockSize, rr)
                var rSum = 0L; var gSum = 0L; var bSum = 0L; var aSum = 0L
                var count = 0
                for (by in y until blockBottom) {
                    val rowOff = by * w
                    for (bx in x until blockRight) {
                        val p = pixels[rowOff + bx]
                        aSum += (p shr 24) and 0xFF
                        rSum += (p shr 16) and 0xFF
                        gSum += (p shr 8) and 0xFF
                        bSum += p and 0xFF
                        count++
                    }
                }
                if (count == 0) { x += blockSize; continue }
                val avg = Color.argb(
                    (aSum / count).toInt(),
                    (rSum / count).toInt(),
                    (gSum / count).toInt(),
                    (bSum / count).toInt()
                )
                for (by in y until blockBottom) {
                    val rowOff = by * w
                    for (bx in x until blockRight) {
                        pixels[rowOff + bx] = avg
                    }
                }
                x += blockSize
            }
            y += blockSize
        }
    }

    // ── 纯白填充 ──────────────────────────────────────

    private fun applyFillWhite(
        pixels: IntArray, w: Int,
        rl: Int, rt: Int, rr: Int, rb: Int
    ) {
        val white = Color.WHITE
        for (y in rt until rb) {
            val rowOff = y * w
            for (x in rl until rr) {
                pixels[rowOff + x] = white
            }
        }
    }

    // ── 高斯模糊（盒式近似，两遍分离） ────────────────

    private fun applyBlur(
        pixels: IntArray, w: Int,
        rl: Int, rt: Int, rr: Int, rb: Int,
        radius: Int
    ) {
        if (radius <= 0) return
        val rw = rr - rl
        val rh = rb - rt

        // 提取区域像素
        val region = IntArray(rw * rh)
        for (y in 0 until rh) {
            System.arraycopy(pixels, (rt + y) * w + rl, region, y * rw, rw)
        }

        // 第一遍：水平模糊
        val hBlur = IntArray(rw * rh)
        for (y in 0 until rh) {
            val rowOff = y * rw
            var rSum = 0L; var gSum = 0L; var bSum = 0L; var aSum = 0L
            var count = 0

            // 初始化窗口：[-radius, 0]
            for (dx in -radius..0) {
                val sx = max(0, dx)
                val p = region[rowOff + sx]
                aSum += (p shr 24) and 0xFF
                rSum += (p shr 16) and 0xFF
                gSum += (p shr 8) and 0xFF
                bSum += p and 0xFF
                count++
            }
            // 初始化窗口：(0, radius]
            for (dx in 1..radius) {
                if (dx >= rw) break
                val p = region[rowOff + dx]
                aSum += (p shr 24) and 0xFF
                rSum += (p shr 16) and 0xFF
                gSum += (p shr 8) and 0xFF
                bSum += p and 0xFF
                count++
            }
            hBlur[rowOff] = Color.argb(
                (aSum / count).toInt(),
                (rSum / count).toInt(),
                (gSum / count).toInt(),
                (bSum / count).toInt()
            )

            // 滑动窗口
            for (x in 1 until rw) {
                // 移除左边离开窗口的像素
                val removeX = x - radius - 1
                if (removeX >= 0) {
                    val p = region[rowOff + removeX]
                    aSum -= (p shr 24) and 0xFF
                    rSum -= (p shr 16) and 0xFF
                    gSum -= (p shr 8) and 0xFF
                    bSum -= p and 0xFF
                    count--
                }
                // 添加右边进入窗口的像素
                val addX = x + radius
                if (addX < rw) {
                    val p = region[rowOff + addX]
                    aSum += (p shr 24) and 0xFF
                    rSum += (p shr 16) and 0xFF
                    gSum += (p shr 8) and 0xFF
                    bSum += p and 0xFF
                    count++
                }
                hBlur[rowOff + x] = Color.argb(
                    (aSum / count).toInt(),
                    (rSum / count).toInt(),
                    (gSum / count).toInt(),
                    (bSum / count).toInt()
                )
            }
        }

        // 第二遍：垂直模糊
        val vBlur = IntArray(rw * rh)
        for (x in 0 until rw) {
            var rSum = 0L; var gSum = 0L; var bSum = 0L; var aSum = 0L
            var count = 0

            // 初始化窗口：[-radius, 0]
            for (dy in -radius..0) {
                val sy = max(0, dy)
                val p = hBlur[sy * rw + x]
                aSum += (p shr 24) and 0xFF
                rSum += (p shr 16) and 0xFF
                gSum += (p shr 8) and 0xFF
                bSum += p and 0xFF
                count++
            }
            // 初始化窗口：(0, radius]
            for (dy in 1..radius) {
                if (dy >= rh) break
                val p = hBlur[dy * rw + x]
                aSum += (p shr 24) and 0xFF
                rSum += (p shr 16) and 0xFF
                gSum += (p shr 8) and 0xFF
                bSum += p and 0xFF
                count++
            }
            vBlur[x] = Color.argb(
                (aSum / count).toInt(),
                (rSum / count).toInt(),
                (gSum / count).toInt(),
                (bSum / count).toInt()
            )

            // 滑动窗口
            for (y in 1 until rh) {
                val removeY = y - radius - 1
                if (removeY >= 0) {
                    val p = hBlur[removeY * rw + x]
                    aSum -= (p shr 24) and 0xFF
                    rSum -= (p shr 16) and 0xFF
                    gSum -= (p shr 8) and 0xFF
                    bSum -= p and 0xFF
                    count--
                }
                val addY = y + radius
                if (addY < rh) {
                    val p = hBlur[addY * rw + x]
                    aSum += (p shr 24) and 0xFF
                    rSum += (p shr 16) and 0xFF
                    gSum += (p shr 8) and 0xFF
                    bSum += p and 0xFF
                    count++
                }
                vBlur[y * rw + x] = Color.argb(
                    (aSum / count).toInt(),
                    (rSum / count).toInt(),
                    (gSum / count).toInt(),
                    (bSum / count).toInt()
                )
            }
        }

        // 写回全局像素
        for (y in 0 until rh) {
            System.arraycopy(vBlur, y * rw, pixels, (rt + y) * w + rl, rw)
        }
    }

    // ── 随机噪声叠加 ──────────────────────────────────

    /**
     * 对区域内每个像素叠加随机色值偏移。
     *
     * 用于破坏像素化/模糊后的色值一致性，
     * 使 Depix 等反马赛克工具的颜色匹配攻击失效。
     *
     * @param intensity 噪声强度（0~255），每个通道的最大偏移量
     */
    private fun applyNoise(
        pixels: IntArray, w: Int,
        rl: Int, rt: Int, rr: Int, rb: Int,
        intensity: Int
    ) {
        val half = intensity / 2
        for (y in rt until rb) {
            val rowOff = y * w
            for (x in rl until rr) {
                val idx = rowOff + x
                val p = pixels[idx]
                val a = (p shr 24) and 0xFF
                val r = ((p shr 16) and 0xFF) + Random.nextInt(-half, half + 1)
                val g = ((p shr 8) and 0xFF) + Random.nextInt(-half, half + 1)
                val b = (p and 0xFF) + Random.nextInt(-half, half + 1)
                pixels[idx] = Color.argb(
                    a,
                    r.coerceIn(0, 255),
                    g.coerceIn(0, 255),
                    b.coerceIn(0, 255)
                )
            }
        }
    }
}
