package ir.plasco.managing.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp
import ir.plasco.managing.R
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

// فونت وزیرمتن (نسخهٔ ۳۳٫۰۰۳، همان نسخهٔ وب) همراه خود برنامه است؛ چهار وزنِ ثابت
// (Regular/Medium/Bold/ExtraBold) به‌اندازهٔ همان وزن‌هایی که رابط استفاده می‌کند.
// مجوز SIL OFL در android/Vazirmatn-OFL.txt نگه داشته می‌شود.
private val Vazirmatn = FontFamily(
    Font(R.font.vazirmatn_regular, FontWeight.Normal),
    Font(R.font.vazirmatn_medium, FontWeight.Medium),
    Font(R.font.vazirmatn_bold, FontWeight.Bold),
    Font(R.font.vazirmatn_extrabold, FontWeight.ExtraBold),
)

private val PlascoTypography = Typography().let { base ->
    Typography(
        displayLarge = base.displayLarge.copy(fontFamily = Vazirmatn),
        displayMedium = base.displayMedium.copy(fontFamily = Vazirmatn),
        displaySmall = base.displaySmall.copy(fontFamily = Vazirmatn),
        headlineLarge = base.headlineLarge.copy(fontFamily = Vazirmatn),
        headlineMedium = base.headlineMedium.copy(
            fontFamily = Vazirmatn, fontSize = 24.sp, fontWeight = FontWeight.Bold, lineHeight = 34.sp,
        ),
        headlineSmall = base.headlineSmall.copy(fontFamily = Vazirmatn),
        titleLarge = base.titleLarge.copy(
            fontFamily = Vazirmatn, fontSize = 21.sp, fontWeight = FontWeight.Bold, lineHeight = 30.sp,
        ),
        titleMedium = base.titleMedium.copy(
            fontFamily = Vazirmatn, fontSize = 18.sp, fontWeight = FontWeight.Bold, lineHeight = 27.sp,
        ),
        titleSmall = base.titleSmall.copy(fontFamily = Vazirmatn),
        bodyLarge = base.bodyLarge.copy(
            fontFamily = Vazirmatn, fontSize = 17.sp, fontWeight = FontWeight.Medium, lineHeight = 29.sp,
        ),
        bodyMedium = base.bodyMedium.copy(
            fontFamily = Vazirmatn, fontSize = 15.sp, fontWeight = FontWeight.Medium, lineHeight = 26.sp,
        ),
        bodySmall = base.bodySmall.copy(fontFamily = Vazirmatn),
        labelLarge = base.labelLarge.copy(
            fontFamily = Vazirmatn, fontSize = 14.sp, fontWeight = FontWeight.Medium, lineHeight = 22.sp,
        ),
        labelMedium = base.labelMedium.copy(
            fontFamily = Vazirmatn, fontSize = 13.sp, fontWeight = FontWeight.Medium, lineHeight = 20.sp,
        ),
        labelSmall = base.labelSmall.copy(fontFamily = Vazirmatn),
    )
}

/** رنگ میله‌های پشتهٔ موجودی. هرگز تنها حامل معنا نیست؛ عدد همیشه کنارش است. */
@Composable
fun toneColor(state: StockState): Color {
    // تمِ خودِ برنامه ملاک است (مطابق گوشی / روشن / تیره)، نه فقط تنظیم سیستم؛
    // وگرنه با تم دستی روشن روی گوشیِ تیره، پالت اشتباه و کم‌کنتراست می‌شد.
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
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
        // متن‌هایی که استایل خودشان را نمی‌دهند هم وزیرمتن بگیرند.
        LocalTextStyle provides LocalTextStyle.current.copy(fontFamily = Vazirmatn),
    ) {
        MaterialTheme(
            colorScheme = if (dark) DarkColors else LightColors,
            typography = PlascoTypography,
            content = content,
        )
    }
}
