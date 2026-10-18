package ir.plasco.managing.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.data.MovementInput
import ir.plasco.managing.domain.cartonPieces
import ir.plasco.managing.domain.findProductByBarcode
import ir.plasco.managing.domain.displayProductName
import ir.plasco.managing.domain.formatNumber
import ir.plasco.managing.domain.parseIntegerInput
import ir.plasco.managing.domain.ProductSearchIndex
import ir.plasco.managing.domain.productTotals
import ir.plasco.managing.model.MovementType
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.LocalShowMessage
import ir.plasco.managing.ui.components.ChipRow
import ir.plasco.managing.ui.components.NumberField
import ir.plasco.managing.ui.components.Panel
import ir.plasco.managing.ui.components.ProductRow
import ir.plasco.managing.ui.components.ScreenHeader
import ir.plasco.managing.ui.components.SectionTitle
import ir.plasco.managing.ui.components.TextField
import ir.plasco.managing.ui.scan.BarcodeScannerDialog
import kotlinx.coroutines.launch

/** کارهایی که کاربر از این صفحه می‌خواهد؛ انتقال دو ساق دارد. */
private enum class Action(val label: String, val type: MovementType?, val outgoing: Boolean) {
    Receive(Fa.movements.receive, MovementType.Receive, false),
    Sale(Fa.movements.sale, MovementType.Sale, true),
    Adjust(Fa.movements.adjust, MovementType.Adjust, false),
    Damage(Fa.movements.damage, MovementType.Damage, true),
    ReturnIn(Fa.movements.returnIn, MovementType.ReturnIn, false),
    ReturnOut(Fa.movements.returnOut, MovementType.ReturnOut, true),
    Transfer(Fa.movements.transfer, null, false),
}

private const val PICKER_LIMIT = 20

@Composable
fun MovementScreen(initialProductId: String, initialType: String, onDone: () -> Unit) {
    val container = LocalAppContainer.current
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val products by container.hub.products.collectAsStateWithLifecycle()
    val levels by container.hub.levels.collectAsStateWithLifecycle()
    val locations by container.hub.locations.collectAsStateWithLifecycle()
    val brands by container.hub.brands.collectAsStateWithLifecycle()
    val settings by container.hub.settings.collectAsStateWithLifecycle()

    var action by remember {
        mutableStateOf(
            // «انتقال» تایپ تک‌حرکتی ندارد (دو ساق transfer_out/transfer_in دارد)؛
            // برای همین جداگانه تطبیق داده می‌شود.
            if (initialType == "transfer") {
                Action.Transfer
            } else {
                Action.entries.firstOrNull { it.type?.wire == initialType } ?: Action.Receive
            },
        )
    }
    var productId by remember { mutableStateOf(initialProductId) }
    var locationId by remember(locations) { mutableStateOf(locations.firstOrNull()?.id.orEmpty()) }
    var toLocationId by remember(locations) { mutableStateOf(locations.getOrNull(1)?.id.orEmpty()) }
    var query by remember { mutableStateOf("") }
    var cartons by remember { mutableStateOf("") }
    var perCarton by remember { mutableStateOf("") }
    var pieces by remember { mutableStateOf("") }
    var unitPrice by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var decrease by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var scanOpen by remember { mutableStateOf(false) }

    val selected = products.firstOrNull { it.id == productId }
    val brandNames = remember(brands) { brands.associate { it.id to it.name } }
    val index = remember(products, brandNames) { ProductSearchIndex(products, brandNames) }
    val results = remember(query, index) {
        if (query.isBlank()) emptyList() else index.search(query, PICKER_LIMIT).map { it.product }
    }
    val totals = remember(levels) { productTotals(levels) }
    val qtyAtLocation = levels.firstOrNull { it.productId == productId && it.locationId == locationId }?.qty ?: 0
    val cartonsEntered = parseIntegerInput(cartons) ?: 0
    val perCartonEntered = parseIntegerInput(perCarton) ?: 0
    val qty = cartonPieces(cartonsEntered, perCartonEntered, parseIntegerInput(pieces) ?: 0)
    val perCartonMissing = cartonsEntered > 0 && perCartonEntered < 2

    // «تعداد در کارتن» از خود کالا می‌آید؛ با عوض شدن کالا عددهای فرم صفر می‌شوند
    // تا تعداد یک کالا روی کالای بعدی ننشیند (به‌جای چسبیدن به کالای قبلی).
    LaunchedEffect(selected?.id) {
        cartons = ""
        pieces = ""
        val size = selected?.packSize ?: 0
        perCarton = if (size > 1) size.toString() else ""
    }

    fun submit() {
        val product = selected
        if (product == null) {
            showMessage(Fa.movements.pickProduct)
            return
        }
        if (qty == 0) {
            showMessage(Fa.movements.notEnough)
            return
        }
        busy = true
        scope.launch {
            try {
                if (action == Action.Transfer) {
                    container.stock.transfer(product.id, locationId, toLocationId, qty, note.ifBlank { null })
                } else {
                    val signed = when {
                        action.type == MovementType.Adjust && decrease -> -qty
                        action.outgoing -> -qty
                        else -> qty
                    }
                    container.stock.apply(
                        MovementInput(
                            productId = product.id,
                            locationId = locationId,
                            type = action.type ?: MovementType.Adjust,
                            qty = signed,
                            unitPrice = parseIntegerInput(unitPrice),
                            note = note.ifBlank { null },
                        ),
                    )
                }
                // «تعداد در کارتن» تایپ‌شده روی سر خود کالا می‌نشیند تا دفعهٔ بعد
                // پیش‌پر باشد؛ فقط تنظیمات کالاست، نه بخشی از خود حرکت.
                val perCartonSize = parseIntegerInput(perCarton) ?: 0
                if (action != Action.Adjust && perCartonSize >= 2 && perCartonSize != product.packSize) {
                    runCatching {
                        container.products.update(
                            product.copy(
                                packSize = perCartonSize,
                                packLabel = if (product.packLabel == "عدد") "کارتن" else product.packLabel,
                            ),
                        )
                    }
                }
                showMessage(Fa.movements.saved)
                onDone()
            } catch (error: Throwable) {
                showMessage(messageFor(error))
            } finally {
                busy = false
            }
        }
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            ScreenHeader(
                title = Fa.movements.newMovement,
                subtitle = action.label,
                onBack = onDone,
                action = { OutlinedButton(onClick = { scanOpen = true }) { Text(Fa.scan.button) } },
            )
        }

        item {
            ChipRow(
                options = Action.entries.map { it.name to it.label },
                selected = action.name,
                onSelect = { name -> action = Action.valueOf(name) },
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        }

        if (action == Action.Adjust) {
            item {
                ChipRow(
                    options = listOf("false" to "افزایش", "true" to "کاهش"),
                    selected = decrease.toString(),
                    onSelect = { decrease = it == "true" },
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
        }

        if (selected == null) {
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text(Fa.movements.pickProduct) },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                )
            }
            items(results, key = { it.id }) { product ->
                ProductRow(
                    product = product,
                    total = totals[product.id] ?: 0,
                    brandName = brandNames[product.brandId],
                    onClick = { productId = product.id },
                )
            }
        } else {
            item {
                Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(displayProductName(selected.name), style = MaterialTheme.typography.bodyLarge)
                            Text(
                                "${selected.code} · ${Fa.movements.pieces}: ${formatNumber(totals[selected.id] ?: 0)}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        OutlinedButton(onClick = { productId = ""; query = "" }) { Text("تغییر کالا") }
                    }
                }
            }
        }

        item { SectionTitle(Fa.movements.location, Modifier.padding(horizontal = 12.dp)) }
        item {
            ChipRow(
                options = locations.map { it.id to it.name },
                selected = locationId,
                onSelect = { locationId = it },
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        }
        if (selected != null) {
            item {
                Text(
                    "${Fa.movements.pieces} در این مکان: ${formatNumber(qtyAtLocation)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
        }

        if (action == Action.Transfer) {
            item { SectionTitle(Fa.movements.to, Modifier.padding(horizontal = 12.dp)) }
            item {
                ChipRow(
                    options = locations.filter { it.id != locationId }.map { it.id to it.name },
                    selected = toLocationId,
                    onSelect = { toLocationId = it },
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
        }

        item {
            Panel(modifier = Modifier.padding(12.dp)) {
                NumberField(Fa.movements.cartons, cartons, { cartons = it })
                Spacer(Modifier.height(8.dp))
                NumberField(
                    Fa.movements.perCarton,
                    perCarton,
                    { perCarton = it },
                    supporting = if (perCartonMissing) Fa.movements.perCartonNeeded else null,
                )
                Spacer(Modifier.height(8.dp))
                NumberField(Fa.movements.pieces, pieces, { pieces = it })
                Spacer(Modifier.height(8.dp))
                Text(
                    "${Fa.movements.qty}: ${formatNumber(qty)}",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.bodyLarge,
                )
                if (action == Action.Receive || action == Action.Sale) {
                    Spacer(Modifier.height(8.dp))
                    NumberField(
                        Fa.movements.unitPrice,
                        unitPrice,
                        { unitPrice = it },
                        groupThousands = true,
                        suffix = settings.currencyLabel.ifBlank { "تومان" },
                    )
                }
                Spacer(Modifier.height(8.dp))
                TextField(Fa.movements.note, note, { note = it })
            }
        }

        item {
            Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                Button(onClick = { submit() }, enabled = !busy) {
                    Text(Fa.movements.newMovement)
                }
            }
        }
    }

    if (scanOpen) {
        BarcodeScannerDialog(
            onResult = { code ->
                scanOpen = false
                val found = findProductByBarcode(products, code)
                if (found == null) {
                    showMessage(Fa.scan.notFound + " " + code)
                } else {
                    productId = found.id
                    query = ""
                    showMessage(displayProductName(found.name))
                }
            },
            onDismiss = { scanOpen = false },
        )
    }
}
