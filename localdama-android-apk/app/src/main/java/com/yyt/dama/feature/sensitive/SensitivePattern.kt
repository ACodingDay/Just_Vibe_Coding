package com.yyt.dama.feature.sensitive

/**
 * 敏感信息正则规则定义 — 与业务逻辑隔离的纯数据层。
 *
 * 每条规则包含名称、正则、是否启用三项。正则使用 Java/Regex 语法，
 * 不加锚点（匹配子串），由 [SensitiveDetector] 调用 [Regex.find] 判定。
 * 银行卡规则用前后断言保证两侧非数字，与手机号/身份证号天然不重叠。
 */

/** OCR 文本中的空白分隔符：普通/全角/不换行空格、制表符、换行 */
private val OCR_WHITESPACE_REGEX = Regex("[\\s\u3000\u00A0]+")

/** 空白之外的连字符（仅第二阶段匹配使用，避免拆散邮箱地址中的连字符） */
private val OCR_HYPHEN_REGEX = Regex("-+")

/**
 * OCR 文本归一化 — 去掉空白后返回。
 *
 * 真实图片上的数字串常带分隔符（"138 1234 5678"、"6222 0202 1234 5678"），
 * det 输出或 OCR 结果也会在数字间残留空格；若不归一化，正则只能匹配
 * 连续数字，带分隔符的卡号/手机号会整段漏检。归一化只在匹配前进行，
 * 打码区域仍按文本框整体覆盖，不影响输出。
 */
fun normalizeOcrText(text: String): String = text.replace(OCR_WHITESPACE_REGEX, "")

/**
 * 第二阶段归一化 — 在去空白基础上再去掉连字符。
 *
 * 邮箱地址允许连字符（如 a.b-c@example.com），不能无差别移除，
 * 因此连字符剥离只在第一阶段（去空白）未命中任何规则时执行，
 * 用于 "138-1234-5678" 这类带连字符的数字串。
 */
internal fun normalizeOcrTextStrict(text: String): String =
    text.replace(OCR_WHITESPACE_REGEX, "").replace(OCR_HYPHEN_REGEX, "")
data class SensitivePattern(
    val name: String,
    val regex: Regex,
    val enabled: Boolean = true
) {
    constructor(name: String, pattern: String, enabled: Boolean = true) :
            this(name, Regex(pattern), enabled)
}

/**
 * 默认敏感信息规则列表。
 *
 * 覆盖中国常见敏感信息类型：手机号、身份证号、邮箱、车牌、银行卡、日期。
 * 调用方可通过 [enabled] 字段按需开关单条规则。
 */
fun defaultSensitivePatterns(): List<SensitivePattern> = listOf(
    SensitivePattern(
        name = "手机号",
        // 中国大陆手机号（可选 +86/0086 前缀），细分号段：
        // 13x / 14[5679] / 15[0-35-9] / 16[5-7] / 17[0-8] / 18x / 19[189]
        // 注意：OCR 文本行常含前后缀文字，不做 ^$ 锚定，仅子串匹配
        pattern = "((\\+|00)86)?1(3\\d|4[5679]|5[0-35-9]|6[5-7]|7[0-8]|8\\d|9[189])\\d{8}"
    ),
    SensitivePattern(
        name = "身份证号",
        // 6 位地区码 + 4 位年份(19/20) + 2 位月份 + 2 位日期 + 3 位 + 1 位校验(数字或 X)
        pattern = "[1-9]\\d{5}(19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]"
    ),
    SensitivePattern(
        name = "电子邮箱",
        // 宽松子串版（RFC 严格版含 ^$ 锚点且字符类复杂，OCR 场景命中率低）
        pattern = "[\\w.-]+@[\\w.-]+\\.\\w+"
    ),
    SensitivePattern(
        name = "车牌号",
        // 省份简称 + 字母 + 4-5 位字母数字 + 港澳学警挂等尾字
        pattern = "[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁]" +
                "[A-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]"
    ),
    SensitivePattern(
        name = "银行卡号",
        // 16 或 19 位、首位 1-9。前后断言要求两侧非数字，
        // 排除 17/18 位数字及 18 位身份证号内的 16 位子串
        pattern = "(?<!\\d)[1-9]\\d{15}(?!\\d)|(?<!\\d)[1-9]\\d{18}(?!\\d)"
    ),
    SensitivePattern(
        name = "日期",
        // 默认关闭：合同/票据/证书中日期普遍存在，全图打码默认开启会过度打码
        pattern = "\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}",
        enabled = false
    )
)
