package ir.plasco.managing.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import ir.plasco.managing.domain.jpegOrientation
import java.io.ByteArrayOutputStream

/** عکس کالا نبود یا خوانده نشد. */
class PhotoDecodeException : Exception("PhotoDecodeFailed")

/**
 * کوچک‌کردن و رمزگذاری عکس، با همان اندازه‌های نسخهٔ وب (AGENTS.md بخش ۹):
 * بلندترین ضلع ۸۰۰ پیکسل برای عکس کامل و ۱۶۰ پیکسل برای بندانگشتی، هر دو JPEG با
 * کیفیت ۷۵. جهت عکس از EXIF خوانده می‌شود، وگرنه عکس قفسه‌ها کج ذخیره می‌شد.
 */
object PhotoCodec {

    const val FULL_MAX = 800
    const val THUMB_MAX = 160
    const val QUALITY = 75

    /** برای پیش‌نمایش داخل فرم؛ بزرگ‌تر از بندانگشتی و کوچک‌تر از عکس کامل. */
    const val PREVIEW_MAX = 480

    fun preview(bytes: ByteArray): Bitmap? = decode(bytes, PREVIEW_MAX)

    fun encode(bitmap: Bitmap): ByteArray {
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, QUALITY, out)
        bitmap.recycle()
        return out.toByteArray()
    }

    /** رمزگشایی با نمونه‌برداری، چرخش بر پایهٔ EXIF و کوچک‌کردن تا اندازهٔ هدف. */
    fun decode(source: ByteArray, maxSize: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(source, 0, source.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, maxSize)
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = BitmapFactory.decodeByteArray(source, 0, source.size, options) ?: return null
        val oriented = applyOrientation(decoded, jpegOrientation(source))
        if (oriented !== decoded) decoded.recycle()
        val scaled = scaleToFit(oriented, maxSize)
        if (scaled !== oriented) oriented.recycle()
        return scaled
    }

    private fun sampleSize(width: Int, height: Int, maxSize: Int): Int {
        var sample = 1
        while (maxOf(width, height) / (sample * 2) >= maxSize) sample *= 2
        return sample
    }

    private fun scaleToFit(bitmap: Bitmap, maxSize: Int): Bitmap {
        val longest = maxOf(bitmap.width, bitmap.height)
        if (longest <= maxSize) return bitmap
        val ratio = maxSize.toFloat() / longest
        return Bitmap.createScaledBitmap(
            bitmap,
            maxOf(1, (bitmap.width * ratio).toInt()),
            maxOf(1, (bitmap.height * ratio).toInt()),
            true,
        )
    }

    /** نگاشت استاندارد مقادیر EXIF به ماتریس. */
    private fun applyOrientation(bitmap: Bitmap, orientation: Int): Bitmap {
        if (orientation <= 1) return bitmap
        val matrix = Matrix()
        when (orientation) {
            2 -> matrix.setScale(-1f, 1f)
            3 -> matrix.setRotate(180f)
            4 -> matrix.setScale(1f, -1f)
            5 -> {
                matrix.setRotate(90f)
                matrix.postScale(-1f, 1f)
            }
            6 -> matrix.setRotate(90f)
            7 -> {
                matrix.setRotate(-90f)
                matrix.postScale(-1f, 1f)
            }
            8 -> matrix.setRotate(-90f)
            else -> return bitmap
        }
        return try {
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        } catch (error: Throwable) {
            bitmap
        }
    }
}
