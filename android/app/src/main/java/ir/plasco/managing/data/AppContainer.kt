package ir.plasco.managing.data

import android.content.Context

/**
 * همهٔ سرویس‌های برنامه در یک جا. عمداً بدون کتابخانهٔ تزریق وابستگی:
 * برنامهٔ یک‌نفره، ساختار ساده‌تر بهتر است.
 */
class AppContainer(context: Context) {
    val db: PlascoDb = PlascoDb(context.applicationContext)
    val hub: DataHub = DataHub(db)
    val stock: StockRepo = StockRepo(db, hub)
    val products: ProductRepo = ProductRepo(db, hub, stock)
    val labels: LabelRepo = LabelRepo(db, hub)
    val settings: SettingsRepo = SettingsRepo(db, hub)
    val backup: BackupRepo = BackupRepo(db, hub, settings, stock)

    /** یک بار در شروع برنامه؛ جدول‌ها ساخته و همه‌چیز خوانده می‌شود. */
    suspend fun boot() {
        hub.reloadAll()
    }
}
