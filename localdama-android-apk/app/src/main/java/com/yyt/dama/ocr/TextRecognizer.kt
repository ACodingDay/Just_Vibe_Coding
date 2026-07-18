package com.yyt.dama.ocr

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import androidx.core.graphics.scale
import java.nio.FloatBuffer
import kotlin.math.ceil

/**
 * PP-OCRv5 文本识别器 — 封装 rec_v5 模型的单行文本识别。
 *
 * - 模型: `assets/models/Paddle/rec_v5.onnx`
 * - 字典: `assets/models/Paddle/ppocrv5_dict.txt`（UTF-8，每行一个字符）
 * - 预处理: 高度缩放到 32（模型导出时的固定高度），宽度按 `ceil(32 * w/h)` 等比缩放；
 *   BGR 通道（与 det 策略一致），归一化 `(v/255 - 0.5) / 0.5`
 * - 解码: CTC — 每个时间步 argmax，跳过空白符(索引 0)与连续重复，
 *   索引减 1 后查字典还原字符；置信度取各步最大概率的平均值
 *
 * 仅用于调试/测试（[OcrTextProbe]）；生产打码流程只需检测框，不加载本类。
 *
 * @param context Android Context（用于加载 assets 下的模型与字典）
 */
class TextRecognizer(context: Context) {

    /** 单行文本的识别结果 */
    data class RecResult(val text: String, val score: Float)

    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private val session: OrtSession
    private val dict: List<String>

    /** 输入图固定高度（本 rec_v5.onnx 导出为固定 32，非官方常用的 48） */
    private val inputHeight = 32

    init {
        val modelBytes = context.assets.open(MODEL_PATH).readBytes()
        OrtSession.SessionOptions().use { options ->
            options.setIntraOpNumThreads(4)
            options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            session = env.createSession(modelBytes, options)
        } // options 在此自动 close，释放原生句柄
        dict = context.assets.open(DICT_PATH).bufferedReader(Charsets.UTF_8).readLines()
        Log.d(TAG, "rec 模型加载完成, 字典 ${dict.size} 字")
    }

    /**
     * 识别单行文本图片。
     *
     * 内部回收缩放后的中间位图；调用方负责 [crop] 的回收。
     *
     * @param crop 文本行裁剪图
     * @return 识别文本与平均置信度；图片过小时返回空结果
     */
    fun recognize(crop: Bitmap): RecResult {
        if (crop.width < 4 || crop.height < 4) return RecResult("", 0f)

        // 预处理：高度对齐 32，宽度等比缩放（rec ONNX 宽度维度动态）
        val newW = maxOf(ceil(crop.width * (inputHeight.toFloat() / crop.height)).toInt(), 1)
        val resized = crop.scale(newW, inputHeight)

        val pixels = IntArray(newW * inputHeight)
        resized.getPixels(pixels, 0, newW, 0, 0, newW, inputHeight)

        // NCHW 平面格式，BGR 通道顺序，归一化 (v/255 - 0.5) / 0.5
        val floatBuffer = FloatBuffer.allocate(3 * inputHeight * newW)
        for (p in pixels) floatBuffer.put(((p and 0xFF) / 255.0f - 0.5f) / 0.5f)
        for (p in pixels) floatBuffer.put((((p shr 8) and 0xFF) / 255.0f - 0.5f) / 0.5f)
        for (p in pixels) floatBuffer.put((((p shr 16) and 0xFF) / 255.0f - 0.5f) / 0.5f)
        floatBuffer.rewind()

        val shape = longArrayOf(1, 3, inputHeight.toLong(), newW.toLong())
        val tensor = OnnxTensor.createTensor(env, floatBuffer, shape)

        val inputName = session.inputNames.iterator().next()
        val outName = session.outputNames.iterator().next()
        val result = session.run(mapOf(inputName to tensor))
        val output = result.get(outName).get() as OnnxTensor

        val probs = output.floatBuffer.array()
        val outShape = output.info.shape  // [1, T, C]
        val steps = outShape[1].toInt()
        val classes = outShape[2].toInt()

        val recResult = ctcDecode(probs, steps, classes)
        result.close()
        tensor.close()
        resized.recycle()
        return recResult
    }

    /**
     * CTC 解码：逐步 argmax → 去空白(0) → 去连续重复 → 查字典。
     *
     * @param probs   模型输出概率，形状 [1, T, C] 的一维展开
     * @param steps   时间步数 T
     * @param classes 类别数 C（= 字典大小 + 1 空白符）
     */
    private fun ctcDecode(probs: FloatArray, steps: Int, classes: Int): RecResult {
        val sb = StringBuilder()
        var prevIdx = -1
        var scoreSum = 0f
        var scoreCount = 0

        for (i in 0 until steps) {
            val base = i * classes
            var maxIdx = 0
            var maxVal = Float.NEGATIVE_INFINITY
            for (j in 0 until classes) {
                val v = probs[base + j]
                if (v > maxVal) {
                    maxVal = v
                    maxIdx = j
                }
            }
            // 索引 0 = CTC 空白符；连续重复只保留一次
            if (maxIdx > 0 && maxIdx != prevIdx) {
                if (maxIdx - 1 < dict.size) {
                    sb.append(dict[maxIdx - 1])
                    scoreSum += maxVal
                    scoreCount++
                }
            }
            prevIdx = maxIdx
        }

        val score = if (scoreCount > 0) scoreSum / scoreCount else 0f
        return RecResult(sb.toString(), score)
    }

    /** 释放 ONNX session 原生资源 */
    fun close() {
        session.close()
    }

    private companion object {
        private const val TAG = "OCR-Rec"
        private const val MODEL_PATH = "models/Paddle/rec_v5.onnx"
        private const val DICT_PATH = "models/Paddle/ppocrv5_dict.txt"
    }
}
