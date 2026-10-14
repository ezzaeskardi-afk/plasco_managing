package ir.plasco.managing

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.platform.LocalLayoutDirection
import ir.plasco.managing.ui.AppRoot

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as PlascoApp).container
        setContent {
            // کل برنامه راست‌چین است؛ حتی اگر گوشی زبانش راست‌چین نباشد.
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                AppRoot(container = container)
            }
        }
    }
}
