package ir.plasco.managing.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp
import ir.plasco.managing.model.StockState
import ir.plasco.managing.model.ThemeMode

/** رنگ‌ها از src/styles/tokens.css نسخهٔ وب آمده‌اند (AGENTS.md بخش ۸). */
private val LightColors = lightColorScheme(
    primary = Color(0xFF0B7285),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFD3EBEF),
    onPrimaryContainer = Color(0xFF06222A),
    secondary = Color(0xFF51626E),
    onSecondary = Color(0xFFFFFFFF),
    background = Color(0xFFF1F5F6),
    onBackground = Color(0xFF12202A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF12202A),
    surfaceVariant = Color(0xFFE7EEF1),
    onSurfaceVariant = Color(0xFF51626E),
    outline = Color(0xFF9DB0BB),
    outlineVariant = Color(0xFFDCE4E7),
    error = Color(0xFFC0262D),
    onError = Color(0xFFFFFFFF),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF4DB6C8),
    onPrimary = Color(0xFF06222A),
    primaryContainer = Color(0xFF0B3A44),
    onPrimaryContainer = Color(0xFFD3EBEF),
    secondary = Color(0xFF9DB0BB),
    onSecondary = Color(0xFF0E161B),
    background = Color(0xFF0E161B),
    onBackground = Color(0xFFE7EEF1),
    surface = Color(0xFF151F26),
    onSurface = Color(0xFFE7EEF1),
    surfaceVariant = Color(0xFF26343D),
    onSurfaceVariant = Color(0xFF9DB0BB),
    outline = Color(0xFF51626E),
    outlineVariant = Color(0xFF26343D),
    error = Color(0xFFF2777C),
    onError = Color(0xFF40191B),
)

private val PlascoTypography = Typography(
    headlineMedium = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold, lineHeight = 34.sp),
    titleLarge = TextStyle(fontSize = 21.sp, fontWeight = FontWeight.Bold, lineHeight = 30.sp),
    titleMedium = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Bold, lineHeight = 27.sp),
    bodyLarge = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.Medium, lineHeight = 29.sp),
    bodyMedium = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Medium, lineHeight = 26.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium, lineHeight = 22.sp),
    labelMedium = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium, lineHeight = 20.sp),
)

/** رنگ میله‌های پشتهٔ موجودی. هرگز تنها حامل معنا نیست؛ عدد همیشه کنارش است. */
@Composable
fun toneColor(state: StockState): Color {
    val dark = isSystemInDarkTheme()
    return when (state) {
        StockState.Ok -> if (dark) Color(0xFF9DB0BB) else Color(0xFF51626E)
        StockState.Low -> if (dark) Color(0xFFF0A04B) else Color(0xFFB45309)
        StockState.Out -> if (dark) Color(0xFFF2777C) else Color(0xFFC0262D)
    }
}

@Composable
fun PlascoTheme(
    mode: ThemeMode = ThemeMode.System,
    textScale: Float = 1f,
    content: @Composable () -> Unit,
) {
    val dark = when (mode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    val density = LocalDensity.current
    val scale = if (textScale > 0f) textScale else 1f
    CompositionLocalProvider(
        LocalDensity provides Density(density.density, density.fontScale * scale),
    ) {
        MaterialTheme(
            colorScheme = if (dark) DarkColors else LightColors,
            typography = PlascoTypography,
            content = content,
        )
    }
}
