package ir.plasco.managing.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import ir.plasco.managing.domain.formatJalali
import ir.plasco.managing.domain.formatNumber
import ir.plasco.managing.domain.parseIntegerInput
import ir.plasco.managing.model.ID
import ir.plasco.managing.model.StockTakeStatus
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.LocalShowMessage
import ir.plasco.managing.ui.components.ChipRow
import ir.plasco.managing.ui.components.EmptyState
import ir.plasco.managing.ui.components.Panel
import ir.plasco.managing.ui.components.ScreenHeader
import ir.plasco.managing.ui.components.SectionTitle
import kotlinx.coroutines.launch

@Composable
fun StockTakeScreen(onBack: () -> Unit) {
    val container = LocalAppContainer.current
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val products by container.hub.products.collectAsStateWithLifecycle()
    val levels by container.hub.levels.collectAsStateWithLifecycle()
    val locations by container.hub.locations.collectAsStateWithLifecycle()
    val stockTakes by container.hub.stockTakes.collectAsStateWithLifecycle()

    var locationId by remember(locations) { mutableStateOf(locations.firstOrNull()?.id.orEmpty()) }
    val counts = remember { mutableStateMapOf<ID, String>() }
    var busy by remember { mutableStateOf(false) }

    val active = remember(products) { products.filter { it.active } }
    val atLocation = remember(levels, locationId) {
        levels.filter { it.locationId == locationId }.associate { it.productId to it.qty }
    }

    // تعداد کالاهایی که واقعاً عوض می‌شوند — همان هشداری که نسخهٔ وب می‌دهد.
    val changes = remember(counts.toMap(), atLocation) {
        counts.count { (productId, text) ->
            val counted = parseIntegerInput(text) ?: return@count false
            (atLocation[productId] ?: 0) != counted
        }
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            ScreenHeader(title = Fa.stocktake.title, subtitle = Fa.stocktake.applyHint, onBack = onBack)
        }

        item { SectionTitle(Fa.stocktake.location, Modifier.padding(horizontal = 12.dp)) }
        item {
            ChipRow(
                options = locations.map { it.id to it.name },
                selected = locationId,
                onSelect = {
                    locationId = it
                    counts.clear()
                },
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        }

        if (active.isEmpty()) {
            item { EmptyState(Fa.stocktake.empty) }
        }

        items(active, key = { it.id }) { product ->
            val systemQty = atLocation[product.id] ?: 0
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(product.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                    Text(
                        "${product.code} · ${Fa.movements.pieces}: ${formatNumber(systemQty)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.width(8.dp))
                OutlinedTextField(
                    value = counts[product.id].orEmpty(),
                    onValueChange = { counts[product.id] = it },
                    label = { Text(Fa.stocktake.counted) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    textStyle = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.width(120.dp),
                )
            }
        }

        item {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    Fa.stocktake.deltaCount.replace("{count}", formatNumber(changes)),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    enabled = !busy && counts.isNotEmpty(),
                    onClick = {
                        val counted = counts.mapNotNull { (productId, text) ->
                            parseIntegerInput(text)?.let { productId to it }
                        }.toMap()
                        busy = true
                        scope.launch {
                            try {
                                container.stock.applyStockTake(locationId, counted)
                                showMessage(Fa.stocktake.applied)
                                counts.clear()
                            } catch (error: Throwable) {
                                showMessage(messageFor(error))
                            } finally {
                                busy = false
                            }
                        }
                    },
                ) { Text(Fa.stocktake.apply) }
            }
        }

        item { SectionTitle(Fa.stocktake.history, Modifier.padding(horizontal = 12.dp)) }
        if (stockTakes.isEmpty()) {
            item { EmptyState(Fa.stocktake.empty) }
        }
        items(stockTakes, key = { it.id }) { take ->
            Panel(modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            locations.firstOrNull { it.id == take.locationId }?.name ?: Fa.common.unknown,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Text(
                            formatJalali(take.appliedAt ?: take.updatedAt) + " · " + when (take.status) {
                                StockTakeStatus.Applied -> "اعمال‌شده"
                                StockTakeStatus.Open -> "باز"
                                StockTakeStatus.Cancelled -> "لغو‌شده"
                            },
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (take.status == StockTakeStatus.Applied) {
                        OutlinedButton(
                            onClick = {
                                scope.launch {
                                    try {
                                        container.stock.revertStockTake(take.id)
                                        showMessage(Fa.stocktake.reverted)
                                    } catch (error: Throwable) {
                                        showMessage(messageFor(error))
                                    }
                                }
                            },
                        ) { Text(Fa.stocktake.revert) }
                    }
                }
            }
        }
    }
}
