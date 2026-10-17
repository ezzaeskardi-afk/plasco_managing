package ir.plasco.managing.data

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import ir.plasco.managing.model.ID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * عکس کالا: بایت‌های کوچک‌شده در جدول `photos` می‌مانند و فقط به‌اندازهٔ لازم خوانده
 * می‌شوند؛ عکس‌ها مثل بقیهٔ داده‌ها در حافظه نگه داشته نمی‌شوند (چند هزار عکس یعنی
 * چند صد مگابایت). فهرست عکس‌های موجود، `DataHub.photoStamps` است: نگاشتی کوچک از
 * شناسهٔ کالا به زمان آخرین تغییرش — با عوض شدنش بندانگشتی از نو خوانده می‌شود.
 */
class PhotoStore(private val helper: PlascoDb, private val hub: DataHub) {

    /** عکس را کوچک و ذخیره می‌کند؛ عکس قبلی همان کالا جایگزین می‌شود. */
    suspend fun setPhoto(productId: ID, source: ByteArray): Int = withContext(Dispatchers.IO) {
        val full = PhotoCodec.decode(source, PhotoCodec.FULL_MAX) ?: throw PhotoDecodeException()
        val thumb = PhotoCodec.decode(source, PhotoCodec.THUMB_MAX) ?: throw PhotoDecodeException()
        val values = ContentValues().apply {
            put("productId", productId)
            put("thumb", PhotoCodec.encode(thumb))
            put("full", PhotoCodec.encode(full))
            put("updatedAt", System.currentTimeMillis())
        }
        helper.writableDatabase.insertWithOnConflict("photos", null, values, SQLiteDatabase.CONFLICT_REPLACE)
        hub.reloadPhotoStamps()
        (values.getAsByteArray("full")?.size ?: 0) + (values.getAsByteArray("thumb")?.size ?: 0)
    }

    suspend fun deletePhoto(productId: ID) = withContext(Dispatchers.IO) {
        helper.writableDatabase.delete("photos", "productId = ?", arrayOf(productId))
        hub.reloadPhotoStamps()
    }

    /**
     * بندانگشتی/عکس کامل کالا. `stamp` همان مقدار `DataHub.photoStamps` است؛ خالی
     * بودنش یعنی این کالا عکس ندارد و هیچ کوئری‌ای زده نمی‌شود.
     */
    suspend fun bitmap(productId: ID, stamp: Long?, full: Boolean = false): Bitmap? {
        if (stamp == null) return null
        val key = cacheKey(productId, stamp, full)
        cache.get(key)?.let { return it }
        val bitmap = withContext(Dispatchers.IO) { readBitmap(productId, full) }
        // فقط بندانگشتی‌ها در حافظه می‌مانند؛ عکس کامل هر بار از دیتابیس خوانده
        // می‌شود تا چند عکس ۸۰۰ پیکسلی چند صد مگابایت رم نگیرد.
        if (bitmap != null && !full) cache.put(key, bitmap)
        return bitmap
    }

    /** همان `bitmap` ولی بدون انتظار؛ برای پر کردن فوری جای عکس در فهرست‌های بلند. */
    fun cached(productId: ID?, stamp: Long?, full: Boolean = false): Bitmap? {
        if (productId == null || stamp == null) return null
        return cache.get(cacheKey(productId, stamp, full))
    }

    private fun cacheKey(productId: ID, stamp: Long, full: Boolean): String =
        "$productId:$stamp:${if (full) "full" else "thumb"}"

    private fun readBitmap(productId: ID, full: Boolean): Bitmap? {
        val column = if (full) "full" else "thumb"
        val bytes = helper.readableDatabase
            .rawQuery("SELECT $column FROM photos WHERE productId = ?", arrayOf(productId))
            .use { cursor -> if (cursor.moveToFirst()) cursor.getBlob(0) else null }
            ?: return null
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    companion object {
        /** چند بندانگشتی رمزگشایی‌شده در حافظه می‌ماند (هر کدام ~۱۰۰ کیلوبایت). */
        private const val MAX_CACHED = 96
    }

    private val cache = object : LruCache<String, Bitmap>(MAX_CACHED) {}
}
