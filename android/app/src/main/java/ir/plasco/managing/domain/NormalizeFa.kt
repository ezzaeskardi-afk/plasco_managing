package ir.plasco.managing.domain

import java.text.Normalizer
import java.util.Locale

/**
 * یکسان‌سازی متن فارسی — همان قواعد نسخهٔ وب (AGENTS.md بخش ۷):
 * ي→ی، ك→ک، حذف اعراب و کشیده، نیم‌فاصله→فاصله، رقم‌های فارسی/عربی→لاتین،
 * حروف لاتین کوچک، فاصله‌های تکراری یکی، ابتدا و انتها trim.
 * فقط برای جست‌وجو، مقایسه و یکسان‌سازی؛ هرگز برای نمایش.
 */
private val ARABIC_TO_PERSIAN: List<Pair<Char, Char>> = listOf(
    '\u064A' to '\u06CC', // ي -> ی
    '\u0649' to '\u06CC', // ى -> ی
    '\u0643' to '\u06A9', // ك -> ک
    '\u06AA' to '\u06A9', // ڪ -> ک
)

// اعراب عربی، کشیده و نویسه‌های نامرئی جهت‌دهی.
private val DIACRITICS = Regex("""[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]""")
private val INVISIBLE = Regex("""[\u200B-\u200F\u202A-\u202E\uFEFF]""")
// `\s` کاتلین فقط ASCII است ولی `\s` جاوااسکریپت (نسخهٔ وب) یونیکد؛ این مجموعه
// باید مو‌به‌مو همان باشد وگرنه فاصلهٔ باریک/تمام‌عرض متن را جدا نمی‌کند.
private val WHITESPACE = Regex("""[\t\n\u000B\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+""")

private const val PERSIAN_DIGITS = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9"
private const val ARABIC_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669"

/** رقم‌های فارسی (۰-۹) و عربی (٠-٩) را به رقم لاتین تبدیل می‌کند. */
fun toLatinDigits(input: String): String {
    val out = StringBuilder(input.length)
    for (ch in input) {
        val persian = PERSIAN_DIGITS.indexOf(ch)
        if (persian >= 0) {
            out.append(persian)
            continue
        }
        val arabic = ARABIC_DIGITS.indexOf(ch)
        if (arabic >= 0) {
            out.append(arabic)
            continue
        }
        out.append(ch)
    }
    return out.toString()
}

/** رقم‌های لاتین را برای نمایش به رقم فارسی تبدیل می‌کند. */
fun toPersianDigits(input: String): String {
    val out = StringBuilder(input.length)
    for (ch in input) {
        if (ch in '0'..'9') out.append(PERSIAN_DIGITS[ch - '0']) else out.append(ch)
    }
    return out.toString()
}

fun normalizeFa(input: String): String {
    if (input.isEmpty()) return ""
    var out = Normalizer.normalize(input, Normalizer.Form.NFC)
    for ((from, to) in ARABIC_TO_PERSIAN) out = out.replace(from, to)
    out = DIACRITICS.replace(out, "")
    out = INVISIBLE.replace(out, " ")
    out = toLatinDigits(out).lowercase(Locale.ROOT)
    return WHITESPACE.replace(out, " ").trim()
}

/** متن یکسان‌شده را به توکن‌های یکتا می‌شکند (برای جست‌وجوی AND). */
fun normalizeTokens(input: String): List<String> {
    val normalized = normalizeFa(input)
    if (normalized.isEmpty()) return emptyList()
    return normalized.split(' ').filter { it.isNotEmpty() }.distinct()
}
