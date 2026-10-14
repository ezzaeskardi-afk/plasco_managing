package ir.plasco.managing.ui.screens

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.domain.formatFull
import ir.plasco.managing.domain.formatMoney
import ir.plasco.managing.domain.formatQty
import ir.plasco.managing.domain.productTotals
import ir.plasco.managing.domain.stockAlerts
import ir.plasco.managing.domain.valuate
import ir.plasco.managing.model.ID
import ir.plasco.managing.model.StockState
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.components.EmptyState
import ir.plasco.managing.ui.components.KpiBlock
import ir.plasco.managing.ui.components.Panel
import ir.plasco.managing.ui.components.ProductRow
import ir.plasco.managing.ui.components.ScreenHeader
import ir.plasco.managing.ui.components.SectionTitle
import ir.plasco.managing.ui.theme.toneColor

private const val BACKUP_STALE_DAYS = 7
private const val ALERT_LIMIT = 5

@Composable
fun HomeScreen(
    onOpenProduct: (ID) -> Unit,
    onOpenMovements: () -> Unit,
    onNewMovement: () -> Unit,
) {
    val container = LocalAppContainer.current
    val products by container.hub.products.collectAsStateWithLifecycle()
    val levels by container.hub.levels.collectAsStateWithLifecycle()
    val locations by container.hub.locations.collectAsStateWithLifecycle()
    val brands by container.hub.brands.collectAsStateWithLifecycle()
    val settings by container.hub.settings.collectAsStateWithLifecycle()

    val valuation = remember(products, levels) { valuate(products, levels) }
    val alerts = remember(products, levels) { stockAlerts(products, levels) }
    val totals = remember(levels) { productTotals(levels) }
    val brandNames = remember(brands) { brands.associate { it.id to it.name } }
    val perLocation = remember(levels, locations) {
        locations.map { location ->
            location.name to levels.filter { it.locationId == location.id }.sumOf { if (it.qty > 0) it.qty else 0 }
        }
    }
    val backupStale = remember(settings.lastBackupAt) {
        val last = settings.lastBackupAt
        last == null || System.currentTimeMillis() - last > BACKUP_STALE_DAYS * 24L * 60 * 60 * 1000
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            ScreenHeader(
                title = Fa.home.title,
                subtitle = settings.shopName,
                action = {
                    Button(onClick = onNewMovement) { Text(Fa.movements.newMovement) }
                },
            )
        }

        item {
            Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    KpiBlock(Fa.home.pieces, valuation.pieces.toLong(), Modifier.weight(1f))
                    KpiBlock(Fa.home.sku, valuation.skuCount.toLong(), Modifier.weight(1f))
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    KpiBlock(Fa.home.costValue, valuation.cost, Modifier.weight(1f))
                    KpiBlock(Fa.home.retailValue, valuation.retail, Modifier.weight(1f))
                }
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        Fa.home.potentialProfit,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        formatMoney(valuation.potentialProfit.toInt(), settings.currencyLabel),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = toneColor(StockState.Ok),
                    )
                }
            }
        }

        if (backupStale) {
            item {
                Text(
                    Fa.home.backupReminder,
                    style = MaterialTheme.typography.bodyMedium,
                    color = toneColor(StockState.Low),
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }

        item { SectionTitle(Fa.home.byLocation, Modifier.padding(horizontal = 12.dp)) }
        items(perLocation.size) { index ->
            val (name, qty) = perLocation[index]
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                Text(formatQty(qty), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
            }
        }

        item {
            SectionTitle(
                Fa.home.lowTitle,
                Modifier.padding(horizontal = 12.dp),
                trailing = {
                    Button(onClick = onOpenMovements) { Text(Fa.common.more) }
                },
            )
        }
        val low = alerts.first
        if (low.isEmpty()) {
            item { EmptyState(Fa.home.allGood) }
        } else {
            items(minOf(low.size, ALERT_LIMIT)) { index ->
                val row = low[index]
                ProductRow(
                    product = row.product,
                    total = row.total,
                    brandName = brandNames[row.product.brandId],
                    onClick = { onOpenProduct(row.product.id) },
                )
            }
        }

        item { SectionTitle(Fa.home.outTitle, Modifier.padding(horizontal = 12.dp)) }
        val out = alerts.second
        if (out.isEmpty()) {
            item { EmptyState(Fa.home.allGood) }
        } else {
            items(minOf(out.size, ALERT_LIMIT)) { index ->
                val row = out[index]
                ProductRow(
                    product = row.product,
                    total = row.total,
                    brandName = brandNames[row.product.brandId],
                    onClick = { onOpenProduct(row.product.id) },
                )
            }
        }

        item {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    "${Fa.home.sku}: ${formatFull(totals.size)} · ${Fa.more.dataOnDevice}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
