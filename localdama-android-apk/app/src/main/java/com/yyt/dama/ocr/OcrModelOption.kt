package com.yyt.dama.ocr

/**
 * 可选 OCR 检测模型。
 *
 * 每个模型封装了文件路径、预处理参数、后处理阈值，
 * 切换模型时自动应用对应参数。
 *
 * 注意：不同 PP-OCR 版本的通道顺序和归一化参数不同：
 * - PP-OCRv5: BGR 顺序, mean=[0.406, 0.456, 0.485], std=[0.225, 0.224, 0.229]
 * - PP-OCRv3: RGB 顺序, mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
 *
 * [mean] 和 [std] 的顺序与预处理通道写入顺序一致，
 * 策略实现（如 [PpOcrV5Strategy]）按 mean[0]/std[0] → mean[1]/std[1] → mean[2]/std[2] 顺序写入。
 *
 * ## 模型路径
 * 所有模型文件统一放在 `assets/models/` 下（[MODELS_BASE_PATH]），
 * [modelPath] 是相对于该基路径的子路径，格式为「目录/文件名」，
 * 例如 `"Paddle/det_v5.onnx"` 对应磁盘文件 `assets/models/Paddle/det_v5.onnx`。
 *
 * 设置页对话框直接显示 [modelPath]（相对路径）；
 * 策略类实际加载时使用完整路径 `"$MODELS_BASE_PATH/$modelPath"`（见 [PpOcrV5Strategy]）。
 *
 * 阶段五-15：从 `com.yyt.dama.engine` 移入 `com.yyt.dama.ocr` 包（解耦要彻底，包自包含）。
 * 被 [OcrStrategyFactory] 用于分发策略，被 `SettingsRepository` 用于持久化用户选择。
 */
enum class OcrModelOption(
    val displayName: String,
    /** 模型文件相对路径（相对于 [MODELS_BASE_PATH]），格式为「目录/文件名」 */
    val modelPath: String,
    val maxSide: Int,
    val alignMultiple: Int,
    val mean: FloatArray,
    val std: FloatArray,
    val binThresh: Float,
    val scoreThresh: Float,
    val minBoxWidth: Int = 10,
    val minBoxHeight: Int = 10,
) {
    PP_OCR_V5(
        displayName = "PP-OCRv5",
        modelPath = "Paddle/det_v5.onnx",
        maxSide = 960,
        alignMultiple = 32,
        mean = floatArrayOf(0.406f, 0.456f, 0.485f),
        std = floatArrayOf(0.225f, 0.224f, 0.229f),
        binThresh = 0.3f,
        scoreThresh = 0.3f,
    );
    // 未来新增模型只需在此追加枚举项

    companion object {
        /** 所有 OCR 模型文件的 assets 基路径（对应 `assets/models/`） */
        const val MODELS_BASE_PATH = "models"
    }
}
