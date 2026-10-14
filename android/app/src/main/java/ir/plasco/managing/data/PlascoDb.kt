package ir.plasco.managing.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import ir.plasco.managing.domain.normalizeFa

/**
 * همان جدول‌های نسخهٔ وب (Dexie schema v2) روی SQLite گوشی.
 * هیچ نوشتنی مستقیم روی `stockLevels` نمی‌رود؛ فقط موتور حرکات آن را عوض می‌کند.
 */
class PlascoDb(context: Context) : SQLiteOpenHelper(context, NAME, null, VERSION) {

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        SCHEMA.forEach(db::execSQL)
        seed(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // نسخهٔ ۱ اولین نسخه است؛ تغییر بعدی = نسخهٔ ۲ با مهاجرت جدا.
    }

    /**
     * سه مکان پیش‌فرض و ردیف تنظیمات — عیناً همان پیش‌فرض‌های نسخهٔ وب
     * (`DEFAULT_LOCATIONS` / `DEFAULT_SETTINGS` در src/db/dexie.ts)، چون بکاپ
     * دو نسخه باید روی هم بنشیند: شناسهٔ مکان‌ها باید یکی باشد.
     */
    private fun seed(db: SQLiteDatabase) {
        val now = System.currentTimeMillis()
        DEFAULT_LOCATIONS.forEachIndexed { index, (id, name) ->
            db.execSQL(
                "INSERT OR IGNORE INTO locations (id, name, sort, createdAt, updatedAt, deletedAt) " +
                    "VALUES (?, ?, ?, ?, ?, NULL)",
                arrayOf<Any?>(id, name, index, now, now),
            )
        }
        db.execSQL(
            "INSERT OR IGNORE INTO settings (id, shopName, currencyLabel, textScale, theme, " +
                "nextProductNo, lastBackupAt, costLockEnabled, deviceName, devicePrefix) " +
                "VALUES (1, ?, ?, 1, 'system', 1, NULL, 0, ?, ?)",
            arrayOf<Any?>(DEFAULT_SHOP_NAME, DEFAULT_CURRENCY_LABEL, DEFAULT_DEVICE_NAME, DEFAULT_DEVICE_PREFIX),
        )
    }

    companion object {
        const val NAME = "plasco-managing.db"
        const val VERSION = 1

        /** همان شناسه‌های نسخهٔ وب — وگرنه بازیابی بکاپ، مکان‌ها را دوباره می‌سازد. */
        val DEFAULT_LOCATIONS: List<Pair<String, String>> = listOf(
            "loc-shop" to "مغازه",
            "loc-warehouse" to "انبار",
            "loc-basement" to "زیرزمین",
        )

        const val DEFAULT_SHOP_NAME = "پلاسکو منیجینگ"
        const val DEFAULT_CURRENCY_LABEL = "تومان"
        const val DEFAULT_DEVICE_NAME = "دستگاه اصلی"
        const val DEFAULT_DEVICE_PREFIX = "DEV1"

        private val SCHEMA = listOf(
            """
            CREATE TABLE brands (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, nameN TEXT NOT NULL,
              phone TEXT, repName TEXT, note TEXT,
              createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deletedAt INTEGER
            )
            """.trimIndent(),
            """
            CREATE TABLE categories (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, nameN TEXT NOT NULL, sort INTEGER NOT NULL,
              createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deletedAt INTEGER
            )
            """.trimIndent(),
            """
            CREATE TABLE locations (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL,
              createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deletedAt INTEGER
            )
            """.trimIndent(),
            """
            CREATE TABLE products (
              id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
              variant TEXT, family TEXT, nameN TEXT NOT NULL, brandId TEXT, categoryId TEXT,
              barcodes TEXT NOT NULL DEFAULT '', packLabel TEXT NOT NULL, packSize INTEGER NOT NULL,
              buyPrice INTEGER NOT NULL, retailPrice INTEGER NOT NULL, wholesalePrice INTEGER,
              minStock INTEGER, note TEXT, active INTEGER NOT NULL,
              createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deletedAt INTEGER
            )
            """.trimIndent(),
            "CREATE INDEX idx_products_nameN ON products(nameN)",
            """
            CREATE TABLE stockLevels (
              productId TEXT NOT NULL, locationId TEXT NOT NULL, qty INTEGER NOT NULL,
              bin TEXT, updatedAt INTEGER NOT NULL,
              PRIMARY KEY (productId, locationId)
            )
            """.trimIndent(),
            """
            CREATE TABLE movements (
              id TEXT PRIMARY KEY, productId TEXT NOT NULL, locationId TEXT NOT NULL,
              type TEXT NOT NULL, qty INTEGER NOT NULL, unitCost INTEGER, unitPrice INTEGER,
              refId TEXT, undoOf TEXT, note TEXT, at INTEGER NOT NULL,
              createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
            )
            """.trimIndent(),
            "CREATE INDEX idx_movements_product_at ON movements(productId, at)",
            "CREATE INDEX idx_movements_at ON movements(at)",
            "CREATE INDEX idx_movements_undoOf ON movements(undoOf)",
            """
            CREATE TABLE priceChanges (
              id TEXT PRIMARY KEY, productId TEXT NOT NULL, field TEXT NOT NULL,
              oldValue INTEGER NOT NULL, newValue INTEGER NOT NULL, at INTEGER NOT NULL, reason TEXT
            )
            """.trimIndent(),
            "CREATE INDEX idx_priceChanges_product ON priceChanges(productId, at)",
            """
            CREATE TABLE stockTakes (
              id TEXT PRIMARY KEY, locationId TEXT NOT NULL, status TEXT NOT NULL,
              appliedAt INTEGER, note TEXT,
              createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, deletedAt INTEGER
            )
            """.trimIndent(),
            """
            CREATE TABLE stockTakeItems (
              id TEXT PRIMARY KEY, stockTakeId TEXT NOT NULL, productId TEXT NOT NULL,
              counted INTEGER NOT NULL, systemQtyAtCount INTEGER NOT NULL, at INTEGER NOT NULL
            )
            """.trimIndent(),
            "CREATE INDEX idx_stockTakeItems_take ON stockTakeItems(stockTakeId, productId)",
            """
            CREATE TABLE settings (
              id INTEGER PRIMARY KEY CHECK (id = 1), shopName TEXT NOT NULL,
              currencyLabel TEXT NOT NULL, textScale REAL NOT NULL, theme TEXT NOT NULL,
              nextProductNo INTEGER NOT NULL, lastBackupAt INTEGER,
              costLockEnabled INTEGER NOT NULL, deviceName TEXT NOT NULL, devicePrefix TEXT NOT NULL
            )
            """.trimIndent(),
        )
    }
}

/** یک نام فارسی را برای ذخیره آماده می‌کند (ستون nameN). */
fun nameKeyOf(name: String): String = normalizeFa(name)
