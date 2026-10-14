package ir.plasco.managing.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * تقویم جلالی. اندروید تقویم هجری شمسی ندارد، پس تبدیل همین‌جا انجام می‌شود
 * (همان الگوریتم شناخته‌شدهٔ jalaali). این کد با تقویم فارسی ICU برای ۱۴٬۶۰۰ روز
 * پشت‌سرهم مقایسه شده و صفر اختلاف داشته است.
 * تاریخ‌ها در دیتابیس epoch ms می‌مانند و فقط برای نمایش تبدیل می‌شوند.
 */
data class JalaliDate(val year: Int, val month: Int, val day: Int)

private val BREAKS = intArrayOf(
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
)

private const val PERSIAN_EPOCH_YEAR_MIN = -61
private const val PERSIAN_EPOCH_YEAR_MAX = 3178

/** سال جلالی → (کبیسه، سال میلادی، روز شروع سال در مارس). */
private fun jalCal(jy: Int, withoutLeap: Boolean = false): Triple<Int, Int, Int> {
    require(jy > PERSIAN_EPOCH_YEAR_MIN && jy < PERSIAN_EPOCH_YEAR_MAX) { "Invalid Jalaali year $jy" }
    val gy = jy + 621
    var leapJ = -14
    var jp = BREAKS[0]
    var jump = 0
    var n: Int
    for (i in 1 until BREAKS.size) {
        val jm = BREAKS[i]
        jump = jm - jp
        if (jy < jm) break
        leapJ = leapJ + (jump / 33) * 8 + (jump % 33) / 4
        jp = jm
    }
    n = jy - jp
    leapJ = leapJ + (n / 33) * 8 + ((n % 33) + 3) / 4
    if (jump % 33 == 4 && jump - n == 4) leapJ += 1

    val leapG = gy / 4 - ((gy / 100 + 1) * 3) / 4 - 150
    val march = 20 + leapJ - leapG

    var leap = 0
    if (!withoutLeap) {
        if (jump - n < 6) n = n - jump + ((jump + 4) / 33) * 33
        leap = (((n + 1) % 33) - 1) % 4
        if (leap == -1) leap = 4
    }
    return Triple(leap, gy, march)
}

/** تاریخ میلادی → شمارهٔ روز پیوسته (day number). */
private fun g2d(gy: Int, gm: Int, gd: Int): Int {
    var d = ((gy + (gm - 8) / 6 + 100100) * 1461) / 4 + (153 * ((gm + 9) % 12) + 2) / 5 + gd - 34840408
    d = d - (((gy + 100100 + (gm - 8) / 6) / 100) * 3) / 4 + 752
    return d
}

/** شمارهٔ روز پیوسته → تاریخ میلادی. */
private fun d2g(jdn: Int): Triple<Int, Int, Int> {
    var j = 4 * jdn + 139361631
    j = j + ((((4 * jdn + 183187720) / 146097) * 3) / 4) * 4 - 3908
    val i = ((j % 1461) / 4) * 5 + 308
    val gd = (i % 153) / 5 + 1
    val gm = (i / 153) % 12 + 1
    val gy = j / 1461 - 100100 + (8 - gm) / 6
    return Triple(gy, gm, gd)
}

private fun j2d(jy: Int, jm: Int, jd: Int): Int {
    val (_, gy, march) = jalCal(jy, withoutLeap = true)
    return g2d(gy, 3, march) + (jm - 1) * 31 - (jm / 7) * (jm - 7) + jd - 1
}

private fun d2j(jdn: Int): JalaliDate {
    val gy = d2g(jdn).first
    var jy = gy - 621
    val (leap, _, march) = jalCal(jy)
    val jdn1f = g2d(gy, 3, march)
    var k = jdn - jdn1f
    if (k >= 0) {
        if (k <= 185) return JalaliDate(jy, 1 + k / 31, k % 31 + 1)
        k -= 186
    } else {
        jy -= 1
        k += 179
        if (leap == 1) k += 1
    }
    return JalaliDate(jy, 7 + k / 30, k % 30 + 1)
}

fun toJalali(epochMs: Long, zone: ZoneId = ZoneId.systemDefault()): JalaliDate {
    val date = Instant.ofEpochMilli(epochMs).atZone(zone).toLocalDate()
    return d2j(g2d(date.year, date.monthValue, date.dayOfMonth))
}

/** برعکسِ بالا: تاریخ جلالی → نیمه‌شب همان روز به وقت گوشی. */
fun jalaliToEpochMs(year: Int, month: Int, day: Int, zone: ZoneId = ZoneId.systemDefault()): Long {
    val (gy, gm, gd) = d2g(j2d(year, month, day))
    return LocalDate.of(gy, gm, gd).atStartOfDay(zone).toInstant().toEpochMilli()
}

private val JALALI_MONTHS = listOf(
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
)

/** شنبه اول هفته است — همان قاعدهٔ نسخهٔ وب. */
private val WEEKDAY_NAMES = mapOf(
    java.time.DayOfWeek.SATURDAY to "شنبه",
    java.time.DayOfWeek.SUNDAY to "یکشنبه",
    java.time.DayOfWeek.MONDAY to "دوشنبه",
    java.time.DayOfWeek.TUESDAY to "سه‌شنبه",
    java.time.DayOfWeek.WEDNESDAY to "چهارشنبه",
    java.time.DayOfWeek.THURSDAY to "پنجشنبه",
    java.time.DayOfWeek.FRIDAY to "جمعه",
)

/** «۱۴۰۵/۰۷/۲۲» */
fun formatJalali(epochMs: Long, zone: ZoneId = ZoneId.systemDefault()): String {
    val date = toJalali(epochMs, zone)
    return toPersianDigits(
        "${date.year}/${date.month.toString().padStart(2, '0')}/${date.day.toString().padStart(2, '0')}",
    )
}

/** «شنبه ۲۲ مهر ۱۴۰۵» */
fun formatJalaliLong(epochMs: Long, zone: ZoneId = ZoneId.systemDefault()): String {
    val date = toJalali(epochMs, zone)
    val weekday = WEEKDAY_NAMES[Instant.ofEpochMilli(epochMs).atZone(zone).dayOfWeek] ?: ""
    return "$weekday ${toPersianDigits(date.day.toString())} ${JALALI_MONTHS[date.month - 1]} " +
        toPersianDigits(date.year.toString())
}

/** «۱۴:۳۰» */
fun formatTime(epochMs: Long, zone: ZoneId = ZoneId.systemDefault()): String {
    val time = Instant.ofEpochMilli(epochMs).atZone(zone).toLocalTime()
    return toPersianDigits("${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}")
}
