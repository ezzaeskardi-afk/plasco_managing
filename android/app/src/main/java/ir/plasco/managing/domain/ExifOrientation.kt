package ir.plasco.managing.domain

/**
 * شمارهٔ جهت عکس از تگ EXIF (`0x0112`) داخل فایل JPEG.
 *
 * گوشی معمولاً عکس را به‌صورت خام ذخیره می‌کند و جهت درست را در EXIF می‌نویسد؛ اگر
 * آن را نخوانیم، عکسِ قفسه‌ها کج نشان داده می‌شود. این تابع عمداً بدون هیچ کتابخانهٔ
 * اضافه‌ای نوشته شده: فقط چند بایت از همان فایل خوانده می‌شود.
 *
 * خروجی بین ۱ تا ۸ است و اگر فایل EXIF نداشت یا ناقص بود، **۱** (بدون چرخش)
 * برمی‌گردد — چرخاندن اشتباهی بدتر از نچرخاندن است.
 */
fun jpegOrientation(bytes: ByteArray): Int {
    if (bytes.size < 4) return NORMAL
    if (u8(bytes, 0) != 0xFF || u8(bytes, 1) != 0xD8) return NORMAL // نه JPEG
    var index = 2
    while (index + 4 <= bytes.size) {
        if (u8(bytes, index) != 0xFF) return NORMAL
        val marker = u8(bytes, index + 1)
        // نشانه‌های بی‌طول (RSTn) و SOI داخل جریان داده ندارند.
        if (marker == 0xD8 || marker == 0x01 || marker in 0xD0..0xD7) {
            index += 2
            continue
        }
        // SOS یعنی بخش‌های سرصفحه تمام شد؛ بعد از این هم APP1 وجود ندارد.
        if (marker == 0xDA || marker == 0xD9) return NORMAL
        val length = (u8(bytes, index + 2) shl 8) or u8(bytes, index + 3)
        if (length < 2) return NORMAL
        val payload = index + 4
        val end = index + 2 + length
        if (end > bytes.size) return NORMAL
        if (marker == 0xE1 && end - payload >= 6 && hasExifHeader(bytes, payload)) {
            return readIfd0(bytes, payload + 6, end)
        }
        index = end
    }
    return NORMAL
}

private const val NORMAL = 1
private const val ORIENTATION_TAG = 0x0112

/** `"Exif\0\0"` ابتدای APP1. */
private fun hasExifHeader(bytes: ByteArray, at: Int): Boolean =
    u8(bytes, at) == 'E'.code &&
        u8(bytes, at + 1) == 'x'.code &&
        u8(bytes, at + 2) == 'i'.code &&
        u8(bytes, at + 3) == 'f'.code &&
        u8(bytes, at + 4) == 0 &&
        u8(bytes, at + 5) == 0

/** سرصفحهٔ TIFF و اولین IFD؛ فقط تگ جهت خوانده می‌شود. */
private fun readIfd0(bytes: ByteArray, start: Int, end: Int): Int {
    if (start + 8 > end) return NORMAL
    val little = when {
        u8(bytes, start) == 'I'.code && u8(bytes, start + 1) == 'I'.code -> true
        u8(bytes, start) == 'M'.code && u8(bytes, start + 1) == 'M'.code -> false
        else -> return NORMAL
    }
    if (u16(bytes, start + 2, little) != 42) return NORMAL
    val ifd = start + u32(bytes, start + 4, little)
    if (ifd + 2 > end) return NORMAL
    val count = u16(bytes, ifd, little)
    var entry = ifd + 2
    var remaining = count
    while (remaining > 0 && entry + 12 <= end) {
        val tag = u16(bytes, entry, little)
        if (tag == ORIENTATION_TAG) {
            // نوع ۳ یعنی SHORT و مقدارش داخل همان چهار بایت جا می‌شود.
            val type = u16(bytes, entry + 2, little)
            val items = u32(bytes, entry + 4, little)
            if (type != 3 || items < 1) return NORMAL
            val value = u16(bytes, entry + 8, little)
            return if (value in 1..8) value else NORMAL
        }
        entry += 12
        remaining -= 1
    }
    return NORMAL
}

private fun u8(bytes: ByteArray, index: Int): Int = bytes[index].toInt() and 0xFF

private fun u16(bytes: ByteArray, index: Int, little: Boolean): Int =
    if (little) u8(bytes, index) or (u8(bytes, index + 1) shl 8)
    else (u8(bytes, index) shl 8) or u8(bytes, index + 1)

private fun u32(bytes: ByteArray, index: Int, little: Boolean): Int =
    if (little) {
        u8(bytes, index) or (u8(bytes, index + 1) shl 8) or
            (u8(bytes, index + 2) shl 16) or (u8(bytes, index + 3) shl 24)
    } else {
        (u8(bytes, index) shl 24) or (u8(bytes, index + 1) shl 16) or
            (u8(bytes, index + 2) shl 8) or u8(bytes, index + 3)
    }
