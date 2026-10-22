package ir.plasco.managing.data

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import ir.plasco.managing.model.ID
import java.io.InputStream
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
    private const val MAX_ENTRIES = 40_000
    private const val MAX_ENTRY_BYTES = 8 * 1024 * 1024
    private const val MAX_TOTAL_BYTES = 512L * 1024 * 1024

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
    fun count(input: InputStream): Int = runCatching {
        val ids = HashSet<ID>()
        walk(input) { productId, kind, data -> if (kind == THUMB && data.isNotEmpty()) ids.add(productId) }
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
    fun restore(input: InputStream, exportedAt: Long, mode: RestoreMode, db: SQLiteDatabase): Int {
        if (mode == RestoreMode.Replace) db.delete("photos", null, null)
        var written = 0
        // عکس یک کالا دو عضو ZIP دارد؛ تا آمدن هر دو صبر می‌کنیم. فایل‌های خودمان
        // هر دو را پشت‌سرهم می‌نویسند، پس این نگاشت در عمل یک عضو دارد.
        val pending = HashMap<ID, MutableMap<String, ByteArray>>()
        walk(input) { productId, kind, data ->
            // فقط JPEG واقعی و فقط برای کالایی که در همین فایل/دیتابیس هست.
            // بایت دلخواه نباید به‌عنوان عکس در دیتابیس بنشیند.
            if (!isJpeg(data) || !productExists(db, productId)) return@walk
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

    private fun productExists(db: SQLiteDatabase, productId: ID): Boolean =
        db.rawQuery("SELECT 1 FROM products WHERE id = ? LIMIT 1", arrayOf(productId)).use {
            it.moveToFirst()
        }

    private fun isJpeg(data: ByteArray): Boolean =
        data.size >= 4 &&
            data[0] == 0xFF.toByte() &&
            data[1] == 0xD8.toByte() &&
            data[2] == 0xFF.toByte()

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
    private fun walk(input: InputStream, onEntry: (ID, String, ByteArray) -> Unit) {
        ZipInputStream(input).use { zip ->
            var entry: ZipEntry? = zip.nextEntry
            var entries = 0
            var totalBytes = 0L
            while (entry != null) {
                val name = entry.name
                if (name.startsWith(PREFIX) && name.endsWith(SUFFIX)) {
                    entries += 1
                    if (entries > MAX_ENTRIES) throw BackupInvalidException("photos-too-many")
                    if (entry.size > MAX_ENTRY_BYTES) {
                        throw BackupInvalidException("photo-too-large:$name")
                    }
                    val body = name.removePrefix(PREFIX).removeSuffix(SUFFIX)
                    val kind = when {
                        body.endsWith("-$THUMB") -> THUMB
                        body.endsWith("-$FULL") -> FULL
                        else -> null
                    }
                    if (kind != null) {
                        val productId = body.removeSuffix("-$kind")
                        if (productId.isNotEmpty()) {
                            val data = readLimited(zip, MAX_ENTRY_BYTES, "photo-too-large:$name")
                            totalBytes += data.size
                            if (totalBytes > MAX_TOTAL_BYTES) {
                                throw BackupInvalidException("photos-too-large")
                            }
                            onEntry(productId, kind, data)
                        }
                    }
                }
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }
    }

    private fun readLimited(input: InputStream, limit: Int, detail: String): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        var total = 0
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            if (total > limit) throw BackupInvalidException(detail)
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }
}
