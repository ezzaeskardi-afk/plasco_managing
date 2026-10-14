package ir.plasco.managing

import android.app.Application
import ir.plasco.managing.data.AppContainer

class PlascoApp : Application() {

    /** یک نمونهٔ دیتابیس و مخزن برای کل برنامه. */
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
