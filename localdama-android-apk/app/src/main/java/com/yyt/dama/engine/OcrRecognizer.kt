package com.yyt.dama.engine

import android.content.Context
import android.graphics.Bitmap
import com.yyt.dama.ocr.TextRecognizer

/**
 * 通用文本识别引擎 — 基于 PP-OCRv5 `rec_v5.onnx`。
 *
 * 对 `ocr.TextRecognizer` 的薄封装，提供函数式调用入口，
 * 供身份证模板识别（OcrTextProbe）与敏感信息识别（SensitiveDetector）共用。
 *
 * 模型规格（与 [TextRecognizer] 一致）：
 * - 输入: `[1, 3, 32, W]`，高度固定 32，宽度动态
 * - 归一化: `(v/255 - 0.5) / 0.5`，BGR 通道顺序
 * - 输出: `[1, T, C]`，CTC greedy decoding（blank=0，跳过连续重复）
 * - 字典: `assets/models/Paddle/ppocrv5_dict.txt`
 *
 * 资源管理：调用方负责 [close] 释放 ONNX session。
 */
class OcrRecognizer(context: Context) : AutoCloseable {

    private val delegate = TextRecognizer(context)

    /**
     * 识别单行文本图片。
     *
     * @param cropBitmap 文本行裁剪图（调用方负责回收，本方法内部仅回收中间缩放图）
     * @return 识别到的文本（空串表示识别失败或图片过小）
     */
    fun recognize(cropBitmap: Bitmap): String = delegate.recognize(cropBitmap).text

    /** 识别并返回文本与置信度（敏感信息匹配场景下可用置信度做过滤） */
    fun recognizeWithScore(cropBitmap: Bitmap): TextRecognizer.RecResult =
        delegate.recognize(cropBitmap)

    override fun close() = delegate.close()
}
