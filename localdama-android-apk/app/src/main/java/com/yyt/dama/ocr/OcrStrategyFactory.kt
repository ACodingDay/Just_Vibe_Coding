package com.yyt.dama.ocr

import android.content.Context
import com.yyt.dama.data.SettingsRepository

/**
 * OCR 策略工厂 — 根据用户设置的模型选项创建对应策略实例。
 *
 * 读取 [SettingsRepository.loadOcrModelOption] 获取用户选择，
 * 分发到具体的 [OcrStrategy] 实现。
 *
 * 当前仅支持 PP-OCRv5；未来新增模型只需：
 * 1. 在 [OcrModelOption] 追加枚举项
 * 2. 新建对应 `XxxStrategy` 实现 [OcrStrategy]
 * 3. 在下方 `when` 分支追加映射
 *
 * [OcrModelOption] 与本工厂同在 `com.yyt.dama.ocr` 包（阶段五-15 已移入）。
 */
object OcrStrategyFactory {

    /**
     * 创建策略实例。
     *
     * 调用方负责在合适时机调用 [OcrStrategy.close] 释放资源。
     * 当前由 [OcrFacadeImpl] 在单次 detect 内 try/finally 管理；
     * 未来若改为 Facade 持有策略做 session 复用，需在模型切换时 close 旧策略。
     *
     * @param context Android Context（用于加载 assets 模型文件）
     * @return 对应用户所选模型的策略实例
     */
    fun create(context: Context): OcrStrategy {
        val modelOption = SettingsRepository(context).loadOcrModelOption()
        return when (modelOption) {
            OcrModelOption.PP_OCR_V5 -> PpOcrV5Strategy(context)
            // 未来新增：
            // OcrModelOption.PP_OCR_V3 -> PpOcrV3Strategy(context)
        }
    }
}
