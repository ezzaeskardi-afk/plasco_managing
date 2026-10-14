package ir.plasco.managing.domain

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * تقویم جلالی: تاریخ‌های شناخته‌شده + رفت‌وبرگشت روز‌به‌روز.
 * مقایسهٔ کامل با تقویم فارسی ICU بیرون از این تست انجام شده است (۱۴٬۶۰۰ روز).
 */
class JalaliTest {

    private val utc: ZoneId = ZoneOffset.UTC

    private fun epoch(year: Int, month: Int, day: Int): Long =
        LocalDate.of(year, month, day).atStartOfDay(utc).toInstant().toEpochMilli()

    @Test
    fun `known dates match the official calendar`() {
        assertEquals(JalaliDate(1405, 1, 1), toJalali(epoch(2026, 3, 21), utc))
        assertEquals(JalaliDate(1405, 7, 22), toJalali(epoch(2026, 10, 14), utc))
        assertEquals(JalaliDate(1403, 1, 1), toJalali(epoch(2024, 3, 20), utc))
        assertEquals(JalaliDate(1357, 11, 22), toJalali(epoch(1979, 2, 11), utc))
        assertEquals(JalaliDate(1399, 12, 30), toJalali(epoch(2021, 3, 20), utc))
    }

    @Test
    fun `every day round trips for ten years`() {
        var date = LocalDate.of(2000, 1, 1)
        val end = LocalDate.of(2010, 1, 1)
        var checked = 0
        while (date.isBefore(end)) {
            val ms = date.atStartOfDay(utc).toInstant().toEpochMilli()
            val jalali = toJalali(ms, utc)
            val back = jalaliToEpochMs(jalali.year, jalali.month, jalali.day, utc)
            assertEquals(date.toString(), ms, back)
            checked += 1
            date = date.plusDays(1)
        }
        assertEquals(3653, checked)
    }

    @Test
    fun `formatting uses persian digits and the month name`() {
        val ms = epoch(2026, 10, 14)
        assertEquals("۱۴۰۵/۰۷/۲۲", formatJalali(ms, utc))
        assertEquals("چهارشنبه ۲۲ مهر ۱۴۰۵", formatJalaliLong(ms, utc))
    }

    @Test
    fun `leap day of a leap year exists`() {
        // ۱۳۹۹ کبیسه بود: اسفند ۳۰ روز داشت.
        val lastDay = jalaliToEpochMs(1399, 12, 30, utc)
        assertEquals(JalaliDate(1399, 12, 30), toJalali(lastDay, utc))
        assertEquals(epoch(2021, 3, 20), lastDay)
    }
}
