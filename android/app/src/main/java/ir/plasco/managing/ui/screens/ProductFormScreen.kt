package ir.plasco.managing.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.data.NewProduct
import ir.plasco.managing.domain.findProductByBarcode
import ir.plasco.managing.domain.normalizeBarcode
import ir.plasco.managing.domain.parseBarcodeList
import ir.plasco.managing.domain.parseIntegerInput
import ir.plasco.managing.domain.piecesFrom
import ir.plasco.managing.model.ID
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.LocalShowMessage
import ir.plasco.managing.ui.components.ChipRow
import ir.plasco.managing.ui.components.NumberField
import ir.plasco.managing.ui.components.Panel
import ir.plasco.managing.ui.components.PhotoSection
import ir.plasco.managing.ui.components.ScreenHeader
import ir.plasco.managing.ui.components.SectionTitle
import ir.plasco.managing.ui.components.TextField
import ir.plasco.managing.ui.scan.BarcodeScannerDialog
import ir.plasco.managing.ui.theme.toneColor
import ir.plasco.managing.model.StockState
import kotlinx.coroutines.launch

@Composable
fun ProductFormScreen(productId: ID?, onDone: () -> Unit) {
    val container = LocalAppContainer.current
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val products by container.hub.products.collectAsStateWithLifecycle()
    val brands by container.hub.brands.collectAsStateWithLifecycle()
    val categories by container.hub.categories.collectAsStateWithLifecycle()
    val locations by container.hub.locations.collectAsStateWithLifecycle()
    val settings by container.hub.settings.collectAsStateWithLifecycle()

    val existing = remember(productId, products) { products.firstOrNull { it.id == productId } }
    val key = existing?.id ?: "new"

    var name by remember(key) { mutableStateOf(existing?.name.orEmpty()) }
    var code by remember(key) { mutableStateOf(existing?.code.orEmpty()) }
    var buyPrice by remember(key) { mutableStateOf(existing?.buyPrice?.toString().orEmpty()) }
    var retailPrice by remember(key) { mutableStateOf(existing?.retailPrice?.toString().orEmpty()) }
    var wholesale by remember(key) { mutableStateOf(existing?.wholesalePrice?.toString().orEmpty()) }
    var packLabel by remember(key) { mutableStateOf(existing?.packLabel ?: "عدد") }
    var packSize by remember(key) { mutableStateOf(existing?.packSize?.toString() ?: "1") }
    var minStock by remember(key) { mutableStateOf(existing?.minStock?.toString().orEmpty()) }
    var note by remember(key) { mutableStateOf(existing?.note.orEmpty()) }
    var barcodes by remember(key) { mutableStateOf(existing?.barcodes?.joinToString("\n").orEmpty()) }
    var scanOpen by remember { mutableStateOf(false) }
    var brandId by remember(key) { mutableStateOf(existing?.brandId.orEmpty()) }
    var categoryId by remember(key) { mutableStateOf(existing?.categoryId.orEmpty()) }
    var photoPending by remember(key) { mutableStateOf<ByteArray?>(null) }
    var photoCleared by remember(key) { mutableStateOf(false) }
    var packsIn by remember { mutableStateOf("") }
    var piecesIn by remember { mutableStateOf("") }
    var locationId by remember(locations) { mutableStateOf(locations.firstOrNull()?.id.orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    fun save() {
        if (name.isBlank()) {
            showMessage(Fa.errors.saveFailed)
            return
        }
        val size = parseIntegerInput(packSize) ?: 1
        val initial = piecesFrom(parseIntegerInput(packsIn) ?: 0, parseIntegerInput(piecesIn) ?: 0, size)
        busy = true
        scope.launch {
            // عکس مثل بقیهٔ فیلدها با همین ذخیره می‌نشیند: انتخاب‌شده را می‌نویسد و
            // «حذف عکس» را هم همان‌جا اعمال می‌کند (رفتار نسخهٔ وب).
            var savedId: ID? = existing?.id
            var photoNote: String? = null
            try {
                if (existing == null) {
                    val created = container.products.create(
                        NewProduct(
                            name = name.trim(),
                            code = code.trim().ifEmpty { null },
                            brandId = brandId.ifEmpty { null },
                            categoryId = categoryId.ifEmpty { null },
                            barcodes = parseBarcodeList(barcodes),
                            packLabel = packLabel.ifBlank { "عدد" },
                            packSize = size,
                            buyPrice = parseIntegerInput(buyPrice) ?: 0,
                            retailPrice = parseIntegerInput(retailPrice) ?: 0,
                            wholesalePrice = parseIntegerInput(wholesale),
                            minStock = parseIntegerInput(minStock),
                            note = note.ifBlank { null },
                            initialQty = initial,
                            locationId = locationId.ifEmpty { null },
                        ),
                    )
                    savedId = created.id
                } else {
                    container.products.update(
                        existing.copy(
                            name = name.trim(),
                            code = code.trim().ifEmpty { existing.code },
                            brandId = brandId.ifEmpty { null },
                            categoryId = categoryId.ifEmpty { null },
                            barcodes = parseBarcodeList(barcodes),
                            packLabel = packLabel.ifBlank { "عدد" },
                            packSize = size,
                            buyPrice = parseIntegerInput(buyPrice) ?: 0,
                            retailPrice = parseIntegerInput(retailPrice) ?: 0,
                            wholesalePrice = parseIntegerInput(wholesale),
                            minStock = parseIntegerInput(minStock),
                            note = note.ifBlank { null },
                        ),
                    )
                }
                val pendingBytes = photoPending
                if (pendingBytes != null && savedId != null) {
                    photoNote = runCatching { container.photos.setPhoto(savedId, pendingBytes) }
                        .fold({ Fa.photos.saved }, { Fa.photos.failed })
                } else if (photoCleared && savedId != null) {
                    container.photos.deletePhoto(savedId)
                    photoNote = Fa.photos.deleted
                }
                val base = if (existing == null) Fa.products.saved else Fa.products.updated
                showMessage(base + (photoNote?.let { " · $it" } ?: ""))
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
                title = if (existing == null) Fa.products.newProduct else Fa.products.editTitle,
                subtitle = existing?.code,
                onBack = onDone,
            )
        }

        item {
            Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                TextField(Fa.products.name, name, { name = it })
                Spacer(Modifier.height(8.dp))
                TextField(Fa.products.code, code, { code = it }, supporting = Fa.products.codeHint)
                Spacer(Modifier.height(8.dp))
                // قفل قیمت (مثل نسخهٔ وب): فقط در ویرایشِ کالای موجود پنهان می‌شود؛
                // مقدار قبلی در همان state می‌ماند و بی‌تغییر دوباره فرستاده می‌شود.
                // «کالای جدید» از خالی شروع می‌شود، پس فیلدش می‌ماند.
                if (existing == null || !settings.costLockEnabled) {
                    NumberField(Fa.products.buyPrice, buyPrice, { buyPrice = it })
                    Spacer(Modifier.height(8.dp))
                }
                NumberField(Fa.products.retailPrice, retailPrice, { retailPrice = it })
            }
        }

        item { SectionTitle(Fa.photos.title, Modifier.padding(horizontal = 12.dp)) }

        item {
            Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                PhotoSection(
                    productId = existing?.id,
                    pending = photoPending,
                    onPending = { bytes ->
                        photoPending = bytes
                        if (bytes != null) photoCleared = false
                    },
                    cleared = photoCleared,
                    onCleared = {
                        photoPending = null
                        photoCleared = true
                    },
                    onMessage = showMessage,
                )
            }
        }

        item { SectionTitle(Fa.common.more, Modifier.padding(horizontal = 12.dp)) }

        item {
            Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                NumberField(Fa.products.wholesalePrice, wholesale, { wholesale = it })
                Spacer(Modifier.height(8.dp))
                TextField(Fa.products.packLabel, packLabel, { packLabel = it })
                Spacer(Modifier.height(8.dp))
                NumberField(Fa.products.packSize, packSize, { packSize = it })
                Spacer(Modifier.height(8.dp))
                NumberField(Fa.products.minStock, minStock, { minStock = it }, supporting = Fa.products.minStockHint)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = barcodes,
                    onValueChange = { barcodes = it },
                    label = { Text(Fa.scan.codes) },
                    supportingText = { Text(Fa.scan.codesHint) },
                    minLines = 2,
                    textStyle = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { scanOpen = true }) { Text(Fa.scan.addWithCamera) }
                Spacer(Modifier.height(8.dp))
                TextField(Fa.products.note, note, { note = it })
            }
        }

        if (brands.isNotEmpty()) {
            item { SectionTitle(Fa.products.brand, Modifier.padding(horizontal = 12.dp)) }
            item {
                ChipRow(
                    options = listOf("" to Fa.common.none) + brands.map { it.id to it.name },
                    selected = brandId,
                    onSelect = { brandId = it },
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
        }

        if (categories.isNotEmpty()) {
            item { SectionTitle(Fa.products.category, Modifier.padding(horizontal = 12.dp)) }
            item {
                ChipRow(
                    options = listOf("" to Fa.common.none) + categories.map { it.id to it.name },
                    selected = categoryId,
                    onSelect = { categoryId = it },
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
        }

        if (existing == null) {
            item { SectionTitle(Fa.products.initialQty, Modifier.padding(horizontal = 12.dp)) }
            item {
                Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                    NumberField(Fa.movements.packs, packsIn, { packsIn = it })
                    Spacer(Modifier.height(8.dp))
                    NumberField(Fa.movements.pieces, piecesIn, { piecesIn = it })
                    if (locations.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(Fa.products.initialLocation, style = MaterialTheme.typography.labelMedium)
                        ChipRow(
                            options = locations.map { it.id to it.name },
                            selected = locationId,
                            onSelect = { locationId = it },
                        )
                    }
                }
            }
        }

        item {
            Column(modifier = Modifier.padding(12.dp)) {
                Button(onClick = { save() }, enabled = !busy) {
                    // برچسب دکمه فعل است؛ «کالا ذخیره شد» پیام بعد از ذخیره‌است، نه دستور.
                    Text(Fa.common.save)
                }
                Spacer(Modifier.height(8.dp))
                if (existing != null) {
                    // حذف بی‌واگرد است؛ مثل تأییدهای نسخهٔ وب یک پرسش می‌آید.
                    OutlinedButton(
                        onClick = { confirmDelete = true },
                    ) {
                        Text(Fa.common.delete, color = toneColor(StockState.Out))
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                container.products.setActive(existing.id, !existing.active)
                                showMessage(Fa.products.updated)
                            }
                        },
                    ) {
                        Text(if (existing.active) "غیرفعال کن" else "فعال کن")
                    }
                }
            }
        }
    }

    // بارکد خوانده‌شده به همین فهرست اضافه می‌شود و با ذخیرهٔ فرم می‌ماند.
    if (scanOpen) {
        BarcodeScannerDialog(
            onResult = { raw ->
                scanOpen = false
                val code = normalizeBarcode(raw)
                val owner = if (code.isEmpty()) {
                    null
                } else {
                    findProductByBarcode(products.filter { it.id != existing?.id }, code)
                }
                when {
                    code.isEmpty() -> showMessage(Fa.scan.notFound)
                    owner != null -> showMessage(Fa.scan.otherProduct.replace("{name}", owner.name))
                    else -> {
                        barcodes = (parseBarcodeList(barcodes) + code).distinct().joinToString("\n")
                        showMessage(Fa.scan.added)
                    }
                }
            },
            onDismiss = { scanOpen = false },
        )
    }

    if (confirmDelete && existing != null) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(Fa.common.confirm) },
            text = { Text(Fa.products.deleteConfirm.replace("{name}", existing.name)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDelete = false
                        scope.launch {
                            container.products.softDelete(existing.id)
                            showMessage(Fa.products.deleted)
                            onDone()
                        }
                    },
                ) { Text(Fa.common.delete, color = toneColor(StockState.Out)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text(Fa.common.cancel) }
            },
        )
    }
}

/** خطاها را به جملهٔ فارسی تبدیل می‌کند. */
internal fun messageFor(error: Throwable): String = when {
    error.message?.contains("DuplicateProductCode") == true -> Fa.errors.duplicateCode
    error.message?.contains("InsufficientStock") == true -> Fa.errors.insufficient
    error.message?.contains("MovementQtyMustBeNonZero") == true -> Fa.movements.notEnough
    error.message?.contains("AlreadyUndone") == true -> Fa.errors.alreadyUndone
    error.message?.contains("TransferSameLocation") == true -> Fa.movements.transferSame
    error.message?.contains("StockTakeEmpty") == true -> Fa.stocktake.nothingCounted
    else -> error.message ?: Fa.errors.failed
}
