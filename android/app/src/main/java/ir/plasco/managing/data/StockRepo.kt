package ir.plasco.managing.data

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import ir.plasco.managing.model.ID
import ir.plasco.managing.model.Movement
import ir.plasco.managing.model.MovementType
import ir.plasco.managing.model.StockLevel
import ir.plasco.managing.model.StockTake
import ir.plasco.managing.model.StockTakeItem
import ir.plasco.managing.model.StockTakeStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.abs

/** حرکت می‌خواهد موجودی یک مکان را منفی کند. */
class InsufficientStockException(
    val productId: ID,
    val locationId: ID,
    val available: Int,
    val requested: Int,
) : Exception("InsufficientStock")

class AlreadyUndoneException(val movementId: ID) : Exception("AlreadyUndone")

class MovementNotFoundException(val movementId: ID) : Exception("MovementNotFound")

class MovementQtyMustBeNonZero : Exception("MovementQtyMustBeNonZero")

data class MovementInput(
    val productId: ID,
    val locationId: ID,
    val type: MovementType,
    /** تعداد علامت‌دار: ورود مثبت، خروج منفی. */
    val qty: Int,
    val unitCost: Int? = null,
    val unitPrice: Int? = null,
    val refId: ID? = null,
    val undoOf: ID? = null,
    val note: String? = null,
    val at: Long? = null,
)

/**
 * قانون طلایی نسخهٔ وب (AGENTS.md بخش ۶): تنها نویسندهٔ `stockLevels` همین‌جاست و
 * `rebuildLevels()`. حرکات فقط اضافه می‌شوند و اصلاح = حرکت جبرانی.
 */
class StockRepo(private val helper: PlascoDb, private val hub: DataHub) {

    suspend fun apply(input: MovementInput): Movement {
        val movement = inTransaction { db -> writeMovement(db, input) }
        hub.reloadStock()
        return movement
    }

    suspend fun transfer(
        productId: ID,
        fromLocationId: ID,
        toLocationId: ID,
        qty: Int,
        note: String? = null,
    ): Pair<Movement, Movement> {
        if (fromLocationId == toLocationId) throw IllegalArgumentException("TransferSameLocation")
        val pieces = abs(qty)
        if (pieces == 0) throw MovementQtyMustBeNonZero()
        val refId = newId()
        val result = inTransaction { db ->
            val outgoing = writeMovement(
                db,
                MovementInput(productId, fromLocationId, MovementType.TransferOut, -pieces, refId = refId, note = note),
            )
            val incoming = writeMovement(
                db,
                MovementInput(productId, toLocationId, MovementType.TransferIn, pieces, refId = refId, note = note),
            )
            outgoing to incoming
        }
        hub.reloadStock()
        return result
    }

    /** حرکت جبرانی. دو بار نمی‌شود و واگرد خودش هم واگرد نمی‌شود. */
    suspend fun undo(movementId: ID): Movement {
        val result = inTransaction { db -> undoInside(db, movementId) }
        hub.reloadStock()
        return result
    }

    /** بازسازی کامل کش موجودی از روی حرکات (قفسه‌ها حفظ می‌شوند). */
    suspend fun rebuildLevels(): Int {
        val count = inTransaction { db -> rebuildLevelsInTransaction(db) }
        hub.reloadStock()
        return count
    }

    /**
     * انبارگردانی: اختلاف در لحظهٔ اعمال حساب می‌شود و برای هر اختلاف یک حرکت
     * `count` نوشته می‌شود. همه در یک تراکنش؛ یا همه یا هیچ.
     */
    suspend fun applyStockTake(locationId: ID, counts: Map<ID, Int>, note: String? = null): StockTake {
        val now = System.currentTimeMillis()
        val take = inTransaction { db ->
            val id = newId()
            db.insertOrThrow(
                "stockTakes",
                null,
                ContentValues().apply {
                    put("id", id)
                    put("locationId", locationId)
                    put("status", StockTakeStatus.Open.wire)
                    put("appliedAt", null as Long?)
                    put("note", note)
                    put("createdAt", now)
                    put("updatedAt", now)
                    put("deletedAt", null as Long?)
                },
            )
            for ((productId, counted) in counts) {
                val current = currentQty(db, productId, locationId)
                db.insertOrThrow(
                    "stockTakeItems",
                    null,
                    ContentValues().apply {
                        put("id", newId())
                        put("stockTakeId", id)
                        put("productId", productId)
                        put("counted", counted)
                        put("systemQtyAtCount", current)
                        put("at", now)
                    },
                )
                val delta = counted - current
                if (delta != 0) {
                    writeMovement(db, MovementInput(productId, locationId, MovementType.Count, delta, refId = id))
                }
            }
            db.update(
                "stockTakes",
                ContentValues().apply {
                    put("status", StockTakeStatus.Applied.wire)
                    put("appliedAt", now)
                    put("updatedAt", now)
                },
                "id = ?",
                arrayOf(id),
            )
            StockTake(id, locationId, StockTakeStatus.Applied, now, note, now, now, null)
        }
        hub.reloadStock()
        hub.reloadStockTakes()
        return take
    }

    /** برگرداندن یک انبارگردانی اعمال‌شده: اختلافی که اعمال شد، جبران می‌شود. */
    suspend fun revertStockTake(stockTakeId: ID): StockTake {
        val result = inTransaction { db ->
            val take = stockTakeById(db, stockTakeId) ?: throw IllegalArgumentException("StockTakeNotFound")
            if (take.status != StockTakeStatus.Applied) throw IllegalStateException("StockTakeNotApplied")
            for (item in itemsInside(db, stockTakeId)) {
                val delta = item.counted - item.systemQtyAtCount
                if (delta != 0) {
                    writeMovement(
                        db,
                        MovementInput(item.productId, take.locationId, MovementType.Count, -delta, refId = take.id),
                    )
                }
            }
            val now = System.currentTimeMillis()
            db.update(
                "stockTakes",
                ContentValues().apply {
                    put("status", StockTakeStatus.Cancelled.wire)
                    put("appliedAt", null as Long?)
                    put("updatedAt", now)
                },
                "id = ?",
                arrayOf(stockTakeId),
            )
            take.copy(status = StockTakeStatus.Cancelled, appliedAt = null, updatedAt = now)
        }
        hub.reloadStock()
        hub.reloadStockTakes()
        return result
    }

    suspend fun itemsOf(stockTakeId: ID): List<StockTakeItem> = withContext(Dispatchers.IO) {
        itemsInside(helper.readableDatabase, stockTakeId)
    }

    suspend fun levelsOf(productId: ID): List<StockLevel> = withContext(Dispatchers.IO) {
        helper.readableDatabase
            .rawQuery("SELECT * FROM stockLevels WHERE productId = ?", arrayOf(productId))
            .use { cursor -> buildList { while (cursor.moveToNext()) add(cursor.toStockLevel()) } }
    }

    // --- درون تراکنش (بازیابی بکاپ هم از همین دو تابع استفاده می‌کند) ---

    /** تنها نویسندهٔ `stockLevels` همراه با `rebuildLevelsInTransaction`. */
    internal fun writeMovementInTransaction(db: SQLiteDatabase, input: MovementInput): Movement =
        writeMovement(db, input)

    private fun writeMovement(db: SQLiteDatabase, input: MovementInput): Movement {
        if (input.qty == 0) throw MovementQtyMustBeNonZero()
        val now = input.at ?: System.currentTimeMillis()
        val movement = Movement(
            id = newId(),
            productId = input.productId,
            locationId = input.locationId,
            type = input.type,
            qty = input.qty,
            unitCost = input.unitCost,
            unitPrice = input.unitPrice,
            refId = input.refId,
            undoOf = input.undoOf,
            note = input.note,
            at = now,
            createdAt = now,
            updatedAt = now,
        )
        val existing = levelRow(db, input.productId, input.locationId)
        val current = existing?.qty ?: 0
        val next = current + input.qty
        if (next < 0) throw InsufficientStockException(input.productId, input.locationId, current, input.qty)

        db.insertOrThrow(
            "movements",
            null,
            ContentValues().apply {
                put("id", movement.id)
                put("productId", movement.productId)
                put("locationId", movement.locationId)
                put("type", movement.type.wire)
                put("qty", movement.qty)
                put("unitCost", movement.unitCost)
                put("unitPrice", movement.unitPrice)
                put("refId", movement.refId)
                put("undoOf", movement.undoOf)
                put("note", movement.note)
                put("at", movement.at)
                put("createdAt", movement.createdAt)
                put("updatedAt", movement.updatedAt)
            },
        )
        db.insertWithOnConflict(
            "stockLevels",
            null,
            ContentValues().apply {
                put("productId", input.productId)
                put("locationId", input.locationId)
                put("qty", next)
                put("bin", existing?.bin)
                put("updatedAt", now)
            },
            SQLiteDatabase.CONFLICT_REPLACE,
        )
        return movement
    }

    private fun undoInside(db: SQLiteDatabase, movementId: ID): Movement {
        val movement = movementById(db, movementId) ?: throw MovementNotFoundException(movementId)
        if (movement.undoOf != null) throw AlreadyUndoneException(movementId)
        if (hasUndo(db, movementId)) throw AlreadyUndoneException(movementId)

        // واگرد یک ساق انتقال، جفتش را هم واگرد می‌کند.
        if (movement.type == MovementType.TransferOut || movement.type == MovementType.TransferIn) {
            val partnerType = if (movement.type == MovementType.TransferOut) MovementType.TransferIn else MovementType.TransferOut
            val partner = movement.refId?.let { refId -> movementByRef(db, refId, partnerType, movement.id) }
            if (partner != null) {
                if (hasUndo(db, partner.id)) throw AlreadyUndoneException(partner.id)
                writeMovement(db, compensating(partner))
            }
        }
        return writeMovement(db, compensating(movement))
    }

    private fun compensating(movement: Movement): MovementInput = MovementInput(
        productId = movement.productId,
        locationId = movement.locationId,
        type = when (movement.type) {
            MovementType.TransferIn -> MovementType.TransferOut
            MovementType.TransferOut -> MovementType.TransferIn
            else -> movement.type
        },
        qty = -movement.qty,
        refId = movement.refId,
        undoOf = movement.id,
        note = movement.note,
    )

    internal fun rebuildLevelsInTransaction(db: SQLiteDatabase): Int {
        val bins = HashMap<Pair<ID, ID>, String?>()
        db.rawQuery("SELECT productId, locationId, bin FROM stockLevels", null).use { cursor ->
            while (cursor.moveToNext()) {
                bins[cursor.text("productId") to cursor.text("locationId")] = cursor.optText("bin")
            }
        }
        db.delete("stockLevels", null, null)

        val totals = LinkedHashMap<Pair<ID, ID>, Int>()
        db.rawQuery("SELECT productId, locationId, qty FROM movements ORDER BY at ASC, createdAt ASC", null).use { cursor ->
            while (cursor.moveToNext()) {
                val key = cursor.text("productId") to cursor.text("locationId")
                val qty = cursor.getInt(cursor.getColumnIndexOrThrow("qty"))
                totals[key] = (totals[key] ?: 0) + qty
            }
        }
        val now = System.currentTimeMillis()
        for ((key, qty) in totals) {
            db.insertWithOnConflict(
                "stockLevels",
                null,
                ContentValues().apply {
                    put("productId", key.first)
                    put("locationId", key.second)
                    put("qty", qty)
                    put("bin", bins[key])
                    put("updatedAt", now)
                },
                SQLiteDatabase.CONFLICT_REPLACE,
            )
        }
        return totals.size
    }

    private fun levelRow(db: SQLiteDatabase, productId: ID, locationId: ID): StockLevel? =
        db.rawQuery(
            "SELECT * FROM stockLevels WHERE productId = ? AND locationId = ?",
            arrayOf(productId, locationId),
        ).use { cursor -> if (cursor.moveToFirst()) cursor.toStockLevel() else null }

    private fun currentQty(db: SQLiteDatabase, productId: ID, locationId: ID): Int =
        levelRow(db, productId, locationId)?.qty ?: 0

    private fun movementById(db: SQLiteDatabase, id: ID): Movement? =
        db.rawQuery("SELECT * FROM movements WHERE id = ?", arrayOf(id)).use { cursor ->
            if (cursor.moveToFirst()) cursor.toMovement() else null
        }

    private fun movementByRef(db: SQLiteDatabase, refId: ID, type: MovementType, excludeId: ID): Movement? =
        db.rawQuery(
            "SELECT * FROM movements WHERE refId = ? AND type = ? AND id <> ? LIMIT 1",
            arrayOf(refId, type.wire, excludeId),
        ).use { cursor -> if (cursor.moveToFirst()) cursor.toMovement() else null }

    private fun hasUndo(db: SQLiteDatabase, movementId: ID): Boolean =
        db.rawQuery("SELECT 1 FROM movements WHERE undoOf = ? LIMIT 1", arrayOf(movementId)).use { it.moveToFirst() }

    private fun stockTakeById(db: SQLiteDatabase, id: ID): StockTake? =
        db.rawQuery("SELECT * FROM stockTakes WHERE id = ?", arrayOf(id)).use { cursor ->
            if (cursor.moveToFirst()) cursor.toStockTake() else null
        }

    private fun itemsInside(db: SQLiteDatabase, stockTakeId: ID): List<StockTakeItem> =
        db.rawQuery("SELECT * FROM stockTakeItems WHERE stockTakeId = ?", arrayOf(stockTakeId)).use { cursor ->
            buildList { while (cursor.moveToNext()) add(cursor.toStockTakeItem()) }
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
