package ir.plasco.managing.data

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import ir.plasco.managing.domain.normalizeFa
import ir.plasco.managing.domain.padStartOrPlain
import ir.plasco.managing.model.ID
import ir.plasco.managing.model.MovementType
import ir.plasco.managing.model.PriceChange
import ir.plasco.managing.model.PriceField
import ir.plasco.managing.model.Product
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** چیزی که فرم «کالای جدید» می‌فرستد. */
data class NewProduct(
    val name: String,
    val code: String? = null,
    val brandId: ID? = null,
    val categoryId: ID? = null,
    val barcodes: List<String> = emptyList(),
    val packLabel: String = "کارتن",
    val packSize: Int = 1,
    val buyPrice: Int = 0,
    val retailPrice: Int = 0,
    val wholesalePrice: Int? = null,
    val minStock: Int? = null,
    val note: String? = null,
    val initialQty: Int = 0,
    val locationId: ID? = null,
)

class ProductRepo(private val helper: PlascoDb, private val hub: DataHub, private val stock: StockRepo) {

    /**
     * کد کالا: `P-` + شمارهٔ بعدی که در همان تراکنش جلو می‌رود. کد دستی
     * شمارنده را جلو نمی‌برد و هیچ کدی دوباره استفاده نمی‌شود.
     */
    suspend fun create(input: NewProduct): Product {
        val now = System.currentTimeMillis()
        val product = inTransaction { db ->
            val code = input.code?.trim().takeUnless { it.isNullOrEmpty() } ?: nextCode(db)
            if (!input.code.isNullOrBlank() && codeExists(db, code)) {
                throw IllegalArgumentException("DuplicateProductCode")
            }
            // قیمت‌ها و تعداد بسته مثل نسخهٔ وب محدود می‌شوند.
            val created = Product(
                id = newId(),
                code = code,
                name = input.name.trim(),
                nameN = normalizeFa(input.name),
                brandId = input.brandId,
                categoryId = input.categoryId,
                barcodes = input.barcodes.filter { it.isNotBlank() },
                packLabel = input.packLabel.ifBlank { "کارتن" },
                packSize = maxOf(1, input.packSize),
                buyPrice = maxOf(0, input.buyPrice),
                retailPrice = maxOf(0, input.retailPrice),
                wholesalePrice = input.wholesalePrice?.let { maxOf(0, it) },
                minStock = input.minStock?.let { maxOf(0, it) },
                note = input.note,
                active = true,
                createdAt = now,
                updatedAt = now,
            )
            db.insertOrThrow("products", null, created.toValues())
            if (input.initialQty != 0 && input.locationId != null) {
                writeInitialMovement(db, created.id, input.locationId, input.initialQty, now, created.buyPrice)
            }
            created
        }
        hub.reloadProducts()
        hub.reloadStock()
        hub.reloadSettings()
        return product
    }

    /** ویرایش کامل؛ هر تغییر قیمت در `priceChanges` ثبت می‌شود. */
    suspend fun update(product: Product): Product {
        val now = System.currentTimeMillis()
        val before = withContext(Dispatchers.IO) {
            helper.readableDatabase
                .rawQuery("SELECT * FROM products WHERE id = ?", arrayOf(product.id))
                .use { cursor -> if (cursor.moveToFirst()) cursor.toProduct() else null }
        } ?: throw IllegalArgumentException("ProductNotFound")

        // همان محدودیت‌های نسخهٔ وب: قیمت منفی نداریم و بسته حداقل یکی است.
        // nameN مثل وب از نام + variant + family ساخته می‌شود تا ردیف‌های قدیمی
        // که هنوز این دو فیلد را دارند در جست‌وجو گم نشوند.
        val updated = product.copy(
            nameN = normalizeFa(
                listOfNotNull(product.name, product.variant, product.family)
                    .filter { it.isNotBlank() }.joinToString(" "),
            ),
            updatedAt = now,
            packSize = maxOf(1, product.packSize),
            buyPrice = maxOf(0, product.buyPrice),
            retailPrice = maxOf(0, product.retailPrice),
            wholesalePrice = product.wholesalePrice?.let { maxOf(0, it) },
            minStock = product.minStock?.let { maxOf(0, it) },
        )
        inTransaction { db ->
            // ویرایش هم مثل «کالای جدید» کد تکراری را با پیام فارسی رد می‌کند،
            // نه با خطای خام UNIQUE constraint.
            if (updated.code != before.code && codeExists(db, updated.code)) {
                throw IllegalArgumentException("DuplicateProductCode")
            }
            db.update("products", updated.toUpdateValues(), "id = ?", arrayOf(updated.id))
            for ((field, oldValue, newValue) in diffPrices(before, updated)) {
                db.insertOrThrow(
                    "priceChanges",
                    null,
                    ContentValues().apply {
                        put("id", newId())
                        put("productId", updated.id)
                        put("field", field.wire)
                        put("oldValue", oldValue)
                        put("newValue", newValue)
                        put("at", now)
                        put("reason", null as String?)
                    },
                )
            }
        }
        hub.reloadProducts()
        return updated
    }

    /** حذف نرم — ردیف می‌ماند تا تاریخچه و بکاپ سالم بماند. */
    suspend fun softDelete(id: ID) {
        inTransaction { db ->
            val now = System.currentTimeMillis()
            db.update(
                "products",
                ContentValues().apply {
                    put("deletedAt", now)
                    put("updatedAt", now)
                },
                "id = ?",
                arrayOf(id),
            )
        }
        hub.reloadProducts()
    }

    suspend fun setActive(id: ID, active: Boolean) {
        inTransaction { db ->
            db.update(
                "products",
                ContentValues().apply {
                    put("active", if (active) 1 else 0)
                    put("updatedAt", System.currentTimeMillis())
                },
                "id = ?",
                arrayOf(id),
            )
        }
        hub.reloadProducts()
    }

    suspend fun priceHistory(productId: ID): List<PriceChange> = withContext(Dispatchers.IO) {
        helper.readableDatabase
            .rawQuery("SELECT * FROM priceChanges WHERE productId = ? ORDER BY at DESC", arrayOf(productId))
            .use { cursor -> buildList { while (cursor.moveToNext()) add(cursor.toPriceChange()) } }
    }

    /**
     * موجودی اولیه هم از راه موتور حرکات می‌رود، نه با نوشتن مستقیم روی
     * `stockLevels` — همان قانون نسخهٔ وب (فقط یک نویسندهٔ موجودی). `unitCost`
     * مثل وب قیمت خریدِ همان لحظه است.
     */
    private fun writeInitialMovement(
        db: SQLiteDatabase,
        productId: ID,
        locationId: ID,
        qty: Int,
        at: Long,
        unitCost: Int,
    ) {
        stock.writeMovementInTransaction(
            db,
            MovementInput(
                productId = productId,
                locationId = locationId,
                type = MovementType.Initial,
                qty = qty,
                unitCost = unitCost,
                at = at,
            ),
        )
    }

    /**
     * شمارهٔ بعدی؛ اگر از این شماره کدها گرفته شده باشند جلو می‌رود تا تکراری
     * نشود و اگر شماره‌ها ته بکشند خطای خوانا می‌دهد (نه کد تکراری).
     */
    private fun nextCode(db: SQLiteDatabase): String {
        var no = db.rawQuery("SELECT nextProductNo FROM settings WHERE id = 1", null).use { cursor ->
            if (cursor.moveToFirst()) cursor.getInt(0) else 1
        }
        while (true) {
            if (no > MAX_PRODUCT_NO) throw IllegalStateException("ProductCodeExhausted")
            val code = "P-" + padStartOrPlain(no, 5)
            if (!codeExists(db, code)) {
                db.update("settings", ContentValues().apply { put("nextProductNo", no + 1) }, "id = 1", null)
                return code
            }
            no += 1
        }
    }

    private fun codeExists(db: SQLiteDatabase, code: String): Boolean =
        db.rawQuery("SELECT 1 FROM products WHERE code = ? LIMIT 1", arrayOf(code)).use { it.moveToFirst() }

    private suspend fun <T> inTransaction(block: (SQLiteDatabase) -> T): T = withContext(Dispatchers.IO) {
        val db = helper.writableDatabase
        db.beginTransaction()
        val result: T
        try {
            result = block(db)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        result
    }

    private companion object {
        const val MAX_PRODUCT_NO = 9_999_999
    }
}

/** قاعدهٔ خالصِ تغییر قیمت (همان diffPrices نسخهٔ وب). */
fun diffPrices(before: Product, after: Product): List<Triple<PriceField, Int, Int>> = buildList {
    if (before.buyPrice != after.buyPrice) add(Triple(PriceField.Buy, before.buyPrice, after.buyPrice))
    if (before.retailPrice != after.retailPrice) add(Triple(PriceField.Retail, before.retailPrice, after.retailPrice))
    val oldWholesale = before.wholesalePrice ?: 0
    val newWholesale = after.wholesalePrice ?: 0
    if (oldWholesale != newWholesale) add(Triple(PriceField.Wholesale, oldWholesale, newWholesale))
}
