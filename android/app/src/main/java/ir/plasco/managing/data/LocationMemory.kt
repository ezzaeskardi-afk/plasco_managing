package ir.plasco.managing.data

import android.annotation.SuppressLint
import android.content.Context

/**
 * Remembering the last used location is a per-device UI preference (like the
 * web's `plasco:last-location`), so it lives in SharedPreferences and is not
 * part of a backup.
 */
object LocationMemory {
    private const val PREFS = "plasco"
    private const val KEY = "lastLocationId"

    fun read(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)

    @SuppressLint("UseKtx")
    fun write(context: Context, id: String) {
        if (id.isBlank()) return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, id)
            .apply()
    }
}
