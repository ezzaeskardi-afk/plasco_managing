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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import ir.plasco.managing.domain.findProductByBarcode
import ir.plasco.managing.domain.formatJalali
import ir.plasco.managing.domain.displayProductName
import ir.plasco.managing.domain.formatNumber
import ir.plasco.managing.domain.parseIntegerInput
import ir.plasco.managing.model.ID
import ir.plasco.managing.model.Product
import ir.plasco.managing.model.StockTakeStatus
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.LocalShowMessage
import ir.plasco.managing.ui.components.ChipRow
import ir.plasco.managing.ui.components.EmptyState
import ir.plasco.managing.ui.components.NumberField
import ir.plasco.managing.ui.components.Panel
import ir.plasco.managing.ui.components.ScreenHeader
import ir.plasco.managing.ui.components.SectionTitle
import ir.plasco.managing.ui.scan.BarcodeScannerDialog
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
    var scanOpen by remember { mutableStateOf(false) }
    var scanTarget by remember { mutableStateOf<Product?>(null) }
    var scanCount by remember { mutableStateOf("") }
    var confirmApply by remember { mutableStateOf(false) }
    var revertId by remember { mutableStateOf<ID?>(null) }

    val active = remember(products) { products.filter { it.active } }
    val atLocation = remember(levels, locationId) {
        levels.filter { it.locationId == locationId }.associate { it.productId to it.qty }
    }

    // فقط متن‌های عددی معتبر شمرده می‌شوند؛ «اعمال» هم از همین نقشه تغذیه می‌شود
    // تا جلسهٔ خالی ثبت نشود (همان محافظی که نسخهٔ وب دارد).
    val counted = remember(counts.toMap()) {
        counts.mapNotNull { (productId, text) -> parseIntegerInput(text)?.let { productId to it } }.toMap()
    }

    // تعداد کالاهایی که واقعاً عوض می‌شوند — همان هشداری که نسخهٔ وب می‌دهد.
    val changes = remember(counted, atLocation) {
        counted.count { (productId, count) -> (atLocation[productId] ?: 0) != count }
    }

    // ثبت شمارش همان کالایی که همین حالا خوانده شد؛ «و بارکد بعدی» دوربین را بازمی‌گرداند.
    fun saveScan(next: Boolean) {
        val target = scanTarget ?: return
        val text = scanCount.trim()
        if (text.isEmpty()) counts.remove(target.id) else counts[target.id] = text
        scanTarget = null
        showMessage(Fa.stocktake.scanned)
        if (next) scanOpen = true
    }

    // اعمال و بازگردانی مثل نسخهٔ وب اول پرسش «مطمئنی؟» دارند؛ اعمال تعداد کالاهای
    // متغیر را می‌گوید و بازگردانی هم توضیح می‌دهد که جلسه دوباره «باز» می‌شود.
    fun applyCounts() {
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
    }

    fun revertTake(id: ID) {
        scope.launch {
            try {
                container.stock.revertStockTake(id)
                showMessage(Fa.stocktake.reverted)
            } catch (error: Throwable) {
                showMessage(messageFor(error))
            }
        }
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            ScreenHeader(
                title = Fa.stocktake.title,
                subtitle = Fa.stocktake.applyHint,
                onBack = onBack,
                action = { OutlinedButton(onClick = { scanOpen = true }) { Text(Fa.scan.button) } },
            )
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
                    Text(displayProductName(product.name), style = MaterialTheme.typography.bodyMedium, maxLines = 1)
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
                    enabled = !busy && counted.isNotEmpty(),
                    onClick = { confirmApply = true },
                ) { Text(Fa.stocktake.apply) }
            }
        }

        item { SectionTitle(Fa.stocktake.history, Modifier.padding(horizontal = 12.dp)) }
        if (stockTakes.isEmpty()) {
            item { EmptyState(Fa.stocktake.historyEmpty) }
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
                            onClick = { revertId = take.id },
                        ) { Text(Fa.stocktake.revert) }
                    }
                }
            }
        }
    }

    if (scanOpen) {
        BarcodeScannerDialog(
            onResult = { code ->
                scanOpen = false
                val found = findProductByBarcode(active, code)
                if (found == null) {
                    showMessage(Fa.scan.notFound + " " + code)
                } else {
                    scanTarget = found
                    scanCount = counts[found.id].orEmpty()
                }
            },
            onDismiss = { scanOpen = false },
            hint = Fa.stocktake.scanHint,
        )
    }

    val target = scanTarget
    if (target != null) {
        AlertDialog(
            onDismissRequest = { scanTarget = null },
            title = { Text(displayProductName(target.name)) },
            text = {
                Column {
                    Text(
                        "${target.code} · ${Fa.movements.pieces} در این مکان: ${formatNumber(atLocation[target.id] ?: 0)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    val before = counts[target.id]
                    if (!before.isNullOrBlank()) {
                        Text(
                            Fa.stocktake.countedBefore.replace("{count}", before),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    NumberField(Fa.stocktake.counted, scanCount, { scanCount = it })
                    Spacer(Modifier.height(8.dp))
                    Row {
                        OutlinedButton(
                            onClick = { scanCount = ((parseIntegerInput(scanCount) ?: 0) + 1).toString() },
                        ) { Text("+۱") }
                        Spacer(Modifier.width(8.dp))
                        OutlinedButton(
                            onClick = { scanCount = maxOf(0, (parseIntegerInput(scanCount) ?: 0) - 1).toString() },
                        ) { Text("−۱") }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { saveScan(next = false) }) { Text(Fa.common.save) } },
            dismissButton = { TextButton(onClick = { saveScan(next = true) }) { Text(Fa.stocktake.scanNext) } },
        )
    }

    if (confirmApply) {
        AlertDialog(
            onDismissRequest = { confirmApply = false },
            title = { Text(Fa.common.confirm) },
            text = { Text(Fa.stocktake.applyConfirm.replace("{count}", formatNumber(changes))) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmApply = false
                        applyCounts()
                    },
                ) { Text(Fa.stocktake.apply) }
            },
            dismissButton = { TextButton(onClick = { confirmApply = false }) { Text(Fa.common.cancel) } },
        )
    }

    val pendingRevert = revertId
    if (pendingRevert != null) {
        AlertDialog(
            onDismissRequest = { revertId = null },
            title = { Text(Fa.common.confirm) },
            text = { Text(Fa.stocktake.revertConfirm) },
            confirmButton = {
                TextButton(
                    onClick = {
                        revertId = null
                        revertTake(pendingRevert)
                    },
                ) { Text(Fa.stocktake.revert) }
            },
            dismissButton = { TextButton(onClick = { revertId = null }) { Text(Fa.common.cancel) } },
        )
    }
}
