package ir.plasco.managing.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class ExifOrientationTest {

    @Test
    fun `reads orientation from a little endian APP1`() {
        assertEquals(6, jpegOrientation(jpeg(6, little = true)))
        assertEquals(8, jpegOrientation(jpeg(8, little = true)))
    }

    @Test
    fun `reads orientation from a big endian APP1`() {
        assertEquals(3, jpegOrientation(jpeg(3, little = false)))
    }

    @Test
    fun `finds APP1 after a JFIF APP0 marker`() {
        // دوربین‌ها اول APP0 را می‌نویسند؛ پرش از نشانه‌ها باید کار کند.
        val bytes = byteArrayOf(0xFF.toByte(), 0xD8.toByte()) + app0() + app1(7, little = true) +
            byteArrayOf(0xFF.toByte(), 0xD9.toByte())
        assertEquals(7, jpegOrientation(bytes))
    }

    @Test
    fun `orientation entry may follow another entry`() {
        assertEquals(5, jpegOrientation(jpeg(5, little = true, extraEntries = 2)))
    }

    @Test
    fun `falls back to no rotation`() {
        // بدون EXIF، عکس PNG، فایل ناقص، تگ خارج از محدوده و نوع نادرست.
        val jfifOnly = byteArrayOf(0xFF.toByte(), 0xD8.toByte()) + app0() +
            byteArrayOf(0xFF.toByte(), 0xD9.toByte())
        assertEquals(1, jpegOrientation(jfifOnly))
        assertEquals(1, jpegOrientation(byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte())))
        assertEquals(1, jpegOrientation(jpeg(6, little = true).copyOf(12)))
        assertEquals(1, jpegOrientation(jpeg(9, little = true)))
        assertEquals(1, jpegOrientation(jpeg(1, little = true, type = 4)))
        assertEquals(1, jpegOrientation(ByteArray(0)))
    }

    /** APP0 ساختگی با بدنهٔ JFIF. */
    private fun app0(): ByteArray =
        // درازا خودش (۲ بایت) را هم می‌شمارد: ۲ + ۴ بایت بدنهٔ JFIF.
        byteArrayOf(0xFF.toByte(), 0xE0.toByte(), 0, 6, 'J'.code.toByte(), 'F'.code.toByte(), 0, 0)

    private fun app1(orientation: Int, little: Boolean, extraEntries: Int = 0, type: Int = 3): ByteArray {
        val ifd = mutableListOf<Int>()
        val entries = extraEntries + 1
        if (little) {
            ifd += byteArrayOf(entries.toByte(), 0).map { it.toInt() }.toList()
        } else {
            ifd += listOf(0, entries)
        }
        repeat(extraEntries) { index ->
            // یک تگ بی‌ربط (0x0100 = عرض تصویر) پیش از تگ جهت.
            val tag = 0x0100 + index
            ifd += if (little) listOf(tag and 0xFF, tag shr 8) else listOf(tag shr 8, tag and 0xFF)
            ifd += if (little) listOf(3, 0) else listOf(0, 3)
            ifd += if (little) listOf(1, 0, 0, 0) else listOf(0, 0, 0, 1)
            ifd += if (little) listOf(40, 0, 0, 0) else listOf(0, 40, 0, 0)
        }
        ifd += if (little) listOf(0x12, 0x01) else listOf(0x01, 0x12)
        ifd += if (little) listOf(type, 0) else listOf(0, type)
        ifd += if (little) listOf(1, 0, 0, 0) else listOf(0, 0, 0, 1)
        ifd += if (little) listOf(orientation and 0xFF, orientation shr 8, 0, 0)
        else listOf(orientation shr 8, orientation and 0xFF, 0, 0)
        ifd += if (little) listOf(0, 0, 0, 0) else listOf(0, 0, 0, 0)

        val tiff = mutableListOf<Int>()
        if (little) tiff += listOf('I'.code, 'I'.code) else tiff += listOf('M'.code, 'M'.code)
        tiff += if (little) listOf(42, 0) else listOf(0, 42)
        tiff += if (little) listOf(8, 0, 0, 0) else listOf(0, 0, 0, 8)
        tiff += ifd

        val body = mutableListOf<Int>()
        body += listOf('E'.code, 'x'.code, 'i'.code, 'f'.code, 0, 0)
        body += tiff
        // درازای نشانه‌های JPEG همیشه big-endian است، برخلاف سرصفحهٔ TIFF داخلش.
        val length = body.size + 2
        val head = listOf(length shr 8, length and 0xFF)
        return (listOf(0xFF, 0xE1) + head + body).map { it.toByte() }.toByteArray()
    }

    private fun jpeg(orientation: Int, little: Boolean, extraEntries: Int = 0, type: Int = 3): ByteArray =
        byteArrayOf(0xFF.toByte(), 0xD8.toByte()) + app1(orientation, little, extraEntries, type) +
            byteArrayOf(0xFF.toByte(), 0xDA.toByte(), 0, 2)
}
