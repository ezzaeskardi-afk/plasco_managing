package ir.plasco.managing.domain

/**
 * نمایش اعداد — ذخیره‌سازی همیشه عدد صحیح خام است (AGENTS.md بخش ۶).
 * جداکنندهٔ هزارگان فارسی «٬» و رقم‌ها فارسی‌اند.
 */
private const val THOUSANDS_SEPARATOR = '\u066C' // ٬
private const val DECIMAL_SEPARATOR = '\u066B' // ٫

fun formatNumber(value: Long): String {
    val negative = value < 0
    val digits = if (negative) (-value).toString() else value.toString()
    val out = StringBuilder(digits.length + digits.length / 3 + 1)
    if (negative) out.append('-')
    digits.forEachIndexed { index, ch ->
        if (index > 0 && (digits.length - index) % 3 == 0) out.append(THOUSANDS_SEPARATOR)
        out.append(ch)
    }
    return toPersianDigits(out.toString())
}

fun formatNumber(value: Int): String = formatNumber(value.toLong())

fun formatQty(value: Int): String = formatNumber(value)

/** پول در واحد دلخواه کاربر (پیش‌فرض تومان). */
fun formatMoney(value: Int, currencyLabel: String = "تومان"): String {
    val text = formatNumber(value)
    return if (currencyLabel.isBlank()) text else "$text $currencyLabel"
}

private val COMPACT_UNITS: List<Pair<Long, String>> = listOf(
    1_000_000_000L to "میلیارد",
    1_000_000L to "میلیون",
    1_000L to "هزار",
)

/**
 * عدد جمع‌وجور فارسی: ۱۲٫۴ هزار / ۳ میلیون / ۱٫۱ میلیارد.
 * یک رقم اعشار، صفر انتهایی حذف می‌شود. زیر هزار عدد ساده برمی‌گردد.
 */
fun compactParts(value: Long): Pair<String, String> {
    val sign = if (value < 0) "-" else ""
    val abs = if (value < 0) -value else value
    for ((scale, label) in COMPACT_UNITS) {
        if (abs >= scale) {
            val rounded = Math.round(abs.toDouble() / scale * 10) / 10.0
            return sign + decimalText(rounded) to label
        }
    }
    return sign + toPersianDigits(abs.toString()) to ""
}

fun formatCompact(value: Long, withSuffix: Boolean = true): String {
    val (text, suffix) = compactParts(value)
    return if (!withSuffix || suffix.isEmpty()) text else "$text $suffix"
}

fun formatCompact(value: Int): String = formatCompact(value.toLong())

/** ۱۲٫۵ → «۱۲٫۵» و ۱۲٫۰ → «۱۲» */
private fun decimalText(value: Double): String {
    val rounded = Math.round(value * 10) / 10.0
    val text = if (rounded % 1.0 == 0.0) rounded.toLong().toString()
    else rounded.toString().replace('.', DECIMAL_SEPARATOR)
    return toPersianDigits(text)
}

/** مقدار کامل با جداکننده — برای جزئیات و راهنمای لمس. */
fun formatFull(value: Int): String = formatNumber(value)

/** کد کالا: شمارهٔ صفر-پرشده با رقم لاتین (P-00001). */
fun padStartOrPlain(value: Int, width: Int): String = value.toString().padStart(width, '0')
