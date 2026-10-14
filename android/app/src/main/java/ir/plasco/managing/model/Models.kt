package ir.plasco.managing.model

/**
 * همان مدل دادهٔ نسخهٔ وب (AGENTS.md بخش ۵). پول و تعداد همیشه عدد صحیح‌اند؛
 * پول در واحد تومان و تعداد در «عدد» ذخیره می‌شود.
 */
typealias ID = String

enum class MovementType(val wire: String) {
    Initial("initial"),
    Receive("receive"),
    Sale("sale"),
    ReturnIn("return_in"),
    ReturnOut("return_out"),
    Adjust("adjust"),
    Count("count"),
    TransferOut("transfer_out"),
    TransferIn("transfer_in"),
    Damage("damage");

    /** ورودی مثبت و خروجی منفی است؛ انتقال هم دو ساق دارد. */
    val isOutgoing: Boolean
        get() = this == Sale || this == ReturnOut || this == TransferOut || this == Damage

    companion object {
        fun fromWire(wire: String): MovementType =
            entries.firstOrNull { it.wire == wire } ?: Adjust
    }
}

data class Brand(
    val id: ID,
    val name: String,
    val nameN: String,
    val phone: String? = null,
    val repName: String? = null,
    val note: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long? = null,
)

data class Category(
    val id: ID,
    val name: String,
    val nameN: String,
    val sort: Int = 0,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long? = null,
)

data class Location(
    val id: ID,
    val name: String,
    val sort: Int = 0,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long? = null,
)

data class Product(
    val id: ID,
    val code: String,
    val name: String,
    /** نسخهٔ وب این دو را در فرم ندارد، ولی ردیف‌های قدیمی نگه داشته می‌شوند. */
    val variant: String? = null,
    val family: String? = null,
    val nameN: String,
    val brandId: ID? = null,
    val categoryId: ID? = null,
    val barcodes: List<String> = emptyList(),
    val packLabel: String = "عدد",
    val packSize: Int = 1,
    val buyPrice: Int = 0,
    val retailPrice: Int = 0,
    val wholesalePrice: Int? = null,
    val minStock: Int? = null,
    val note: String? = null,
    val active: Boolean = true,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long? = null,
)

data class StockLevel(
    val productId: ID,
    val locationId: ID,
    val qty: Int,
    val bin: String? = null,
    val updatedAt: Long,
)

data class Movement(
    val id: ID,
    val productId: ID,
    val locationId: ID,
    val type: MovementType,
    val qty: Int,
    val unitCost: Int? = null,
    val unitPrice: Int? = null,
    val refId: ID? = null,
    val undoOf: ID? = null,
    val note: String? = null,
    val at: Long,
    val createdAt: Long,
    val updatedAt: Long,
)

data class PriceChange(
    val id: ID,
    val productId: ID,
    val field: PriceField,
    val oldValue: Int,
    val newValue: Int,
    val at: Long,
    val reason: String? = null,
)

enum class PriceField(val wire: String) {
    Buy("buy"),
    Retail("retail"),
    Wholesale("wholesale"),
}

enum class ThemeMode(val wire: String) {
    System("system"),
    Light("light"),
    Dark("dark"),
}

data class Settings(
    val shopName: String = "پلاسکو منیجینگ",
    val currencyLabel: String = "تومان",
    val textScale: Float = 1f,
    val theme: ThemeMode = ThemeMode.System,
    val nextProductNo: Int = 1,
    val lastBackupAt: Long? = null,
    val costLockEnabled: Boolean = false,
    val deviceName: String = "",
    val devicePrefix: String = "",
)

enum class StockState { Ok, Low, Out }

enum class StockTakeStatus(val wire: String) {
    Open("open"),
    Applied("applied"),
    Cancelled("cancelled");

    companion object {
        fun fromWire(wire: String): StockTakeStatus = entries.firstOrNull { it.wire == wire } ?: Open
    }
}

data class StockTake(
    val id: ID,
    val locationId: ID,
    val status: StockTakeStatus,
    val appliedAt: Long? = null,
    val note: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long? = null,
)

data class StockTakeItem(
    val id: ID,
    val stockTakeId: ID,
    val productId: ID,
    val counted: Int,
    val systemQtyAtCount: Int,
    val at: Long,
)
