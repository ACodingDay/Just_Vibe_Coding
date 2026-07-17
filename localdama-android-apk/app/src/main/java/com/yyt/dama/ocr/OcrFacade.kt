package com.yyt.dama.ocr

/**
 * OCR 检测门面 — 界面层的唯一入口。
 *
 * 调用方不关心：
 * - 用了哪个模型
 * - 预处理 / 后处理怎么做的
 * - 中间有几层
 *
 * 只需：传入 [DetectionRequest] → 拿回 [DetectionResult]。
 *
 * 实现类 [OcrFacadeImpl] 负责读取用户选择的模型、
 * 选取对应策略、编排完整流程。
 */
interface OcrFacade {

    /**
     * 执行 OCR 检测。
     *
     * @param request 标准输入（图片 + 参数）
     * @return 标准输出（原图 + 打码区域 + 可选调试图）
     */
    fun detect(request: DetectionRequest): DetectionResult
}
