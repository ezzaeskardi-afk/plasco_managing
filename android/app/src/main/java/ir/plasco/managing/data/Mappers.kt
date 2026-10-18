package ir.plasco.managing.data

import android.content.ContentValues
import android.database.Cursor
import ir.plasco.managing.model.Brand
import ir.plasco.managing.model.Category
import ir.plasco.managing.model.Location
import ir.plasco.managing.model.Movement
import ir.plasco.managing.model.MovementType
import ir.plasco.managing.model.PriceChange
import ir.plasco.managing.model.PriceField
import ir.plasco.managing.model.Product
import ir.plasco.managing.model.Settings
import ir.plasco.managing.model.StockLevel
import ir.plasco.managing.model.StockTake
import ir.plasco.managing.model.StockTakeItem
import ir.plasco.managing.model.StockTakeStatus
import ir.plasco.managing.model.ThemeMode

/**
 * خواندن و نوشتن ردیف‌ها. اسکن بارکد و بارکدهای متنی چندتایی با `\n` در یک ستون
 * ذخیره می‌شوند (در نسخهٔ وب آرایه بودند).
 */
private const val BARCODE_SEPARATOR = "\n"

internal fun Cursor.text(name: String): String {
    val index = getColumnIndexOrThrow(name)
    return if (isNull(index)) "" else getString(index)
}

internal fun Cursor.optText(name: String): String? {
    val index = getColumnIndexOrThrow(name)
    return if (isNull(index)) null else getString(index)
}

fun Cursor.toProduct(): Product = Product(
    id = text("id"),
    code = text("code"),
    name = text("name"),
    variant = optText("variant"),
    family = optText("family"),
    nameN = text("nameN"),
    brandId = optText("brandId"),
    categoryId = optText("categoryId"),
    barcodes = text("barcodes").split(BARCODE_SEPARATOR).filter { it.isNotBlank() },
    packLabel = text("packLabel"),
    packSize = getInt(getColumnIndexOrThrow("packSize")),
    buyPrice = getInt(getColumnIndexOrThrow("buyPrice")),
    retailPrice = getInt(getColumnIndexOrThrow("retailPrice")),
    wholesalePrice = optText("wholesalePrice")?.let { getInt(getColumnIndexOrThrow("wholesalePrice")) },
    minStock = if (isNull(getColumnIndexOrThrow("minStock"))) null else getInt(getColumnIndexOrThrow("minStock")),
    note = optText("note"),
    active = getInt(getColumnIndexOrThrow("active")) != 0,
    createdAt = getLong(getColumnIndexOrThrow("createdAt")),
    updatedAt = getLong(getColumnIndexOrThrow("updatedAt")),
    deletedAt = if (isNull(getColumnIndexOrThrow("deletedAt"))) null else getLong(getColumnIndexOrThrow("deletedAt")),
)

fun Product.toValues(): ContentValues = ContentValues().apply {
    put("id", id)
    put("code", code)
    put("name", name)
    put("variant", variant)
    put("family", family)
    put("nameN", nameN)
    put("brandId", brandId)
    put("categoryId", categoryId)
    put("barcodes", barcodes.joinToString(BARCODE_SEPARATOR))
    put("packLabel", packLabel)
    put("packSize", packSize)
    put("buyPrice", buyPrice)
    put("retailPrice", retailPrice)
    put("wholesalePrice", wholesalePrice)
    put("minStock", minStock)
    put("note", note)
    put("active", if (active) 1 else 0)
    put("createdAt", createdAt)
    put("updatedAt", updatedAt)
    put("deletedAt", deletedAt)
}

/**
 * ویرایش ردیف موجود: `id`، `createdAt` و `deletedAt` نوشته نمی‌شوند تا UPDATE
 * ناخواسته یک کالای حذف‌شده را احیا یا زمان ساختش را بازنویسی نکند (مثل وب).
 */
fun Product.toUpdateValues(): ContentValues = toValues().apply {
    remove("id")
    remove("createdAt")
    remove("deletedAt")
}

fun Cursor.toStockLevel(): StockLevel = StockLevel(
    productId = text("productId"),
    locationId = text("locationId"),
    qty = getInt(getColumnIndexOrThrow("qty")),
    bin = optText("bin"),
    updatedAt = getLong(getColumnIndexOrThrow("updatedAt")),
)

fun Cursor.toMovement(): Movement = Movement(
    id = text("id"),
    productId = text("productId"),
    locationId = text("locationId"),
    type = MovementType.fromWire(text("type")),
    qty = getInt(getColumnIndexOrThrow("qty")),
    unitCost = if (isNull(getColumnIndexOrThrow("unitCost"))) null else getInt(getColumnIndexOrThrow("unitCost")),
    unitPrice = if (isNull(getColumnIndexOrThrow("unitPrice"))) null else getInt(getColumnIndexOrThrow("unitPrice")),
    refId = optText("refId"),
    undoOf = optText("undoOf"),
    note = optText("note"),
    at = getLong(getColumnIndexOrThrow("at")),
    createdAt = getLong(getColumnIndexOrThrow("createdAt")),
    updatedAt = getLong(getColumnIndexOrThrow("updatedAt")),
)

fun Cursor.toBrand(): Brand = Brand(
    id = text("id"),
    name = text("name"),
    nameN = text("nameN"),
    phone = optText("phone"),
    repName = optText("repName"),
    note = optText("note"),
    createdAt = getLong(getColumnIndexOrThrow("createdAt")),
    updatedAt = getLong(getColumnIndexOrThrow("updatedAt")),
    deletedAt = if (isNull(getColumnIndexOrThrow("deletedAt"))) null else getLong(getColumnIndexOrThrow("deletedAt")),
)

fun Cursor.toCategory(): Category = Category(
    id = text("id"),
    name = text("name"),
    nameN = text("nameN"),
    sort = getInt(getColumnIndexOrThrow("sort")),
    createdAt = getLong(getColumnIndexOrThrow("createdAt")),
    updatedAt = getLong(getColumnIndexOrThrow("updatedAt")),
    deletedAt = if (isNull(getColumnIndexOrThrow("deletedAt"))) null else getLong(getColumnIndexOrThrow("deletedAt")),
)

fun Cursor.toLocation(): Location = Location(
    id = text("id"),
    name = text("name"),
    sort = getInt(getColumnIndexOrThrow("sort")),
    createdAt = getLong(getColumnIndexOrThrow("createdAt")),
    updatedAt = getLong(getColumnIndexOrThrow("updatedAt")),
    deletedAt = if (isNull(getColumnIndexOrThrow("deletedAt"))) null else getLong(getColumnIndexOrThrow("deletedAt")),
)

fun Cursor.toSettings(): Settings = Settings(
    shopName = text("shopName"),
    currencyLabel = text("currencyLabel"),
    textScale = getFloat(getColumnIndexOrThrow("textScale")),
    theme = ThemeMode.entries.firstOrNull { it.wire == text("theme") } ?: ThemeMode.System,
    nextProductNo = getInt(getColumnIndexOrThrow("nextProductNo")),
    lastBackupAt = if (isNull(getColumnIndexOrThrow("lastBackupAt"))) null else getLong(getColumnIndexOrThrow("lastBackupAt")),
    costLockEnabled = getInt(getColumnIndexOrThrow("costLockEnabled")) != 0,
    deviceName = text("deviceName"),
    devicePrefix = text("devicePrefix"),
)

fun Cursor.toPriceChange(): PriceChange = PriceChange(
    id = text("id"),
    productId = text("productId"),
    field = PriceField.entries.firstOrNull { it.wire == text("field") } ?: PriceField.Buy,
    oldValue = getInt(getColumnIndexOrThrow("oldValue")),
    newValue = getInt(getColumnIndexOrThrow("newValue")),
    at = getLong(getColumnIndexOrThrow("at")),
    reason = optText("reason"),
)

fun Cursor.toStockTake(): StockTake = StockTake(
    id = text("id"),
    locationId = text("locationId"),
    status = StockTakeStatus.fromWire(text("status")),
    appliedAt = if (isNull(getColumnIndexOrThrow("appliedAt"))) null else getLong(getColumnIndexOrThrow("appliedAt")),
    note = optText("note"),
    createdAt = getLong(getColumnIndexOrThrow("createdAt")),
    updatedAt = getLong(getColumnIndexOrThrow("updatedAt")),
    deletedAt = if (isNull(getColumnIndexOrThrow("deletedAt"))) null else getLong(getColumnIndexOrThrow("deletedAt")),
)

fun Cursor.toStockTakeItem(): StockTakeItem = StockTakeItem(
    id = text("id"),
    stockTakeId = text("stockTakeId"),
    productId = text("productId"),
    counted = getInt(getColumnIndexOrThrow("counted")),
    systemQtyAtCount = getInt(getColumnIndexOrThrow("systemQtyAtCount")),
    at = getLong(getColumnIndexOrThrow("at")),
)
