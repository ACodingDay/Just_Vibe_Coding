package com.yyt.dama.ocr

import android.graphics.Bitmap
import com.yyt.dama.feature.idcard.CardOrientation
import com.yyt.dama.feature.idcard.CardSide

/**
 * 检测请求 — 界面层构建此对象传入 [OcrFacade]。
 *
 * 所有字段都有默认值，调用方只需提供必要参数。
 *
 * @property bitmap 待检测的图片（调用方负责生命周期管理）
 * @property side 证件正反面，默认 [CardSide.FRONT]
 * @property orientation 证件显示方向，默认 [CardOrientation.LANDSCAPE]
 * @property searchPadding 搜索区扩展比例，`null` 表示使用策略默认值（通常 0.2）
 * @property finalExpand 打码区域行高扩展倍数（行框并集上下各扩多少倍行高），
 *   `null` 表示使用策略默认值（1.0）
 * @property debug 是否生成调试可视化图，`true` 时 [DetectionResult.debugBitmap] 非空
 */
data class DetectionRequest(
    val bitmap: Bitmap,
    val side: CardSide = CardSide.FRONT,
    val orientation: CardOrientation = CardOrientation.LANDSCAPE,
    val searchPadding: Float? = null,
    val finalExpand: Float? = null,
    val debug: Boolean = false,
)
