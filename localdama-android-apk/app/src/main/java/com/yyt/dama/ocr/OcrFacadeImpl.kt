package com.yyt.dama.ocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import com.yyt.dama.engine.TemplateDebugVisualizer
import com.yyt.dama.engine.expandOcrBoxes
import com.yyt.dama.engine.expandRegion
import com.yyt.dama.feature.idcard.CardOrientation
import com.yyt.dama.feature.idcard.templateFor
import com.yyt.dama.feature.idcard.toRect
import kotlin.math.max
import kotlin.math.min

/**
 * [OcrFacade] 实现 — 编排完整检测流程。
 *
 * 流程（迁移自 `DetectionEngine.runTemplateDetection`）：
 *   1. 通过 [OcrStrategyFactory] 创建策略（根据用户选择的模型）
 *   2. 获取模板字段区域（排除照片/国徽等虚线字段）
 *   3. 对每个字段区域：扩展搜索区 → 策略检测 → 框扩展
 *   4. OCR 无结果时兜底：使用模板区域扩展 15%
 *   5. （可选）生成调试可视化图
 *   6. 返回标准 [DetectionResult]
 *
 * 策略生命周期：内部 try/finally 管理，单次 detect 内创建并 close。
 * 未来如需 session 复用，可改为 Facade 持有策略实例。
 *
 * @param context Android Context（用于策略工厂加载模型）
 */
class OcrFacadeImpl(
    private val context: Context
) : OcrFacade {

    /**
     * 执行 OCR 检测 — 界面层的唯一调用入口。
     *
     * @param request 标准输入（图片 + 正反面 + 方向 + 可选参数）
     * @return 标准输出（原图 + 打码区域 + 可选调试图）
     */
    override fun detect(request: DetectionRequest): DetectionResult {
        val bitmap = request.bitmap
        val imgW = bitmap.width
        val imgH = bitmap.height

        // 模板字段（排除照片/国徽等虚线区域，这些不需要 OCR 文本匹配）
        val textFields = templateFor(request.orientation, request.side)
            .filter { !it.isDashed }

        // 默认扩展比例（null 时使用 0.2，与原 runTemplateDetection 默认值一致）
        val searchPadding = request.searchPadding ?: DEFAULT_SEARCH_PADDING
        val finalExpand = request.finalExpand ?: DEFAULT_FINAL_EXPAND

        val allRegions = mutableListOf<Rect>()
        val allRawBoxes = mutableListOf<Rect>()  // 收集 OCR 原始框，供 debug 可视化

        val strategy = OcrStrategyFactory.create(context)
        try {
            for (field in textFields) {
                val region = field.toRect(imgW, imgH)

                // 搜索区跳过固定标签：labelWidthPct > 0 时，搜索区从标签结束后开始
                val valueRegion = if (field.labelWidthPct > 0f) {
                    if (request.orientation == CardOrientation.PORTRAIT) {
                        // 竖向：标签在 y 方向上方，值在下方
                        val labelPx = (field.labelWidthPct * imgH).toInt()
                        Rect(region.left, region.top + labelPx, region.right, region.bottom)
                    } else {
                        // 横向：标签在 x 方向左侧，值在右侧
                        val labelPx = (field.labelWidthPct * imgW).toInt()
                        Rect(region.left + labelPx, region.top, region.right, region.bottom)
                    }
                } else region

                // 搜索区：值区域 + 较小比例扩展（左边界不扩展，避免超出身份证边缘）
                val searchZone = expandRegion(valueRegion, imgW, imgH, searchPadding)

                Log.d(TAG, "字段[${field.label}] region=$region labelW=${field.labelWidthPct} valueRegion=$valueRegion searchZone=$searchZone")

                // 在搜索区内做 OCR 检测
                val boxes = strategy.detectInRegion(bitmap, searchZone)
                allRawBoxes.addAll(boxes)

                Log.d(TAG, "  OCR ${boxes.size} 框: ${boxes.map { "$it(${it.width()}x${it.height()})" }}")

                // OCR 原始框按行分组后统一扩展高度，作为最终打码区域
                val expanded = expandOcrBoxes(boxes, bitmap, finalExpand)

                if (expanded.isEmpty()) {
                    // 兜底：OCR 无结果时使用值区域扩展 15%（最少 4px）
                    val padX = (valueRegion.width() * FALLBACK_PAD_RATIO).toInt().coerceAtLeast(4)
                    val padY = (valueRegion.height() * FALLBACK_PAD_RATIO).toInt().coerceAtLeast(4)
                    val fallback = Rect(
                        max(0, valueRegion.left - padX),
                        max(0, valueRegion.top - padY),
                        min(imgW, valueRegion.right + padX),
                        min(imgH, valueRegion.bottom + padY)
                    )
                    allRegions.add(fallback)
                    Log.d(TAG, "  → 兜底 $fallback")
                } else {
                    allRegions.addAll(expanded)
                    Log.d(TAG, "  → ${expanded.size} 区域: $expanded")
                }
            }
        } finally {
            strategy.close()
        }

        // 调试模式：生成可视化图（模板区/搜索区/OCR 原始框/最终打码区）
        val debugBitmap = if (request.debug) {
            TemplateDebugVisualizer.visualize(
                bitmap, request.orientation, request.side,
                searchPadding, allRawBoxes, allRegions
            )
        } else null

        return DetectionResult(
            bitmap = bitmap,
            regions = allRegions,
            debugBitmap = debugBitmap
        )
    }

    private companion object {
        private const val TAG = "OcrFacade"

        /** 默认搜索区扩展比例（模板区域四周各扩展 20%） */
        private const val DEFAULT_SEARCH_PADDING = 0.2f

        /** 默认最终打码区扩展比例（OCR 框上下各扩展行高度的 20%） */
        private const val DEFAULT_FINAL_EXPAND = 0.2f

        /** OCR 无结果时兜底区域的扩展比例（模板区域扩展 15%） */
        private const val FALLBACK_PAD_RATIO = 0.15f
    }
}
