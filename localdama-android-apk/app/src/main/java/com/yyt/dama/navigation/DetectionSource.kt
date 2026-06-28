package com.yyt.dama.navigation

import androidx.annotation.StringRes
import com.yyt.dama.R

/**
 * 检测结果的业务来源。
 *
 * 不同来源在 ResultScreen 中显示不同的提示文案，
 * 所有文案通过 string resource 管理，不硬编码。
 */
enum class DetectionSource(
    @StringRes val noRegionsTextRes: Int,
    @StringRes val dialogHintRes: Int
) {
    ID_CARD(
        noRegionsTextRes = R.string.result_no_regions_id_card,
        dialogHintRes = R.string.result_dialog_hint_id_card
    ),
    SENSITIVE(
        noRegionsTextRes = R.string.result_no_regions_sensitive,
        dialogHintRes = R.string.result_dialog_hint_sensitive
    ),
    OCR_TEST(
        noRegionsTextRes = R.string.result_no_regions_ocr_test,
        dialogHintRes = R.string.result_dialog_hint_ocr_test
    ),
    DEFAULT(
        noRegionsTextRes = R.string.result_no_regions_default,
        dialogHintRes = R.string.result_dialog_hint_default
    )
}
