package ir.plasco.managing.domain

import kotlin.math.roundToInt

// جداکننده‌های هزارگان که از کیبورد و فایل اکسل می‌آید.
private val GROUP_SEPARATORS = Regex("""[\s\u00A0\u200C,،\u066C\u060C']""")
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

    // "۱۲٫" یا "." بدون رقم اعشار عدد نیست.
    if (decimalIndex >= 0 && fractionPart.isEmpty()) return null
    if (decimalIndex >= 0 && integerPart.isEmpty()) integerPart = "0"

    val normalized = if (decimalIndex >= 0) "$integerPart.$fractionPart" else integerPart
    if (!NUMBER_SHAPE.matches(normalized)) return null

    return normalized.toDoubleOrNull()
}

/** پول و تعداد همیشه عدد صحیح‌اند؛ این تابع گردش می‌کند. */
fun parseIntegerInput(raw: String?): Int? {
    val value = parseNumberInput(raw) ?: return null
    if (value.isNaN() || value.isInfinite()) return null
    return value.roundToInt()
}

fun clampInt(value: Int, min: Int, max: Int): Int = value.coerceIn(min, max)
