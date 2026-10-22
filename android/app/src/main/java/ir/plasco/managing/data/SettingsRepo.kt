package ir.plasco.managing.data

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import ir.plasco.managing.model.Settings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** تنظیمات یک ردیف دارد (id = 1)؛ همان کلید/مقدار نسخهٔ وب، این بار ستون‌بندی‌شده. */
class SettingsRepo(private val helper: PlascoDb, private val hub: DataHub) {

    suspend fun update(transform: (Settings) -> Settings): Settings {
        inTransaction { db ->
            // Read inside the transaction so two screens saving at the same time
            // cannot overwrite each other with a stale copy of the whole row.
            val current = db.rawQuery("SELECT * FROM settings WHERE id = 1", null).use { cursor ->
                if (cursor.moveToFirst()) cursor.toSettings() else error("SettingsMissing")
            }
            val next = transform(current)
            db.update(
                "settings",
                ContentValues().apply {
                    put("shopName", next.shopName)
                    put("currencyLabel", next.currencyLabel)
                    put("textScale", next.textScale)
                    put("theme", next.theme.wire)
                    put("nextProductNo", next.nextProductNo)
                    put("lastBackupAt", next.lastBackupAt)
                    put("costLockEnabled", if (next.costLockEnabled) 1 else 0)
                    put("deviceName", next.deviceName)
                    put("devicePrefix", next.devicePrefix)
                },
                "id = 1",
                null,
            )
        }
        hub.reloadSettings()
        return hub.settings.value
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
