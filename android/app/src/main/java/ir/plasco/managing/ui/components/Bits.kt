package ir.plasco.managing.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ir.plasco.managing.domain.displayProductName
import ir.plasco.managing.domain.formatCompact
import ir.plasco.managing.domain.formatMoney
import ir.plasco.managing.domain.formatNumber
import ir.plasco.managing.domain.stackLevel
import ir.plasco.managing.domain.stockState
import ir.plasco.managing.model.MovementType
import ir.plasco.managing.model.Product
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.theme.toneColor

/** سطح آرام برای فرم‌ها و فهرست‌ها؛ بدون سایه. */
@Composable
fun Panel(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
            .padding(12.dp),
        content = content,
    )
}

@Composable
fun SectionTitle(title: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        action?.invoke()
    }
}

/** عدد درشت؛ با یک لمس بین جمع‌وجور و کامل عوض می‌شود. با `locked` جای عدد «•••» می‌آید (قفل قیمت). */
@Composable
fun KpiBlock(
    label: String,
    value: Long,
    modifier: Modifier = Modifier,
    locked: Boolean = false,
    icon: ImageVector? = null,
) {
    var full by remember { mutableStateOf(false) }
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = !locked) { full = !full }
            .padding(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(6.dp))
            }
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(
            text = when {
                locked -> Fa.common.lockedValue
                full -> formatNumber(value)
                else -> formatCompact(value)
            },
            fontSize = 28.sp,
            fontWeight = FontWeight.ExtraBold,
            color = if (locked) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** نشانهٔ امضای برنامه: تا چهار میلهٔ پشته‌شده کنار عدد. */
@Composable
fun StockStack(total: Int, minStock: Int?, modifier: Modifier = Modifier) {
    val level = stackLevel(total, minStock)
    val color = toneColor(stockState(total, minStock))
    Column(
        modifier = modifier.width(20.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for (index in 0 until 4) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(1f - index * 0.16f)
                    .height(3.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(if (index < level) color else MaterialTheme.colorScheme.outlineVariant),
            )
        }
    }
}

/**
 * چیپ‌های فیلتر. روی صفحهٔ باریک به خط بعد می‌روند تا هیچ گزینه‌ای بیرون از کادر نماند
 * (صفحهٔ ثبت حرکت هفت گزینه دارد و در ۳۶۰ پیکسل جا نمی‌شود).
 */
@Composable
fun ChipRow(
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        options.forEach { (value, label) ->
            FilterChip(
                selected = value == selected,
                onClick = { onSelect(value) },
                label = { Text(label) },
            )
        }
    }
}

@Composable
fun EmptyState(text: String, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Column(modifier = Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(8.dp))
            Button(onClick = onAction) { Text(actionLabel) }
        }
    }
}

/** یک ردیف کالا: نام، برند · کد، تعداد و پشته. */
@Composable
fun ProductRow(
    product: Product,
    total: Int,
    brandName: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProductThumb(productId = product.id, name = displayProductName(product.name))
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                displayProductName(product.name),
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                listOfNotNull(brandName, product.code).joinToString(" · "),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(formatNumber(total), fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Spacer(Modifier.width(8.dp))
        StockStack(total = total, minStock = product.minStock)
    }
}

/** سرصفحهٔ صفحه: عنوان، زیرنویس و دکمهٔ برگشت. */
@Composable
fun ScreenHeader(
    title: String,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    action: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack) {
                // نسخهٔ AutoMirrored در حالت راست‌چین خودش به راست اشاره می‌کند.
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "برگشت")
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            if (!subtitle.isNullOrEmpty()) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        action?.invoke()
    }
}

/** نام فارسی هر نوع حرکت. */
fun movementLabel(type: MovementType): String = when (type) {
    MovementType.Initial -> "موجودی اولیه"
    MovementType.Receive -> "ورود"
    MovementType.Sale -> "خروج"
    MovementType.ReturnIn -> "برگشت از مشتری"
    MovementType.ReturnOut -> "برگشت به فروشنده"
    MovementType.Adjust -> "تعدیل"
    MovementType.Count -> "شمارش"
    MovementType.TransferOut -> "انتقال از"
    MovementType.TransferIn -> "انتقال به"
    MovementType.Damage -> "خرابی"
}

/**
 * رنگ عدد حرکت — درست مثل نسخهٔ وب (`features/stock/labels.ts`) با **علامت تعداد**
 * تعیین می‌شود: ورود سبز، خروج قرمز، صفر بی‌رنگ. قبلاً بر اساس نوع محاسبه می‌شد و
 * «برگشت به فروشنده»، «موجودی اولیه» و تعدیل/شمارش با اختلاف مثبت رنگ درست نمی‌گرفتند.
 */
@Composable
fun movementTone(qty: Int): Color {
    return when {
        qty > 0 -> toneColor(ir.plasco.managing.model.StockState.Ok)
        qty < 0 -> toneColor(ir.plasco.managing.model.StockState.Out)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

/** قاب فهرست‌ها (مثل نسخهٔ وب): کادر گرد بدون پدینگ داخلی تا ردیف‌ها خودشان پدینگ بدهند. */
@Composable
fun ListPanel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)),
        content = content,
    )
}

/** ردیف فشردهٔ هشدار موجودی (کم‌موجود/ناموجود): نام و کد، عدد درشت و پشته — بدون عکس. */
@Composable
fun AlertRow(product: Product, total: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                displayProductName(product.name),
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                product.code,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(formatNumber(total.toLong()), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.width(8.dp))
        StockStack(total = total, minStock = product.minStock)
    }
}

/** کاشی کارهای سریع خانه — همان چهار کاشی نسخهٔ وب. */
@Composable
fun QuickActionTile(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .heightIn(min = 84.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            textAlign = TextAlign.Center,
            maxLines = 2,
        )
    }
}

/** یک ردیف تفکیک (مکان/برند/دسته) مثل نسخهٔ وب: نام، تعداد، نوار سهم و ارزش فروش. */
@Composable
fun BreakdownRow(
    label: String,
    pieces: Int,
    retail: Long?,
    maxRetail: Long,
    currencyLabel: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "${formatNumber(pieces.toLong())} ${Fa.movements.pieces}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(6.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(MaterialTheme.colorScheme.outlineVariant),
            ) {
                val fraction = (retail ?: 0L).toFloat() / maxOf(maxRetail, 1L).toFloat()
                Box(
                    modifier = Modifier
                        .fillMaxWidth(fraction.coerceIn(0.04f, 1f))
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(MaterialTheme.colorScheme.primary),
                )
            }
            if (retail != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    formatMoney(retail.toInt(), currencyLabel),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        Icon(
            Icons.Filled.KeyboardArrowLeft,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
