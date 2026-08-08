package com.yyt.dama

import com.yyt.dama.feature.sensitive.SensitivePattern
import com.yyt.dama.feature.sensitive.defaultSensitivePatterns
import com.yyt.dama.feature.sensitive.normalizeOcrText
import com.yyt.dama.feature.sensitive.normalizeOcrTextStrict
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 敏感信息正则规则回归测试 — 覆盖带分隔符数字串（去空格归一化）的命中场景。
 * 与 SensitiveDetector.matchesAny 同一套匹配逻辑（两阶段归一化 + Regex.find）。
 */
class SensitivePatternTest {

    private val patterns: List<SensitivePattern> =
        defaultSensitivePatterns().filter { it.enabled }

    /** 与 SensitiveDetector.matchesAny 一致的匹配入口（两阶段归一化） */
    private fun matches(text: String): Boolean {
        val wsStripped = normalizeOcrText(text)
        if (patterns.any { it.regex.find(wsStripped) != null }) return true
        return patterns.any { it.regex.find(normalizeOcrTextStrict(text)) != null }
    }

    @Test
    fun phone_with_spaces() {
        assertTrue(matches("联系电话 138 1234 5678"))
    }

    @Test
    fun phone_with_hyphens() {
        assertTrue(matches("138-1234-5678"))
    }

    @Test
    fun phone_with_86_prefix() {
        assertTrue(matches("+86 138 1234 5678"))
    }

    @Test
    fun bank_card_continuous_16() {
        assertTrue(matches("6222020212345678"))
    }

    @Test
    fun bank_card_with_spaces() {
        assertTrue(matches("卡号 6222 0202 1234 5678"))
    }

    @Test
    fun bank_card_19_with_spaces() {
        assertTrue(matches("6222 0202 1234 5678 901"))
    }

    @Test
    fun id_card_with_spaces() {
        assertTrue(matches("身份证号 110101 1990 0101 1234"))
    }

    @Test
    fun email_keeps_hyphen() {
        assertTrue(matches("联系邮箱 a.b-c@example.com"))
    }

    @Test
    fun short_number_not_phone() {
        assertFalse(matches("编号 123456"))
    }

    @Test
    fun normalize_removes_separators() {
        assertEquals("13812345678", normalizeOcrText("138 1234 5678"))
        assertEquals("6222020212345678", normalizeOcrText("6222 0202 1234 5678"))
        assertEquals("a.b-c@example.com", normalizeOcrText("a.b-c@example.com"))
    }

    @Test
    fun normalize_strict_removes_hyphens() {
        assertEquals("13812345678", normalizeOcrTextStrict("138-1234-5678"))
        assertEquals("6222020212345678", normalizeOcrTextStrict("6222-0202-1234-5678"))
    }

    private fun assertEquals(expected: String, actual: String) {
        org.junit.Assert.assertEquals(expected, actual)
    }
}
