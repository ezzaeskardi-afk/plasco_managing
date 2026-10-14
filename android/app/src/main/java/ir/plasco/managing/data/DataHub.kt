package ir.plasco.managing.data

import ir.plasco.managing.domain.persianCollator
import ir.plasco.managing.model.Brand
import ir.plasco.managing.model.Category
import ir.plasco.managing.model.ID
import ir.plasco.managing.model.Location
import ir.plasco.managing.model.Movement
import ir.plasco.managing.model.Product
import ir.plasco.managing.model.Settings
import ir.plasco.managing.model.StockLevel
import ir.plasco.managing.model.StockTake
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

/**
 * همهٔ داده‌ها یک بار خوانده و در حافظه نگه داشته می‌شوند؛ بعد از هر نوشتن،
 * همان تکه دوباره خوانده می‌شود. برای مغازه‌ای با چند هزار کالا این ساده‌ترین و
 * سریع‌ترین راه است و رفتار «کوئری زنده» نسخهٔ وب را می‌دهد.
 */
class DataHub(private val helper: PlascoDb) {

    private val _products = MutableStateFlow<List<Product>>(emptyList())
    val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _levels = MutableStateFlow<List<StockLevel>>(emptyList())
    val levels: StateFlow<List<StockLevel>> = _levels.asStateFlow()

    private val _movements = MutableStateFlow<List<Movement>>(emptyList())
    val movements: StateFlow<List<Movement>> = _movements.asStateFlow()

    private val _brands = MutableStateFlow<List<Brand>>(emptyList())
    val brands: StateFlow<List<Brand>> = _brands.asStateFlow()

    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _locations = MutableStateFlow<List<Location>>(emptyList())
    val locations: StateFlow<List<Location>> = _locations.asStateFlow()

    private val _settings = MutableStateFlow(Settings())
    val settings: StateFlow<Settings> = _settings.asStateFlow()

    private val _stockTakes = MutableStateFlow<List<StockTake>>(emptyList())
    val stockTakes: StateFlow<List<StockTake>> = _stockTakes.asStateFlow()

    suspend fun reloadAll() = withContext(Dispatchers.IO) {
        val db = helper.readableDatabase
        _brands.value = readBrands(db)
        _categories.value = readCategories(db)
        _locations.value = readLocations(db)
        _products.value = readProducts(db)
        _levels.value = readLevels(db)
        _movements.value = readMovements(db)
        _settings.value = readSettings(db)
        _stockTakes.value = readStockTakes(db)
    }

    suspend fun reloadProducts() = withContext(Dispatchers.IO) {
        _products.value = readProducts(helper.readableDatabase)
    }

    suspend fun reloadStock() = withContext(Dispatchers.IO) {
        val db = helper.readableDatabase
        _levels.value = readLevels(db)
        _movements.value = readMovements(db)
    }

    suspend fun reloadLabels() = withContext(Dispatchers.IO) {
        val db = helper.readableDatabase
        _brands.value = readBrands(db)
        _categories.value = readCategories(db)
        _locations.value = readLocations(db)
    }

    suspend fun reloadSettings() = withContext(Dispatchers.IO) {
        _settings.value = readSettings(helper.readableDatabase)
    }

    suspend fun reloadStockTakes() = withContext(Dispatchers.IO) {
        _stockTakes.value = readStockTakes(helper.readableDatabase)
    }

    private fun readBrands(db: android.database.sqlite.SQLiteDatabase): List<Brand> =
        db.rawQuery("SELECT * FROM brands WHERE deletedAt IS NULL", null).use { cursor ->
            val rows = buildList { while (cursor.moveToNext()) add(cursor.toBrand()) }
            val collator = persianCollator()
            rows.sortedWith { a, b -> collator.compare(a.name, b.name) }
        }

    private fun readCategories(db: android.database.sqlite.SQLiteDatabase): List<Category> =
        db.rawQuery("SELECT * FROM categories WHERE deletedAt IS NULL", null).use { cursor ->
            val rows = buildList { while (cursor.moveToNext()) add(cursor.toCategory()) }
            val collator = persianCollator()
            rows.sortedWith { a, b -> if (a.sort != b.sort) a.sort - b.sort else collator.compare(a.name, b.name) }
        }

    private fun readLocations(db: android.database.sqlite.SQLiteDatabase): List<Location> =
        db.rawQuery("SELECT * FROM locations WHERE deletedAt IS NULL", null).use { cursor ->
            val rows = buildList { while (cursor.moveToNext()) add(cursor.toLocation()) }
            rows.sortedWith(compareBy({ it.sort }, { it.name }))
        }

    private fun readProducts(db: android.database.sqlite.SQLiteDatabase): List<Product> =
        db.rawQuery("SELECT * FROM products WHERE deletedAt IS NULL", null).use { cursor ->
            val rows = buildList { while (cursor.moveToNext()) add(cursor.toProduct()) }
            val collator = persianCollator()
            rows.sortedWith { a, b -> if (a.active != b.active) (if (a.active) -1 else 1) else collator.compare(a.name, b.name) }
        }

    private fun readLevels(db: android.database.sqlite.SQLiteDatabase): List<StockLevel> =
        db.rawQuery("SELECT * FROM stockLevels", null).use { cursor ->
            buildList { while (cursor.moveToNext()) add(cursor.toStockLevel()) }
        }

    private fun readMovements(db: android.database.sqlite.SQLiteDatabase): List<Movement> =
        db.rawQuery("SELECT * FROM movements ORDER BY at DESC LIMIT $MOVEMENT_PAGE", null).use { cursor ->
            buildList { while (cursor.moveToNext()) add(cursor.toMovement()) }
        }

    private fun readSettings(db: android.database.sqlite.SQLiteDatabase): Settings =
        db.rawQuery("SELECT * FROM settings WHERE id = 1", null).use { cursor ->
            if (cursor.moveToFirst()) cursor.toSettings() else Settings()
        }

    private fun readStockTakes(db: android.database.sqlite.SQLiteDatabase): List<StockTake> =
        db.rawQuery("SELECT * FROM stockTakes WHERE deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 20", null).use { cursor ->
            buildList { while (cursor.moveToNext()) add(cursor.toStockTake()) }
        }

    fun productById(id: ID): Product? = _products.value.firstOrNull { it.id == id }

    fun locationName(id: ID): String = _locations.value.firstOrNull { it.id == id }?.name ?: ""

    companion object {
        /** چند حرکت آخر در حافظه نگه داشته می‌شود. */
        const val MOVEMENT_PAGE = 400
    }
}
