package ir.plasco.managing.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.APP_VERSION
import ir.plasco.managing.domain.formatJalali
import ir.plasco.managing.model.ID
import ir.plasco.managing.model.ThemeMode
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.LocalShowMessage
import ir.plasco.managing.ui.components.ChipRow
import ir.plasco.managing.ui.components.Panel
import ir.plasco.managing.ui.components.ScreenHeader
import ir.plasco.managing.ui.components.SectionTitle
import ir.plasco.managing.ui.components.TextField
import kotlinx.coroutines.launch

private data class LabelRow(val id: ID, val name: String)

@Composable
fun MoreScreen(onOpenStockTake: () -> Unit, onOpenData: () -> Unit) {
    val container = LocalAppContainer.current
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val settings by container.hub.settings.collectAsStateWithLifecycle()
    val brands by container.hub.brands.collectAsStateWithLifecycle()
    val categories by container.hub.categories.collectAsStateWithLifecycle()
    val locations by container.hub.locations.collectAsStateWithLifecycle()

    var shopName by remember(settings.shopName) { mutableStateOf(settings.shopName) }
    var currency by remember(settings.currencyLabel) { mutableStateOf(settings.currencyLabel) }
    var newBrand by remember { mutableStateOf("") }
    var newCategory by remember { mutableStateOf("") }
    var newLocation by remember { mutableStateOf("") }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item { ScreenHeader(title = Fa.more.title, subtitle = "${Fa.common.appName} $APP_VERSION") }

        item { SectionTitle(Fa.more.settings, Modifier.padding(horizontal = 12.dp)) }
        item {
            Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                TextField(Fa.more.shopName, shopName, { shopName = it })
                Spacer(Modifier.height(8.dp))
                TextField(Fa.more.currencyLabel, currency, { currency = it })
                Spacer(Modifier.height(8.dp))
                Text(Fa.more.theme, style = MaterialTheme.typography.labelMedium)
                ChipRow(
                    options = listOf(
                        ThemeMode.System.wire to Fa.more.themeSystem,
                        ThemeMode.Light.wire to Fa.more.themeLight,
                        ThemeMode.Dark.wire to Fa.more.themeDark,
                    ),
                    selected = settings.theme.wire,
                    onSelect = { wire ->
                        scope.launch {
                            container.settings.update { current ->
                                current.copy(theme = ThemeMode.entries.first { it.wire == wire })
                            }
                        }
                    },
                )
                Spacer(Modifier.height(8.dp))
                Text(Fa.more.textScale, style = MaterialTheme.typography.labelMedium)
                ChipRow(
                    options = listOf("1.0" to "معمولی", "1.15" to "بزرگ", "1.3" to "خیلی بزرگ"),
                    selected = settings.textScale.toString(),
                    onSelect = { value ->
                        scope.launch {
                            container.settings.update { current -> current.copy(textScale = value.toFloat()) }
                        }
                    },
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = {
                        scope.launch {
                            container.settings.update { current ->
                                current.copy(shopName = shopName.trim(), currencyLabel = currency.trim())
                            }
                            showMessage("تنظیمات ذخیره شد")
                        }
                    },
                ) { Text(Fa.common.save) }
            }
        }

        item { SectionTitle(Fa.more.labels, Modifier.padding(horizontal = 12.dp)) }

        item {
            LabelEditor(
                title = Fa.more.brands,
                rows = brands.map { LabelRow(it.id, it.name) },
                value = newBrand,
                onValueChange = { newBrand = it },
                onAdd = {
                    val name = newBrand.trim()
                    if (name.isEmpty()) return@LabelEditor
                    scope.launch {
                        container.labels.addBrand(name)
                        newBrand = ""
                    }
                },
                onRemove = { id ->
                    scope.launch {
                        container.labels.removeBrand(id)
                        showMessage(Fa.more.remove)
                    }
                },
                addLabel = Fa.more.newBrand,
            )
        }

        item {
            LabelEditor(
                title = Fa.more.categories,
                rows = categories.map { LabelRow(it.id, it.name) },
                value = newCategory,
                onValueChange = { newCategory = it },
                onAdd = {
                    val name = newCategory.trim()
                    if (name.isEmpty()) return@LabelEditor
                    scope.launch {
                        container.labels.addCategory(name)
                        newCategory = ""
                    }
                },
                onRemove = { id ->
                    scope.launch {
                        container.labels.removeCategory(id)
                        showMessage(Fa.more.remove)
                    }
                },
                addLabel = Fa.more.newCategory,
            )
        }

        item {
            LabelEditor(
                title = Fa.more.locations,
                rows = locations.map { LabelRow(it.id, it.name) },
                value = newLocation,
                onValueChange = { newLocation = it },
                onAdd = {
                    val name = newLocation.trim()
                    if (name.isEmpty()) return@LabelEditor
                    scope.launch {
                        container.labels.addLocation(name)
                        newLocation = ""
                    }
                },
                onRemove = { id ->
                    scope.launch {
                        container.labels.removeLocation(id)
                        showMessage(Fa.more.remove)
                    }
                },
                addLabel = Fa.more.newLocation,
            )
        }

        item { SectionTitle(Fa.more.data, Modifier.padding(horizontal = 12.dp)) }
        item {
            Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                Text(
                    "${Fa.more.lastBackup}: " + (settings.lastBackupAt?.let { formatJalali(it) } ?: Fa.more.never),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    Fa.more.dataHint,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                Button(onClick = onOpenData) { Text(Fa.backup.title) }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = onOpenStockTake) { Text(Fa.stocktake.title) }
            }
        }

        item { SectionTitle(Fa.more.about, Modifier.padding(horizontal = 12.dp)) }
        item {
            Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                Text(Fa.more.aboutBody, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(4.dp))
                Text(
                    "${Fa.common.appName} $APP_VERSION · ${Fa.more.dataOnDevice}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun LabelEditor(
    title: String,
    rows: List<LabelRow>,
    value: String,
    onValueChange: (String) -> Unit,
    onAdd: () -> Unit,
    onRemove: (ID) -> Unit,
    addLabel: String,
) {
    Panel(modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
        SectionTitle(title)
        rows.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(row.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                OutlinedButton(onClick = { onRemove(row.id) }) { Text(Fa.common.delete) }
            }
        }
        Spacer(Modifier.height(4.dp))
        TextField(addLabel, value, onValueChange)
        Spacer(Modifier.height(8.dp))
        Button(onClick = onAdd) { Text(addLabel) }
    }
}
