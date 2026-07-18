package com.yyt.dama.ocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import com.yyt.dama.engine.expandRegion
import com.yyt.dama.engine.groupBoxesByRows
import com.yyt.dama.feature.idcard.CardOrientation
import com.yyt.dama.feature.idcard.CardSide
import com.yyt.dama.feature.idcard.templateFor
import com.yyt.dama.feature.idcard.toRect

/**
 * OCR 文本识别探针 — 测试/调试专用。
 *
 * 复用与 [OcrFacadeImpl.detect] 完全相同的搜索区计算逻辑
 * （模板字段 → labelWidthPct 跳过标签 → expandRegion 扩展 0.2），
 * 对每个搜索区做 det 检测后，再按行做 rec 识别，
 * 返回并打印识别到的文本/数字。
 *
 * 识别按"行"而非按"det 框"进行：
 * - det 框紧贴字形、甚至漏掉首尾字符（如身份号码两端数字），
 *   按框裁剪会让 rec 缺字；
 * - 整行裁剪（X = 搜索区全宽，Y = 行框并集 ± 1 倍行高）
 *   保证行内字符完整，也更符合 rec 模型的训练输入形态。
 *
 * 与生产打码流程的差异：打码只需要"框在哪里"，不需要"框里是什么"；
 * 本探针额外加载 rec 模型做识别，仅由主页 OCR 测试（双击）触发。
 */
object OcrTextProbe {

    /** 单行文本的识别结果（lineRect = 实际裁剪区域，boxCount = 该行 det 框数） */
    data class LineText(
        val lineRect: Rect,
        val boxCount: Int,
        val text: String,
        val score: Float
    )

    /** 单个模板字段的探测结果（搜索区 + 区内全部文本行） */
    data class FieldResult(
        val label: String,
        val searchZone: Rect,
        val lines: List<LineText>
    )

    /**
     * 执行文本识别探测。
     *
     * 参数与 OCR 测试入口一致（LANDSCAPE / FRONT / searchPadding 0.2），
     * 保证搜索区与生产检测结果可对照。
     *
     * @param context Android Context（加载 det/rec 模型）
     * @param bitmap  待探测图片（调用方负责回收）
     * @return 每个模板字段的识别结果
     */
    fun probe(context: Context, bitmap: Bitmap): List<FieldResult> {
        val imgW = bitmap.width
        val imgH = bitmap.height

        // 与 OcrFacadeImpl 默认值保持一致（OCR 测试入口使用全默认参数）
        val textFields = templateFor(CardOrientation.LANDSCAPE, CardSide.FRONT)
            .filter { !it.isDashed }
        val searchPadding = 0.2f

        val results = mutableListOf<FieldResult>()
        val strategy = OcrStrategyFactory.create(context)
        val recognizer = TextRecognizer(context)
        try {
            for (field in textFields) {
                val region = field.toRect(imgW, imgH)

                // 跳过固定标签（与 OcrFacadeImpl 横向分支一致：标签在左，值在右）
                val valueRegion = if (field.labelWidthPct > 0f) {
                    val labelPx = (field.labelWidthPct * imgW).toInt()
                    Rect(region.left + labelPx, region.top, region.right, region.bottom)
                } else region

                val searchZone = expandRegion(valueRegion, imgW, imgH, searchPadding)

                // det 检测 → 按行分组（与 OcrFacadeImpl 打码区域同一套行划分）
                val boxes = strategy.detectInRegion(bitmap, searchZone)
                val rows = groupBoxesByRows(boxes)

                // 整行识别：X 取搜索区全宽（防止 det 漏首尾字符），
                // Y 取行框并集上下各扩 1 倍行高（恢复被 det 裁掉的笔画），夹紧到搜索区
                val lineTexts = if (rows.isEmpty()) {
                    // det 无结果兜底：直接识别整个搜索区
                    // （单字 + 大留白的小区域 det 可能失效，如"民族"的值"汉"，
                    // 与 OcrFacadeImpl 的兜底策略一致）
                    val crop = Bitmap.createBitmap(
                        bitmap, searchZone.left, searchZone.top,
                        searchZone.right - searchZone.left, searchZone.bottom - searchZone.top
                    )
                    val rec = recognizer.recognize(crop)
                    crop.recycle()
                    Log.d(TAG, "  det 无结果, 兜底整区识别")
                    listOf(LineText(Rect(searchZone), 0, rec.text, rec.score))
                } else rows.map { row ->
                    val rowTop = row.minOf { it.top }
                    val rowBottom = row.maxOf { it.bottom }
                    val padY = rowBottom - rowTop
                    val t = (rowTop - padY).coerceAtLeast(searchZone.top)
                    val b = (rowBottom + padY).coerceAtMost(searchZone.bottom)
                    val crop = Bitmap.createBitmap(
                        bitmap, searchZone.left, t,
                        searchZone.right - searchZone.left, b - t
                    )
                    val rec = recognizer.recognize(crop)
                    crop.recycle()
                    LineText(Rect(searchZone.left, t, searchZone.right, b), row.size, rec.text, rec.score)
                }

                Log.d(TAG, "字段[${field.label}] 搜索区=$searchZone → ${boxes.size} 框/${lineTexts.size} 行")
                lineTexts.forEach {
                    Log.d(TAG, "  ${it.lineRect} → \"${it.text}\" (score=${"%.2f".format(it.score)})")
                }
                results.add(FieldResult(field.label, searchZone, lineTexts))
            }
        } finally {
            strategy.close()
            recognizer.close()
        }

        Log.d(TAG, "探测完成: ${results.size} 字段, 共 ${results.sumOf { it.lines.size }} 行")
        return results
    }

    private const val TAG = "OCR-Probe"
}
