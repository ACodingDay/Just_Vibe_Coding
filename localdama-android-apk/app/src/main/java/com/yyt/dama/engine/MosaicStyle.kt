package com.yyt.dama.engine

/**
 * 马赛克打码风格。
 *
 * 每种风格定义了不同的隐私遮挡方式，
 * 通过 [MosaicEngine.applyMosaic] 的 `style` 参数传入。
 */
sealed class MosaicStyle {

    /**
     * 像素化马赛克（传统方块打码）。
     * @param blockSize 块大小（像素），越大越粗糙，默认 24
     * @param noise 噪声强度（0~255），叠加随机色值干扰反马赛克攻击，默认 20
     */
    data class Pixelate(val blockSize: Int = 24, val noise: Int = 20) : MosaicStyle()

    /**
     * 纯白色填充，彻底遮挡内容。
     */
    data object FillWhite : MosaicStyle()

    /**
     * 高斯模糊（近似盒式模糊），保留区域轮廓但模糊细节。
     * @param radius 模糊半径（像素），越大越模糊，默认 20
     * @param noise 噪声强度（0~255），叠加随机色值干扰反模糊攻击，默认 20
     */
    data class Blur(val radius: Int = 20, val noise: Int = 20) : MosaicStyle()
}
