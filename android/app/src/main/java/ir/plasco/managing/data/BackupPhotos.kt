package ir.plasco.managing.data

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import ir.plasco.managing.model.ID
import java.io.ByteArrayInputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * عکس‌های بکاپ. قالب همان قالب نسخهٔ وب است: هر عکس دو عضو ZIP دارد،
 * `photos/<productId>-thumb.jpg` و `photos/<productId>-full.jpg` — نه در
 * `data.json` (آن‌جا فقط ردیف‌های متنی می‌نشینند).
 *
 * همه‌چیز ردیف‌به‌ردیف و بدون خواندن کل فایل به حافظه انجام می‌شود؛ با چند هزار
 * عکس، یک‌جا خواندن یعنی چند صد مگابایت حافظه.
 */
internal object BackupPhotos {

    private const val THUMB = "thumb"
    private const val FULL = "full"
    private const val PREFIX = "photos/"
    private const val SUFFIX = ".jpg"

    /** عکس‌ها را داخل ZIP می‌نویسد و تعداد عکس‌ها را برمی‌گرداند. */
    fun write(zip: ZipOutputStream, db: SQLiteDatabase): Int {
        var count = 0
        db.rawQuery("SELECT productId, thumb, full FROM photos", null).use { cursor ->
            while (cursor.moveToNext()) {
                val productId = cursor.getString(0)
                putEntry(zip, entryName(productId, THUMB), cursor.getBlob(1))
                putEntry(zip, entryName(productId, FULL), cursor.getBlob(2))
                count += 1
            }
        }
        return count
    }

    /**
     * چند عکس داخل فایل هست (برای پیش‌نمایش پیش از بازیابی). این یکی فقط تخمین است:
     * اگر فایل خوانده نشد صفر می‌گوید و اعتبارسنجی واقعی سر جایش می‌ماند.
     */
    fun count(bytes: ByteArray): Int = runCatching {
        val ids = HashSet<ID>()
        walk(bytes) { productId, kind, data -> if (kind == THUMB && data.isNotEmpty()) ids.add(productId) }
        ids.size
    }.getOrDefault(0)

    /**
     * عکس‌های فایل را در دیتابیس می‌نویسد.
     *
     * «جایگزینی» اول همهٔ عکس‌های این دستگاه را پاک می‌کند. در «ادغام» عکسی که روی
     * این دستگاه **تازه‌تر** از فایل است دست‌نخورده می‌ماند — همان قاعدهٔ نسخهٔ وب
     * (`existing.updatedAt > data.exportedAt`). زمانِ عکس‌های آمده از فایل، همان
     * `exportedAt` فایل است، چون فایل زمان دیگری برای عکس‌ها ندارد.
     */
    fun restore(bytes: ByteArray, exportedAt: Long, mode: RestoreMode, db: SQLiteDatabase): Int {
        if (mode == RestoreMode.Replace) db.delete("photos", null, null)
        var written = 0
        // عکس یک کالا دو عضو ZIP دارد؛ تا آمدن هر دو صبر می‌کنیم. فایل‌های خودمان
        // هر دو را پشت‌سرهم می‌نویسند، پس این نگاشت در عمل یک عضو دارد.
        val pending = HashMap<ID, MutableMap<String, ByteArray>>()
        walk(bytes) { productId, kind, data ->
            val slot = pending.getOrPut(productId) { HashMap() }
            slot[kind] = data
            val thumb = slot[THUMB]
            val full = slot[FULL]
            if (thumb != null && full != null) {
                if (write(db, productId, thumb, full, exportedAt, mode)) written += 1
                pending.remove(productId)
            }
        }
        return written
    }

    private fun write(
        db: SQLiteDatabase,
        productId: ID,
        thumb: ByteArray,
        full: ByteArray,
        exportedAt: Long,
        mode: RestoreMode,
    ): Boolean {
        if (mode == RestoreMode.Merge) {
            val local = db.rawQuery("SELECT updatedAt FROM photos WHERE productId = ?", arrayOf(productId))
                .use { if (it.moveToFirst()) it.getLong(0) else null }
            if (local != null && local > exportedAt) return false
        }
        db.insertWithOnConflict(
            "photos",
            null,
            ContentValues().apply {
                put("productId", productId)
                put("thumb", thumb)
                put("full", full)
                put("updatedAt", exportedAt)
            },
            SQLiteDatabase.CONFLICT_REPLACE,
        )
        return true
    }

    private fun putEntry(zip: ZipOutputStream, name: String, data: ByteArray) {
        zip.putNextEntry(ZipEntry(name))
        zip.write(data)
        zip.closeEntry()
    }

    private fun entryName(productId: ID, kind: String): String = "$PREFIX$productId-$kind$SUFFIX"

    /**
     * روی اعضای عکسِ فایل می‌گردد. خطا عمداً خورده نمی‌شود: اگر حین بازیابی فایل
     * نیمه‌کاره بماند، خودِ تراکنش برمی‌گردد (رفتار «همه یا هیچ»).
     */
    private fun walk(bytes: ByteArray, onEntry: (ID, String, ByteArray) -> Unit) {
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            var entry: ZipEntry? = zip.nextEntry
            while (entry != null) {
                val name = entry.name
                if (name.startsWith(PREFIX) && name.endsWith(SUFFIX)) {
                    val body = name.removePrefix(PREFIX).removeSuffix(SUFFIX)
                    val kind = when {
                        body.endsWith("-$THUMB") -> THUMB
                        body.endsWith("-$FULL") -> FULL
                        else -> null
                    }
                    if (kind != null) {
                        val productId = body.removeSuffix("-$kind")
                        if (productId.isNotEmpty()) onEntry(productId, kind, zip.readBytes())
                    }
                }
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }
    }
}
