package com.yyt.dama.feature.idcard

/**
 * 身份证相机取景框配置。
 *
 * 参考百度 OCR SDK MaskView 取景框设计：
 *   取景框比例 620:400≈1.55
 *   引导 png 定位坐标基于取景框基准尺寸 1006×632
 *
 * 修改取景框参数只需改这里，无需触碰 UI 或裁剪逻辑。
 */
object IdCardCameraConfig {

    // ═══════════════════════════════════════════════════════
    // 取景框尺寸
    // ═══════════════════════════════════════════════════════

    /** 取景框宽度占屏幕宽度的比例（0~1） */
    const val FRAME_WIDTH_RATIO = 0.88f

    /** 取景框宽高比（宽/高），参考百度 OCR SDK 620:400≈1.55 */
    const val FRAME_ASPECT_RATIO = 1.55f

    // ═══════════════════════════════════════════════════════
    // 正面（人像面）引导 png 定位坐标（取景框内百分比）
    // 来源：百度 OCR SDK MaskView locator
    //   left=601/1006  top=110/632  right=963/1006  bottom=476/632
    // ═══════════════════════════════════════════════════════

    const val FRONT_LOCATOR_LEFT   = 0.597f
    const val FRONT_LOCATOR_TOP    = 0.174f
    const val FRONT_LOCATOR_WIDTH  = 0.360f   // 963/1006 - 601/1006
    const val FRONT_LOCATOR_HEIGHT = 0.579f   // 476/632 - 110/632

    // ═══════════════════════════════════════════════════════
    // 反面（国徽面）引导 png 定位坐标（取景框内百分比）
    // 来源：百度 OCR SDK MaskView locator
    //   left=51/1006  top=48/632  right=250/1006  bottom=262/632
    // ═══════════════════════════════════════════════════════

    const val BACK_LOCATOR_LEFT   = 0.051f
    const val BACK_LOCATOR_TOP    = 0.076f
    const val BACK_LOCATOR_WIDTH  = 0.198f   // 250/1006 - 51/1006
    const val BACK_LOCATOR_HEIGHT = 0.339f   // 262/632 - 48/632

}
