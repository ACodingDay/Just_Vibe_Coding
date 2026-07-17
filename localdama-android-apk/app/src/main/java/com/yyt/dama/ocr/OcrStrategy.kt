package com.yyt.dama.ocr

import android.graphics.Bitmap
import android.graphics.Rect

/**
 * OCR 检测策略 — 每个模型实现一套完整流程。
 *
 * 一个策略封装了该模型的：
 * - 模型加载与 ONNX session 管理
 * - 预处理（resize、归一化、通道顺序）
 * - 推理
 * - 后处理（二值化、连通域、框合并）
 *
 * 策略实现应管理自身资源，通过 [close] 释放 ONNX session；
 * 支持在单次 [OcrFacadeImpl.detect] 调用内创建并关闭，
 * 也支持未来由 Facade 持有做 session 复用。
 */
interface OcrStrategy {

    /**
     * 对完整图片做检测，返回文本框列表。
     *
     * @param bitmap 原始图片
     * @return 文本框列表（原图坐标）
     */
    fun detect(bitmap: Bitmap): List<Rect>

    /**
     * 对图片的指定区域做检测，返回文本框列表（原图坐标）。
     *
     * @param bitmap 完整原图
     * @param region 需要检测的区域（原图坐标）
     * @return 区域内的文本框列表（原图坐标）
     */
    fun detectInRegion(bitmap: Bitmap, region: Rect): List<Rect>

    /** 释放资源（ONNX session 等） */
    fun close()
}
