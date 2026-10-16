package ir.plasco.managing.data

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * بکاپ و بازیابی به‌شکل نسخهٔ وب: یک فایل ZIP که داخلش `data.json` است با
 * `{ schemaVersion, exportedAt, tables }` و عکس‌ها به‌شکل `photos/<productId>-thumb.jpg`
 * و `-full.jpg`. پس فایل این نسخه و نسخهٔ وب در هر دو جهت روی هم می‌نشینند.
 *
 * دو حالت بازیابی:
 * - **جایگزینی**: همه‌چیز پاک و بکاپ بارگذاری می‌شود (اسم دستگاه حفظ می‌شود).
 * - **ادغام**: هر ردیف بر اساس `updatedAt` تازه‌تر باشد جایگزین می‌شود؛ کد کالا
 *   اگر با کالای دیگری تداخل داشته باشد، شمارهٔ تازه می‌گیرد.
 *
 * در پایان هر دو حالت، موجودی‌ها از روی حرکات بازسازی می‌شوند.
 */
class BackupInvalidException(val detail: String? = null) : Exception("BackupInvalid:${detail ?: ""}")

enum class RestoreMode { Replace, Merge }

data class BackupSummary(val products: Int, val movements: Int, val photos: Int, val bytes: Int)

data class RestoreSummary(
    val mode: RestoreMode,
    val products: Int,
    val movements: Int,
    val photos: Int,
    val renumbered: Int,
)

/** همان چیزی که `parseBackup` از فایل درمی‌آورد. */
private data class ParsedBackup(val tables: JSONObject, val exportedAt: Long)

/** شمارهٔ قالب بکاپ؛ همان نسخهٔ اسکیمای نسخهٔ وب است، نه نسخهٔ جدول‌های اندروید. */
const val BACKUP_SCHEMA_VERSION = 2

private enum class Kind { Text, Int, OptionalText, OptionalInt, Bool, Barcodes }

private data class Column(val key: String, val kind: Kind)

private data class TableSpec(val name: String, val columns: List<Column>, val idColumn: String = "id")

private fun baseColumns(): List<Column> = listOf(
    Column("id", Kind.Text),
    Column("createdAt", Kind.Int),
    Column("updatedAt", Kind.Int),
    Column("deletedAt", Kind.OptionalInt),
)

private val TABLES: List<TableSpec> = listOf(
    TableSpec(
        "brands",
        baseColumns() + listOf(
            Column("name", Kind.Text),
            Column("nameN", Kind.Text),
            Column("phone", Kind.OptionalText),
            Column("repName", Kind.OptionalText),
            Column("note", Kind.OptionalText),
        ),
    ),
    TableSpec(
        "categories",
        baseColumns() + listOf(
            Column("name", Kind.Text),
            Column("nameN", Kind.Text),
            Column("sort", Kind.Int),
        ),
    ),
    TableSpec(
        "locations",
        baseColumns() + listOf(Column("name", Kind.Text), Column("sort", Kind.Int)),
    ),
    TableSpec(
        "products",
        baseColumns() + listOf(
            Column("code", Kind.Text),
            Column("name", Kind.Text),
            Column("variant", Kind.OptionalText),
            Column("family", Kind.OptionalText),
            Column("nameN", Kind.Text),
            Column("brandId", Kind.OptionalText),
            Column("categoryId", Kind.OptionalText),
            Column("barcodes", Kind.Barcodes),
            Column("packLabel", Kind.Text),
            Column("packSize", Kind.Int),
            Column("buyPrice", Kind.Int),
            Column("retailPrice", Kind.Int),
            Column("wholesalePrice", Kind.OptionalInt),
            Column("minStock", Kind.OptionalInt),
            Column("note", Kind.OptionalText),
            Column("active", Kind.Bool),
        ),
    ),
    TableSpec(
        "stockLevels",
        listOf(
            Column("productId", Kind.Text),
            Column("locationId", Kind.Text),
            Column("qty", Kind.Int),
            Column("bin", Kind.OptionalText),
            Column("updatedAt", Kind.Int),
        ),
        idColumn = "productId",
    ),
    TableSpec(
        "movements",
        baseColumns() + listOf(
            Column("productId", Kind.Text),
            Column("locationId", Kind.Text),
            Column("type", Kind.Text),
            Column("qty", Kind.Int),
            Column("unitCost", Kind.OptionalInt),
            Column("unitPrice", Kind.OptionalInt),
            Column("refId", Kind.OptionalText),
            Column("undoOf", Kind.OptionalText),
            Column("note", Kind.OptionalText),
            Column("at", Kind.Int),
        ),
    ),
    TableSpec(
        "priceChanges",
        listOf(
            Column("id", Kind.Text),
            Column("productId", Kind.Text),
            Column("field", Kind.Text),
            Column("oldValue", Kind.Int),
            Column("newValue", Kind.Int),
            Column("at", Kind.Int),
            Column("reason", Kind.OptionalText),
        ),
    ),
    TableSpec(
        "stockTakes",
        baseColumns() + listOf(
            Column("locationId", Kind.Text),
            Column("status", Kind.Text),
            Column("appliedAt", Kind.OptionalInt),
            Column("note", Kind.OptionalText),
        ),
    ),
    TableSpec(
        "stockTakeItems",
        listOf(
            Column("id", Kind.Text),
            Column("stockTakeId", Kind.Text),
            Column("productId", Kind.Text),
            Column("counted", Kind.Int),
            Column("systemQtyAtCount", Kind.Int),
            Column("at", Kind.Int),
        ),
    ),
)

/** Barcode list uses a newline separator inside one column. */
private const val BARCODE_SEPARATOR = "\n"

class BackupRepo(
    private val helper: PlascoDb,
    private val hub: DataHub,
    private val settings: SettingsRepo,
    private val stock: StockRepo,
) {

    /**
     * ZIP سازگار با نسخهٔ وب. تاریخ آخرین بکاپ هم به‌روز می‌شود.
     * خواندن همهٔ جدول‌ها و نوشتن ZIP روی رشتهٔ IO انجام می‌شود؛ روی ترد اصلی
     * با هزاران ردیف و عکس، فریز و ANR می‌داد.
     */
    suspend fun createBackup(): Pair<ByteArray, BackupSummary> = withContext(Dispatchers.IO) {
        val db = helper.readableDatabase
        val root = JSONObject()
        root.put("schemaVersion", BACKUP_SCHEMA_VERSION)
        root.put("exportedAt", System.currentTimeMillis())
        val tables = JSONObject()
        var products = 0
        var movements = 0
        for (spec in TABLES) {
            val rows = exportTable(db, spec)
            if (spec.name == "products") products = rows.length()
            if (spec.name == "movements") movements = rows.length()
            tables.put(spec.name, rows)
        }
        tables.put("settings", exportSettings(db))
        root.put("tables", tables)

        var photos = 0
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            zip.putNextEntry(ZipEntry("data.json"))
            zip.write(root.toString().toByteArray(Charsets.UTF_8))
            zip.closeEntry()
            photos = BackupPhotos.write(zip, db)
        }
        val bytes = out.toByteArray()
        settings.update { it.copy(lastBackupAt = System.currentTimeMillis()) }
        bytes to BackupSummary(products, movements, photos, bytes.size)
    }

    /**
     * بازیابی. قبل از هر کاری همهٔ ساختار فایل بررسی می‌شود؛ اگر ناقص باشد
     * هیچ چیزی عوض نمی‌شود (خطای BackupInvalidException با علت خوانا).
     */
    suspend fun restore(bytes: ByteArray, mode: RestoreMode): RestoreSummary = withContext(Dispatchers.IO) {
        val parsed = parseBackup(bytes)
        val data = parsed.tables
        var products = 0
        var movements = 0
        var photos = 0
        var renumbered = 0

        val db = helper.writableDatabase
        db.beginTransaction()
        try {
            if (mode == RestoreMode.Replace) clearAll(db)
            var nextCode = nextProductNo(db)

            for (spec in TABLES) {
                val rows = data.optJSONArray(spec.name) ?: JSONArray()
                for (index in 0 until rows.length()) {
                    val row = rows.optJSONObject(index) ?: throw BackupInvalidException("${spec.name}:${index}")
                    if (spec.name == "products") {
                        val code = row.optString("code")
                        if (code.isNotEmpty() && codeTakenByOther(db, code, row.optString("id"))) {
                            var newCode = "P-" + nextCode.toString().padStart(5, '0')
                            while (codeTakenByOther(db, newCode, row.optString("id"))) {
                                nextCode += 1
                                newCode = "P-" + nextCode.toString().padStart(5, '0')
                            }
                            nextCode += 1
                            row.put("code", newCode)
                            renumbered += 1
                        }
                    }
                    val written = writeRow(db, spec, row, mode)
                    if (!written) continue
                    if (spec.name == "products") products += 1
                    if (spec.name == "movements") movements += 1
                }
            }
            writeSettings(db, data.optJSONArray("settings"), mode)
            // عکس‌ها هم داخل همان تراکنش می‌نشینند: یا همه می‌آیند یا هیچ‌کدام.
            photos = BackupPhotos.restore(bytes, parsed.exportedAt, mode, db)
            // موجودی‌ها همیشه از روی حرکات بازسازی می‌شوند (قفسه‌ها حفظ).
            stock.rebuildLevelsInTransaction(db)
            if (renumbered > 0) {
                db.update("settings", ContentValues().apply { put("nextProductNo", nextCode) }, "id = 1", null)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        hub.reloadAll()
        RestoreSummary(mode, products, movements, photos, renumbered)
    }

    /** فایل را می‌خواند و فقط ساختار را بررسی می‌کند (برای پیش‌نمایش). */
    suspend fun inspect(bytes: ByteArray): RestoreSummary = withContext(Dispatchers.IO) {
        val data = parseBackup(bytes).tables
        RestoreSummary(
            mode = RestoreMode.Merge,
            products = data.optJSONArray("products")?.length() ?: 0,
            movements = data.optJSONArray("movements")?.length() ?: 0,
            photos = BackupPhotos.count(bytes),
            renumbered = 0,
        )
    }

    // --- خواندن و نوشتن ---

    private fun parseBackup(bytes: ByteArray): ParsedBackup {
        val json = readDataJson(bytes)
        val parsed = try {
            JSONObject(json)
        } catch (error: Throwable) {
            throw BackupInvalidException("bad-json")
        }
        if (!parsed.has("tables")) throw BackupInvalidException("tables-missing")
        val version = parsed.optInt("schemaVersion", -1)
        if (version < 0) throw BackupInvalidException("schema-missing")
        if (version > BACKUP_SCHEMA_VERSION) throw BackupInvalidException("schema-newer:$version")
        val tables = parsed.optJSONObject("tables") ?: throw BackupInvalidException("tables-missing")
        return ParsedBackup(tables, parsed.optLong("exportedAt", 0L))
    }

    private fun readDataJson(bytes: ByteArray): String {
        // اگر خودِ فایل JSON خالص بود (مثل خروجی دستی) هم قبول می‌کنیم.
        val head = String(bytes, 0, minOf(bytes.size, 1), Charsets.UTF_8)
        if (head == "{") return String(bytes, Charsets.UTF_8)
        try {
            ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
                var entry: ZipEntry? = zip.nextEntry
                while (entry != null) {
                    if (entry.name == "data.json") {
                        return zip.readBytes().toString(Charsets.UTF_8)
                    }
                    entry = zip.nextEntry
                }
            }
        } catch (error: Throwable) {
            throw BackupInvalidException("unzip-failed")
        }
        throw BackupInvalidException("data-json-missing")
    }

    private fun exportTable(db: SQLiteDatabase, spec: TableSpec): JSONArray {
        val rows = JSONArray()
        db.rawQuery("SELECT * FROM ${spec.name}", null).use { cursor ->
            while (cursor.moveToNext()) {
                val row = JSONObject()
                for (column in spec.columns) {
                    val index = cursor.getColumnIndex(column.key)
                    if (index < 0) continue
                    if (cursor.isNull(index)) continue // کلیدهای خالی اصلاً نوشته نمی‌شوند
                    when (column.kind) {
                        Kind.Text, Kind.OptionalText -> row.put(column.key, cursor.getString(index))
                        // getInt مهرهای زمانی میلی‌ثانیه‌ای را به ۳۲ بیت می‌بُرید
                        // (createdAt/updatedAt/deletedAt/at/appliedAt هرکدام > 2^31)؛
                        // همهٔ اعداد با getLong خوانده می‌شوند — اعداد کوچک هم مشکلی ندارند.
                        Kind.Int, Kind.OptionalInt -> row.put(column.key, cursor.getLong(index))
                        Kind.Bool -> row.put(column.key, cursor.getInt(index) != 0)
                        Kind.Barcodes -> {
                            val list = JSONArray()
                            cursor.getString(index)
                                .split(BARCODE_SEPARATOR)
                                .filter { it.isNotBlank() }
                                .forEach { list.put(it) }
                            row.put(column.key, list)
                        }
                    }
                }
                rows.put(row)
            }
        }
        return rows
    }

    private fun exportSettings(db: SQLiteDatabase): JSONArray {
        val rows = JSONArray()
        db.rawQuery("SELECT * FROM settings WHERE id = 1", null).use { cursor ->
            if (!cursor.moveToFirst()) return rows
            val pairs = listOf(
                "shopName" to cursor.getString(cursor.getColumnIndexOrThrow("shopName")),
                "currencyLabel" to cursor.getString(cursor.getColumnIndexOrThrow("currencyLabel")),
                "textScale" to cursor.getFloat(cursor.getColumnIndexOrThrow("textScale")),
                "theme" to cursor.getString(cursor.getColumnIndexOrThrow("theme")),
                "nextProductNo" to cursor.getInt(cursor.getColumnIndexOrThrow("nextProductNo")),
                "costLockEnabled" to (cursor.getInt(cursor.getColumnIndexOrThrow("costLockEnabled")) != 0),
                "deviceName" to cursor.getString(cursor.getColumnIndexOrThrow("deviceName")),
                "devicePrefix" to cursor.getString(cursor.getColumnIndexOrThrow("devicePrefix")),
            )
            for ((key, value) in pairs) {
                rows.put(JSONObject().put("key", key).put("value", value))
            }
            val lastBackup = cursor.getColumnIndexOrThrow("lastBackupAt")
            if (!cursor.isNull(lastBackup)) {
                rows.put(JSONObject().put("key", "lastBackupAt").put("value", cursor.getLong(lastBackup)))
            }
        }
        return rows
    }

    /** یک ردیف را می‌نویسد. false یعنی در حالت ادغام، نسخهٔ موجود تازه‌تر بود. */
    private fun writeRow(db: SQLiteDatabase, spec: TableSpec, row: JSONObject, mode: RestoreMode): Boolean {
        // ردیف‌هایی که کلید اصلی‌شان خالی است دور ریخته می‌شوند.
        val values = ContentValues()
        for (column in spec.columns) {
            if (!row.has(column.key)) continue
            when (column.kind) {
                Kind.Text, Kind.OptionalText -> values.put(column.key, row.getString(column.key))
                // optInt همین‌جا مهرهای زمانی فایل را می‌بُرید و با ۲^۳۲ جمع می‌شد
                // (تاریخ‌های ۲۰۰۱)؛ optLong همان چیزی را برمی‌گرداند که ذخیره شده.
                Kind.Int, Kind.OptionalInt -> values.put(column.key, row.optLong(column.key))
                Kind.Bool -> values.put(column.key, if (row.optBoolean(column.key)) 1 else 0)
                Kind.Barcodes -> {
                    val list = row.optJSONArray(column.key)
                    val text = buildString {
                        for (index in 0 until (list?.length() ?: 0)) {
                            if (isNotEmpty()) append(BARCODE_SEPARATOR)
                            append(list?.optString(index).orEmpty())
                        }
                    }
                    values.put(column.key, text)
                }
            }
        }
        // هیچ‌وقت کلید اصلی خالی نمی‌ماند.
        if (values.getAsString(spec.idColumn) == null) return false
        val where = if (spec.name == "stockLevels") "productId = ? AND locationId = ?"
        else "${spec.idColumn} = ?"
        val args = if (spec.name == "stockLevels") {
            arrayOf(values.getAsString("productId"), values.getAsString("locationId"))
        } else {
            arrayOf(values.getAsString(spec.idColumn))
        }
        // جدول‌هایی مثل priceChanges ستون updatedAt ندارند؛ آن‌ها همیشه می‌نشینند.
        val hasUpdatedAt = spec.columns.any { it.key == "updatedAt" }
        if (mode == RestoreMode.Merge && hasUpdatedAt) {
            val incomingUpdated = row.optLong("updatedAt", 0L)
            val existing = db.query(
                spec.name,
                arrayOf("updatedAt"),
                where,
                args,
                null,
                null,
                null,
            ).use { cursor -> if (cursor.moveToFirst()) cursor.getLong(0) else null }
            if (existing != null && existing >= incomingUpdated) return false
            if (existing != null) {
                db.update(spec.name, values, where, args)
                return true
            }
        }
        db.insertWithOnConflict(spec.name, null, values, SQLiteDatabase.CONFLICT_REPLACE)
        return true
    }

    /**
     * تنظیمات بکاپ.
     *
     * در «جایگزینی» تنظیمات فایل می‌نشیند — به‌جز اسم و پیشوند دستگاه که هویت هر گوشی
     * مال خودش است. در «ادغام» هیچ تنظیم نمایشی‌ای از فایل دیگری گرفته نمی‌شود (همان
     * کاری که نسخهٔ وب می‌کند): اسم فروشگاه، واحد پول، رنگ، اندازهٔ متن و آخرین بکاپ
     * مال همین دستگاه‌اند. فقط `nextProductNo` و آن هم تنها اگر بزرگ‌تر باشد بالا می‌رود
     * تا کد کالای تازه با کدهای آمده از فایل دیگر تداخل نکند.
     */
    private fun writeSettings(db: SQLiteDatabase, rows: JSONArray?, mode: RestoreMode) {
        if (rows == null) return
        val map = HashMap<String, Any>()
        for (index in 0 until rows.length()) {
            val row = rows.optJSONObject(index) ?: continue
            val key = row.optString("key")
            if (key.isEmpty()) continue
            map[key] = row.opt("value") ?: continue
        }
        if (mode == RestoreMode.Merge) {
            val incoming = (map["nextProductNo"] as? Number)?.toInt() ?: return
            if (incoming > nextProductNo(db)) {
                db.update("settings", ContentValues().apply { put("nextProductNo", incoming) }, "id = 1", null)
            }
            return
        }
        val values = ContentValues()
        if (map.containsKey("shopName")) values.put("shopName", map["shopName"].toString())
        if (map.containsKey("currencyLabel")) values.put("currencyLabel", map["currencyLabel"].toString())
        if (map.containsKey("theme")) values.put("theme", map["theme"].toString())
        if (map.containsKey("textScale")) values.put("textScale", (map["textScale"] as? Number)?.toFloat() ?: 1f)
        if (map.containsKey("nextProductNo")) values.put("nextProductNo", (map["nextProductNo"] as? Number)?.toInt() ?: 1)
        if (map.containsKey("lastBackupAt")) values.put("lastBackupAt", (map["lastBackupAt"] as? Number)?.toLong())
        if (map.containsKey("costLockEnabled")) {
            values.put("costLockEnabled", if (map["costLockEnabled"] == true) 1 else 0)
        }
        if (values.size() > 0) db.update("settings", values, "id = 1", null)
        // کلیدهای ناشناخته (قفل رمز، مپینگ ورودی) در این نسخه جایی ندارند.
    }

    private fun clearAll(db: SQLiteDatabase) {
        for (spec in TABLES) db.delete(spec.name, null, null)
    }

    private fun nextProductNo(db: SQLiteDatabase): Int =
        db.rawQuery("SELECT nextProductNo FROM settings WHERE id = 1", null).use { cursor ->
            if (cursor.moveToFirst()) cursor.getInt(0) else 1
        }

    private fun codeTakenByOther(db: SQLiteDatabase, code: String, id: String): Boolean =
        db.rawQuery("SELECT id FROM products WHERE code = ? AND id <> ? LIMIT 1", arrayOf(code, id)).use {
            it.moveToFirst()
        }

}
