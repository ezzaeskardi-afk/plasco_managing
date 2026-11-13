package ir.plasco.managing.data

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import ir.plasco.managing.domain.normalizeFa
import ir.plasco.managing.model.Brand
import ir.plasco.managing.model.Category
import ir.plasco.managing.model.ID
import ir.plasco.managing.model.Location
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** مکان هنوز موجودی دارد؛ مثل نسخهٔ وب تا خالی نشود پنهان نمی‌شود. */
class LocationHasStockException(val qty: Long) : Exception("LocationHasStock")

/** برندها، دسته‌ها و مکان‌ها — همان سه فهرست سادهٔ نسخهٔ وب. */
class LabelRepo(private val helper: PlascoDb, private val hub: DataHub) {

    suspend fun addBrand(name: String, phone: String? = null, repName: String? = null): Brand {
        val now = System.currentTimeMillis()
        val brand = Brand(newId(), name.trim(), normalizeFa(name), phone, repName, null, now, now)
        inTransaction { db ->
            db.insertOrThrow(
                "brands",
                null,
                ContentValues().apply {
                    put("id", brand.id)
                    put("name", brand.name)
                    put("nameN", brand.nameN)
                    put("phone", brand.phone)
                    put("repName", brand.repName)
                    put("note", brand.note)
                    put("createdAt", now)
                    put("updatedAt", now)
                },
            )
        }
        hub.reloadLabels()
        return brand
    }

    suspend fun addCategory(name: String): Category {
        val now = System.currentTimeMillis()
        val sort = hub.categories.value.size + 1
        val category = Category(newId(), name.trim(), normalizeFa(name), sort, now, now)
        inTransaction { db ->
            db.insertOrThrow(
                "categories",
                null,
                ContentValues().apply {
                    put("id", category.id)
                    put("name", category.name)
                    put("nameN", category.nameN)
                    put("sort", category.sort)
                    put("createdAt", now)
                    put("updatedAt", now)
                },
            )
        }
        hub.reloadLabels()
        return category
    }

    suspend fun addLocation(name: String): Location {
        val now = System.currentTimeMillis()
        val sort = hub.locations.value.size + 1
        val location = Location(newId(), name.trim(), sort, now, now)
        inTransaction { db ->
            db.insertOrThrow(
                "locations",
                null,
                ContentValues().apply {
                    put("id", location.id)
                    put("name", location.name)
                    put("sort", location.sort)
                    put("createdAt", now)
                    put("updatedAt", now)
                },
            )
        }
        hub.reloadLabels()
        return location
    }

    suspend fun removeBrand(id: ID) = softDelete("brands", id).also { hub.reloadLabels() }

    suspend fun removeCategory(id: ID) = softDelete("categories", id).also { hub.reloadLabels() }

    /**
     * مکانِ هنوز دارای موجودی پنهان نمی‌شود (همان `LocationHasStockError` وب):
     * وگرنه عدد از جمع‌ها بیرون می‌افتد و قفسه از همهٔ فهرست‌ها ناپدید می‌شود.
     * بررسی و حذف در یک تراکنش انجام می‌شود.
     */
    suspend fun removeLocation(id: ID) {
        inTransaction { db ->
            val held = db.rawQuery(
                "SELECT COALESCE(SUM(ABS(qty)), 0) FROM stockLevels WHERE locationId = ?",
                arrayOf(id),
            ).use { cursor -> if (cursor.moveToFirst()) cursor.getLong(0) else 0L }
            if (held > 0L) throw LocationHasStockException(held)
            val now = System.currentTimeMillis()
            db.update(
                "locations",
                ContentValues().apply {
                    put("deletedAt", now)
                    put("updatedAt", now)
                },
                "id = ?",
                arrayOf(id),
            )
        }
        hub.reloadLabels()
    }

    private suspend fun softDelete(table: String, id: ID) {
        inTransaction { db ->
            val now = System.currentTimeMillis()
            db.update(
                table,
                ContentValues().apply {
                    put("deletedAt", now)
                    put("updatedAt", now)
                },
                "id = ?",
                arrayOf(id),
            )
        }
    }

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
}
