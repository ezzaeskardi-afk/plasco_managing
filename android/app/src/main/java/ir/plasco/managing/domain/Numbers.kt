package ir.plasco.managing.domain

import kotlin.math.roundToInt

// جداکننده‌های هزارگان که از کیبورد و فایل اکسل می‌آید. `\s` کاتلین ASCII است
// ولی `\s` وب یونیکد؛ فاصله‌های یونیکد صریح آمده‌اند تا هر دو یکی رفتار کنند.
private val GROUP_SEPARATORS =
    Regex("""[\t\n\u000B\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF\u200C,،\u066C\u060C']""")
// جداکنندهٔ اعشار: ٫ فارسی و نقطهٔ معمول.
private val DECIMAL_SEPARATORS = Regex("""[\u066B.]""")
private val NUMBER_SHAPE = Regex("""^-?\d+(\.\d+)?$""")

/**
 * parseNumberInput: رقم فارسی/عربی/لاتین و جداکننده‌های `,` `٬` `٫` را می‌پذیرد
 * و عدد برمی‌گرداند، یا null اگر متن عدد نباشد.
 */
fun parseNumberInput(raw: String?): Double? {
    if (raw == null) return null
    var text = toLatinDigits(raw).trim()
    if (text.isEmpty()) return null

    // علامت منفی‌های مختلف را یکی می‌کند.
    text = text.replace('\u2212', '-').replace('\u2013', '-').replace('\u2014', '-')

    val decimalIndex = text.indexOfFirst { it == '\u066B' || it == '.' }
    var integerPart = text
    var fractionPart = ""
    if (decimalIndex >= 0) {
        integerPart = text.substring(0, decimalIndex)
        fractionPart = text.substring(decimalIndex + 1)
    }

    integerPart = GROUP_SEPARATORS.replace(integerPart, "")
    fractionPart = GROUP_SEPARATORS.replace(fractionPart, "")
    fractionPart = DECIMAL_SEPARATORS.replace(fractionPart, "")

    // "۱۲٫" یا "." بدون رقم اعشار عدد نیست (مثل وب).
    if (decimalIndex >= 0 && fractionPart.isEmpty()) return null

    val normalized = if (decimalIndex >= 0) "$integerPart.$fractionPart" else integerPart
    if (!NUMBER_SHAPE.matches(normalized)) return null

    return normalized.toDoubleOrNull()
}

/**
 * پول و تعداد همیشه عدد صحیح‌اند؛ این تابع گرد می‌کند. عددی که در Int جا نمی‌شود
 * null می‌دهد (مدل عددی اندروید Int است؛ انحراف آگاهانه از وب که number دارد).
 */
fun parseIntegerInput(raw: String?): Int? {
    val value = parseNumberInput(raw) ?: return null
    if (value.isNaN() || value.isInfinite()) return null
    if (value < Int.MIN_VALUE || value > Int.MAX_VALUE) return null
    return value.roundToInt()
}

fun clampInt(value: Int, min: Int, max: Int): Int = value.coerceIn(min, max)

/** چند رقم در سمت راست مکان‌نما هست (جداکننده‌ها شمرده نمی‌شوند). */
fun digitsRightOf(text: String, caret: Int): Int {
    var count = 0
    var index = caret.coerceIn(0, text.length)
    while (index < text.length) {
        if (text[index].isDigit()) count++
        index++
    }
    return count
}

/**
 * جای مکان‌نما به‌طوری که دقیقاً `digitsRight` رقم سمت راستش بماند؛
 * برای اینکه گروه‌بندی زندهٔ سهرقمی مکان‌نما را وسط عدد جابه‌جا نکند.
 */
fun caretFromRight(text: String, digitsRight: Int): Int {
    var seen = 0
    for (index in text.indices.reversed()) {
        if (!text[index].isDigit()) continue
        if (seen == digitsRight) return index + 1
        seen++
    }
    return 0
}
