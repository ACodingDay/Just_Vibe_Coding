package com.yyt.dama.feature.idcard

import android.graphics.Rect
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** 证件显示方向 */
enum class CardOrientation { LANDSCAPE, PORTRAIT }

/** 证件正反面 */
enum class CardSide { FRONT, BACK }

/** 身份证模板字段定义（百分比坐标） */
data class IdCardField(
    val label: String,
    val xPct: Float, val yPct: Float, val wPct: Float, val hPct: Float,
    val isDashed: Boolean = false,
    /**
     * 标签宽度占比（字段主方向）。
     *
     * > 0 时，搜索区跳过标签部分，只覆盖值区域，避免标签文字被打码。
     * - 横向模板：标签在左侧，labelWidthPct 表示 x 方向占比
     * - 竖向模板：标签在上方，labelWidthPct 表示 y 方向占比
     *
     * 初始值为估算，需通过 OcrFacadeImpl 的调试日志校准。
     */
    val labelWidthPct: Float = 0f
)

/**
 * 定位锚点定义。
 * 用户将身份证上的特征区域（头像 / 国徽）对齐到锚点位置，
 * 即可确保整张卡片落在取景框内。
 *
 * @param anchorX   锚点中心 X（百分比，相对于取景框宽度）
 * @param anchorY   锚点中心 Y（百分比，相对于取景框高度）
 * @param iconLabel 用于 UI 显示的描述
 */
data class CardAnchor(
    val anchorX: Float,
    val anchorY: Float,
    val iconLabel: String
)

/** 横向宽高比（宽 > 高） */
const val CARD_ASPECT_LANDSCAPE = 441f / 358f

/** 竖向宽高比（宽 < 高），= 1 / LANDSCAPE */
const val CARD_ASPECT_PORTRAIT = 358f / 441f

// ─────────────────────────────────────────────────────
// 正面（人像面）
// ─────────────────────────────────────────────────────

/**
 * 横向（默认）：标准身份证方向。
 *
 * 模板坐标根据 OCR 实际检测框的 y 范围反推：
 *   姓名 89~118, 性别 173~194, 出生 250~270,
 *   住址 L1 258~271+L2 333~353+L3 384~405（三行连续合并）, 号码 536~555
 */
val landscapeTemplate = listOf(
    // labelWidthPct: 跳过左侧固定标签（"姓  名"等带空格），只搜索值区域。初始值为估算，需用日志校准
    IdCardField("姓名",         0.05f, 0.13f, 0.40f, 0.06f, labelWidthPct = 0.12f),
    IdCardField("性别",         0.05f, 0.26f, 0.18f, 0.05f, labelWidthPct = 0.12f),
    IdCardField("民族",         0.23f, 0.26f, 0.20f, 0.05f, labelWidthPct = 0.08f),
    // 出生: OCR 框 y=250~270
    IdCardField("出生日期",     0.05f, 0.38f, 0.48f, 0.05f, labelWidthPct = 0.12f),
    // 住址: OCR 框 y=333~404(此轮), 上下各冗余一行 → y 覆盖 259~434
    IdCardField("住址",         0.05f, 0.51f, 0.50f, 0.22f, labelWidthPct = 0.12f),
    IdCardField("照片",         0.58f, 0.07f, 0.38f, 0.50f, isDashed = true),
    IdCardField("身份号码",     0.05f, 0.83f, 0.88f, 0.05f, labelWidthPct = 0.25f),
)

/**
 * 竖向：横向旋转 90° CCW。
 *
 * 旋转公式 (百分比坐标):
 *   x' = y,  y' = 1 - x - w,  w' = h,  h' = w
 *
 * 视觉：照片在上，文字区在下，身份号码在底部。
 */
val portraitTemplate = listOf(
    IdCardField("姓名",         0.13f, 0.55f, 0.06f, 0.40f),
    IdCardField("性别",         0.26f, 0.62f, 0.05f, 0.18f, labelWidthPct = 0.12f),
    IdCardField("民族",         0.26f, 0.80f, 0.05f, 0.20f, labelWidthPct = 0.08f),
    IdCardField("出生日期",     0.38f, 0.52f, 0.05f, 0.48f),
    IdCardField("住址",         0.51f, 0.50f, 0.22f, 0.50f),
    IdCardField("照片",         0.07f, 0.04f, 0.50f, 0.38f, isDashed = true),
    IdCardField("身份号码",     0.83f, 0.05f, 0.05f, 0.88f),
)

// ─────────────────────────────────────────────────────
// 反面（国徽面）
// ─────────────────────────────────────────────────────

/**
 * 反面横向：
 *   左上 = 国徽
 *   右上 = 签发机关
 *   底部 = 有效期限
 */
val landscapeBackTemplate = listOf(
    IdCardField("国徽",     0.04f, 0.04f, 0.36f, 0.46f, isDashed = true),
    IdCardField("签发机关", 0.48f, 0.12f, 0.48f, 0.12f, labelWidthPct = 0.15f),
    IdCardField("有效期限", 0.04f, 0.72f, 0.88f, 0.14f, labelWidthPct = 0.15f),
)

/**
 * 反面竖向（旋转 90° CCW）。
 */
val portraitBackTemplate = listOf(
    IdCardField("国徽",     0.06f, 0.04f, 0.50f, 0.36f, isDashed = true),
    IdCardField("签发机关", 0.54f, 0.04f, 0.12f, 0.48f),
    IdCardField("有效期限", 0.80f, 0.04f, 0.14f, 0.88f),
)

// ─────────────────────────────────────────────────────
// 辅助：从模板字段自动计算锚点
// ─────────────────────────────────────────────────────

/**
 * 取模板中虚线字段（照片 / 国徽）的中心坐标。
 * 锚点位置直接由模板数据派生，保证与取景框 / 编辑页区域一致。
 */
private fun dashedFieldCenter(fields: List<IdCardField>): Pair<Float, Float> {
    val f = fields.first { it.isDashed }
    return f.xPct + f.wPct / 2f to f.yPct + f.hPct / 2f
}

// ─────────────────────────────────────────────────────
// 定位锚点
// ─────────────────────────────────────────────────────

/** 正面（人像面）锚点：头像中心，取自 landscapeTemplate 照片字段中心 */
val frontAnchor = CardAnchor(
    anchorX = dashedFieldCenter(landscapeTemplate).first,   // 0.78
    anchorY = dashedFieldCenter(landscapeTemplate).second,  // 0.31
    iconLabel = "头像"
)

/** 反面（国徽面）锚点：国徽中心，取自 landscapeBackTemplate 国徽字段中心 */
val backAnchor = CardAnchor(
    anchorX = dashedFieldCenter(landscapeBackTemplate).first,   // 0.22
    anchorY = dashedFieldCenter(landscapeBackTemplate).second,  // 0.27
    iconLabel = "国徽"
)

// ─────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────

/** 根据方向和正反面获取模板 */
fun templateFor(
    orientation: CardOrientation,
    side: CardSide = CardSide.FRONT
): List<IdCardField> = when {
    side == CardSide.FRONT && orientation == CardOrientation.LANDSCAPE -> landscapeTemplate
    side == CardSide.FRONT && orientation == CardOrientation.PORTRAIT  -> portraitTemplate
    side == CardSide.BACK  && orientation == CardOrientation.LANDSCAPE -> landscapeBackTemplate
    side == CardSide.BACK  && orientation == CardOrientation.PORTRAIT  -> portraitBackTemplate
    else -> landscapeTemplate
}

/** 根据方向获取宽高比 */
fun aspectFor(orientation: CardOrientation): Float =
    if (orientation == CardOrientation.LANDSCAPE) CARD_ASPECT_LANDSCAPE else CARD_ASPECT_PORTRAIT

/** 根据正反面获取定位锚点 */
fun anchorFor(side: CardSide): CardAnchor =
    if (side == CardSide.FRONT) frontAnchor else backAnchor

/** 百分比 → 像素 Rect */
fun IdCardField.toRect(w: Int, h: Int) = Rect(
    (xPct * w).roundToInt(), (yPct * h).roundToInt(),
    ((xPct + wPct) * w).roundToInt(), ((yPct + hPct) * h).roundToInt()
)

/** 两矩形重叠面积占比 */
fun overlapRatio(box: Rect, region: Rect): Float {
    val l = max(box.left, region.left); val t = max(box.top, region.top)
    val r = min(box.right, region.right); val b = min(box.bottom, region.bottom)
    if (l >= r || t >= b) return 0f
    val inter = (r - l).toFloat() * (b - t).toFloat()
    val area = box.width().toFloat() * box.height().toFloat()
    return inter / area
}
