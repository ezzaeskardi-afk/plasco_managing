package ir.plasco.managing.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import ir.plasco.managing.domain.formatJalali
import ir.plasco.managing.domain.formatNumber
import ir.plasco.managing.domain.formatTime
import ir.plasco.managing.model.Movement
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.LocalShowMessage
import ir.plasco.managing.ui.screens.messageFor
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * یک ردیف حرکت — همان چیزی که نسخهٔ وب در `features/stock/MovementRow.tsx` دارد:
 * خط اول «نوع · کالا»، خط دوم تاریخ · ساعت · مکان · توضیح (و «واگردشده»)، عدد رنگی
 * با علامت، و دکمهٔ واگرد. خانه (حرکات اخیر) و صفحهٔ حرکات هر دو از همین استفاده
 * می‌کنند تا دو شکل متفاوت نداشته باشیم.
 */
@Composable
fun MovementRow(
    movement: Movement,
    productName: String?,
    locationName: String?,
    modifier: Modifier = Modifier,
    showUndo: Boolean = true,
    alreadyUndone: Boolean = false,
    onOpenProduct: (() -> Unit)? = null,
) {
    val container = LocalAppContainer.current
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }

    val meta = buildList {
        add(formatJalali(movement.at) + " · " + formatTime(movement.at))
        locationName?.takeIf { it.isNotBlank() }?.let(::add)
        movement.note?.takeIf { it.isNotBlank() }?.let(::add)
        if (movement.undoOf != null || alreadyUndone) add(Fa.movements.undoneMark)
    }.joinToString(" · ")

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                buildAnnotatedString {
                    append(movementLabel(movement.type))
                    if (!productName.isNullOrEmpty()) {
                        withStyle(SpanStyle(color = MaterialTheme.colorScheme.onSurfaceVariant)) {
                            append(" · ")
                            append(productName)
                        }
                    }
                },
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = if (onOpenProduct != null) {
                    Modifier.clickable(onClick = onOpenProduct)
                } else {
                    Modifier
                },
            )
            Text(
                meta,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            (if (movement.qty > 0) "+" else if (movement.qty < 0) "−" else "") + formatNumber(abs(movement.qty).toLong()),
            fontWeight = FontWeight.Bold,
            color = movementTone(movement.qty),
        )
        if (showUndo && movement.undoOf == null && !alreadyUndone) {
            TextButton(
                enabled = !busy,
                onClick = {
                    busy = true
                    scope.launch {
                        try {
                            container.stock.undo(movement.id)
                            showMessage(Fa.movements.undone)
                        } catch (error: Throwable) {
                            showMessage(messageFor(error))
                        } finally {
                            busy = false
                        }
                    }
                },
            ) {
                Text(Fa.common.undo, style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}
