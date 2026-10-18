package ir.plasco.managing.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * آیکون‌های خانه — همان شکل lucideهایی که نسخهٔ وب دارد (Boxes, Package, Wallet, Tag,
 * TrendingUp, ShoppingBasket, Truck, ArrowLeftRight, PackagePlus, Download) ولی با
 * مسیرهای سادهٔ خودمان روی بوم ۲۴×۲۴ با خط دور ۲، تا نه به material-icons-extended
 * وابسته شویم و نه حجم برنامه بالا برود. رنگ با `Icon(..., tint = ...)` می‌آید.
 */
private fun strokeIcon(name: String, vararg paths: String): ImageVector {
    val builder = ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    )
    for (path in paths) {
        builder.addPath(
            pathData = addPathNodes(path),
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }
    return builder.build()
}

object Glyphs {
    /** چهار مربع — «تعداد کل». */
    val Boxes: ImageVector by lazy {
        strokeIcon(
            "boxes",
            "M4 4h6v6H4z",
            "M14 4h6v6h-6z",
            "M14 14h6v6h-6z",
            "M4 14h6v6H4z",
        )
    }

    /** جعبهٔ سه‌بعدی — «چند نوع کالا». */
    val Package: ImageVector by lazy {
        strokeIcon(
            "package",
            "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
            "M3.27 6.96 12 12.01l8.73-5.05",
            "M12 22.08V12",
        )
    }

    /** کیف پول — «ارزش خرید». */
    val Wallet: ImageVector by lazy {
        strokeIcon(
            "wallet",
            "M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
            "M15 10h6v4h-6a2 2 0 0 1 0-4z",
        )
    }

    /** برچسب — «ارزش فروش». */
    val Tag: ImageVector by lazy {
        strokeIcon(
            "tag",
            "M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.7 8.71a2.43 2.43 0 0 0 3.42 0l6.58-6.59a2.43 2.43 0 0 0 0-3.41z",
            "M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0",
        )
    }

    /** نمودار رو به بالا — «سود تخمینی». */
    val TrendingUp: ImageVector by lazy {
        strokeIcon(
            "trending-up",
            "M22 7l-8.5 8.5-5-5L2 17",
            "M16 7h6v6",
        )
    }

    /** سبد خرید — «ثبت ورود». */
    val Basket: ImageVector by lazy {
        strokeIcon(
            "basket",
            "M2 11h20",
            "M4 11l1.4 8.2A1.5 1.5 0 0 0 6.9 20.5h10.2a1.5 1.5 0 0 0 1.5-1.3L20 11",
            "M8.5 11l2-6",
            "M15.5 11l-2-6",
        )
    }

    /** کامیون — «ثبت خروج». */
    val Truck: ImageVector by lazy {
        strokeIcon(
            "truck",
            "M2 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10H3a1 1 0 0 1-1-1z",
            "M14 9h3.4a1 1 0 0 1 .82.43l2.35 3.45a1 1 0 0 1 .17.55V16a1 1 0 0 1-1 1H14",
            "M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
            "M17.5 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
        )
    }

    /** دو فلش رو‌به‌هم — «انتقال». */
    val Transfer: ImageVector by lazy {
        strokeIcon(
            "transfer",
            "M8 3 4 7l4 4",
            "M4 7h16",
            "M16 21 20 17 16 13",
            "M20 17H4",
        )
    }

    /** جعبه با علامت + — «کالای جدید». */
    val PackagePlus: ImageVector by lazy {
        val builder = ImageVector.Builder(
            name = "package-plus",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        )
        builder.addGroup(scaleX = 0.7f, scaleY = 0.7f, translationY = 5f)
        for (path in listOf(
            "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
            "M3.27 6.96 12 12.01l8.73-5.05",
            "M12 22.08V12",
        )) {
            builder.addPath(
                pathData = addPathNodes(path),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        builder.clearGroup()
        for (path in listOf("M20 3v6", "M17 6h6")) {
            builder.addPath(
                pathData = addPathNodes(path),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        builder.build()
    }

    /** دانلود — بنر بکاپ. */
    val Download: ImageVector by lazy {
        strokeIcon(
            "download",
            "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
            "M7 10l5 5 5-5",
            "M12 3v12",
        )
    }
}
