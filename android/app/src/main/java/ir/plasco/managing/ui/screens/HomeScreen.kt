package ir.plasco.managing.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.APP_VERSION
import ir.plasco.managing.domain.GroupValuation
import ir.plasco.managing.domain.displayProductName
import ir.plasco.managing.domain.formatMoney
import ir.plasco.managing.domain.stockAlerts
import ir.plasco.managing.domain.valuate
import ir.plasco.managing.model.ID
import ir.plasco.managing.model.StockState
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.components.AlertRow
import ir.plasco.managing.ui.components.BreakdownRow
import ir.plasco.managing.ui.components.EmptyState
import ir.plasco.managing.ui.components.Glyphs
import ir.plasco.managing.ui.components.KpiBlock
import ir.plasco.managing.ui.components.ListPanel
import ir.plasco.managing.ui.components.MovementRow
import ir.plasco.managing.ui.components.Panel
import ir.plasco.managing.ui.components.QuickActionTile
import ir.plasco.managing.ui.components.SectionTitle
import ir.plasco.managing.ui.theme.toneColor
import kotlinx.coroutines.delay

private const val BACKUP_STALE_DAYS = 7
private const val ALERT_LIMIT = 8
private const val RECENT_LIMIT = 5
private const val GROUP_LIMIT = 8

/**
 * خانهٔ اندروید — همان ترتیب و شکل خانهٔ وب (`features/dashboard/DashboardPage.tsx`):
 * بنر بکاپ → عددها → کارهای سریع → کم‌موجود → ناموجود → حرکات اخیر → مکان/برند/دسته → نسخه.
 */
@Composable
fun HomeScreen(
    onOpenProduct: (ID) -> Unit,
    onNewProduct: () -> Unit,
    onNewMovement: (String?) -> Unit,
    onOpenMovements: () -> Unit,
    onOpenBackup: () -> Unit,
    onOpenFiltered: (locationId: String?, brandId: String?, categoryId: String?) -> Unit,
) {
    val container = LocalAppContainer.current
    val products by container.hub.products.collectAsStateWithLifecycle()
    val levels by container.hub.levels.collectAsStateWithLifecycle()
    val locations by container.hub.locations.collectAsStateWithLifecycle()
    val brands by container.hub.brands.collectAsStateWithLifecycle()
    val categories by container.hub.categories.collectAsStateWithLifecycle()
    val settings by container.hub.settings.collectAsStateWithLifecycle()
    val movements by container.hub.movements.collectAsStateWithLifecycle()

    val valuation = remember(products, levels) { valuate(products, levels) }
    val alerts = remember(products, levels) { stockAlerts(products, levels) }
    val locationNames = remember(locations) { locations.associate { it.id to it.name } }
    val brandNames = remember(brands) { brands.associate { it.id to it.name } }
    val categoryNames = remember(categories) { categories.associate { it.id to it.name } }
    val productNames = remember(products) { products.associate { it.id to displayProductName(it.name) } }
    val recent = remember(movements) { movements.take(RECENT_LIMIT) }
    // حرکتی که خودش واگرد شده، دکمهٔ واگرد ندارد.
    val undoneIds = remember(movements) { movements.mapNotNull { it.undoOf }.toSet() }
    // A phone can stay on the home screen for days; without a tick the 7-day
    // banner would only appear after the next app start.
    val now by produceState(initialValue = System.currentTimeMillis()) {
        while (true) {
            delay(60L * 60 * 1000)
            value = System.currentTimeMillis()
        }
    }
    val backupStale = remember(settings.lastBackupAt, now) {
        val last = settings.lastBackupAt
        last == null || now - last > BACKUP_STALE_DAYS * 24L * 60 * 60 * 1000
    }

    if (products.isEmpty()) {
        EmptyState(Fa.products.empty, Fa.products.newProduct, onNewProduct)
        return
    }

    val low = alerts.first
    val out = alerts.second
    val costVisible = !settings.costLockEnabled

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
    ) {
        if (backupStale) {
            item {
                Panel(modifier = Modifier.padding(bottom = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            Fa.home.backupReminder,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        Button(onClick = onOpenBackup) {
                            Icon(Glyphs.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(Fa.home.backupNow)
                        }
                    }
                }
            }
        }

        item {
            Panel {
                Row(modifier = Modifier.fillMaxWidth()) {
                    KpiBlock(Fa.home.pieces, valuation.pieces.toLong(), Modifier.weight(1f), icon = Glyphs.Boxes)
                    KpiBlock(Fa.home.sku, valuation.productCount.toLong(), Modifier.weight(1f), icon = Glyphs.Package)
                }
                Row(modifier = Modifier.fillMaxWidth()) {
                    KpiBlock(
                        Fa.home.costValue,
                        valuation.cost,
                        Modifier.weight(1f),
                        locked = settings.costLockEnabled,
                        icon = Glyphs.Wallet,
                    )
                    KpiBlock(
                        Fa.home.retailValue,
                        valuation.retail,
                        Modifier.weight(1f),
                        locked = settings.costLockEnabled,
                        icon = Glyphs.Tag,
                    )
                }
                Spacer(Modifier.height(8.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Glyphs.TrendingUp,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        Fa.home.potentialProfit,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    // قفل قیمت (مثل نسخهٔ وب): عددهای پولی پنهان می‌شوند؛ «تعداد» و «چند نوع» می‌مانند.
                    Text(
                        if (settings.costLockEnabled) {
                            Fa.common.lockedValue
                        } else {
                            formatMoney(valuation.potentialProfit, settings.currencyLabel)
                        },
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = toneColor(StockState.Ok),
                    )
                }
            }
        }

        item { SectionTitle(Fa.home.quickTitle) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QuickActionTile(Glyphs.Basket, Fa.movements.receive, { onNewMovement("receive") }, Modifier.weight(1f))
                QuickActionTile(Glyphs.Truck, Fa.movements.sale, { onNewMovement("sale") }, Modifier.weight(1f))
                QuickActionTile(Glyphs.Transfer, Fa.movements.transfer, { onNewMovement("transfer") }, Modifier.weight(1f))
                QuickActionTile(Glyphs.PackagePlus, Fa.products.newProduct, onNewProduct, Modifier.weight(1f))
            }
        }

        item { SectionTitle(Fa.home.lowTitle) }
        if (low.isEmpty()) {
            item { MutedText(Fa.home.lowEmpty) }
        } else {
            item {
                ListPanel {
                    val rows = low.take(ALERT_LIMIT)
                    rows.forEachIndexed { index, row ->
                        AlertRow(
                            product = row.product,
                            total = row.total,
                            onClick = { onOpenProduct(row.product.id) },
                        )
                        if (index < rows.lastIndex) RowDivider()
                    }
                }
            }
        }

        item { SectionTitle(Fa.home.outTitle) }
        if (out.isEmpty()) {
            item { MutedText(Fa.home.outEmpty) }
        } else {
            item {
                ListPanel {
                    val rows = out.take(ALERT_LIMIT)
                    rows.forEachIndexed { index, row ->
                        AlertRow(
                            product = row.product,
                            total = row.total,
                            onClick = { onOpenProduct(row.product.id) },
                        )
                        if (index < rows.lastIndex) RowDivider()
                    }
                }
            }
        }

        item {
            SectionTitle(
                Fa.home.recentTitle,
                action = {
                    TextButton(onClick = onOpenMovements) {
                        Text(Fa.home.viewAll, style = MaterialTheme.typography.labelMedium)
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                },
            )
        }
        if (recent.isEmpty()) {
            item { MutedText(Fa.home.recentEmpty) }
        } else {
            item {
                ListPanel {
                    recent.forEachIndexed { index, movement ->
                        MovementRow(
                            movement = movement,
                            productName = productNames[movement.productId],
                            locationName = locationNames[movement.locationId],
                            alreadyUndone = undoneIds.contains(movement.id),
                            onOpenProduct = { onOpenProduct(movement.productId) },
                        )
                        if (index < recent.lastIndex) RowDivider()
                    }
                }
            }
        }

        item { SectionTitle(Fa.home.byLocation) }
        item {
            BreakdownList(
                groups = valuation.byLocation,
                names = locationNames,
                costVisible = costVisible,
                currencyLabel = settings.currencyLabel,
                limit = Int.MAX_VALUE,
                onPick = { id -> onOpenFiltered(id, null, null) },
            )
        }

        item { SectionTitle(Fa.home.byBrand) }
        item {
            BreakdownList(
                groups = valuation.byBrand,
                names = brandNames,
                costVisible = costVisible,
                currencyLabel = settings.currencyLabel,
                limit = GROUP_LIMIT,
                onPick = { id -> onOpenFiltered(null, id, null) },
            )
        }

        item { SectionTitle(Fa.home.byCategory) }
        item {
            BreakdownList(
                groups = valuation.byCategory,
                names = categoryNames,
                costVisible = costVisible,
                currencyLabel = settings.currencyLabel,
                limit = GROUP_LIMIT,
                onPick = { id -> onOpenFiltered(null, null, id) },
            )
        }

        item {
            Text(
                "${Fa.more.version} $APP_VERSION",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
            )
        }
    }
}

@Composable
private fun MutedText(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun RowDivider() {
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

@Composable
private fun BreakdownList(
    groups: List<GroupValuation>,
    names: Map<ID, String>,
    costVisible: Boolean,
    currencyLabel: String,
    limit: Int,
    onPick: (ID) -> Unit,
) {
    if (groups.isEmpty()) {
        MutedText(Fa.common.none)
        return
    }
    val shown = groups.take(limit)
    val maxRetail = maxOf(1L, shown.maxOf { it.retail })
    ListPanel {
        shown.forEachIndexed { index, group ->
            BreakdownRow(
                label = names[group.id] ?: Fa.common.unknown,
                pieces = group.pieces,
                retail = group.retail,
                maxRetail = maxRetail,
                costVisible = costVisible,
                currencyLabel = currencyLabel,
                onClick = { onPick(group.id) },
            )
            if (index < shown.lastIndex) RowDivider()
        }
    }
}
