package ir.plasco.managing.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.domain.displayProductName
import ir.plasco.managing.domain.formatJalali
import ir.plasco.managing.domain.formatMoney
import ir.plasco.managing.domain.formatNumber
import ir.plasco.managing.domain.formatQty
import ir.plasco.managing.domain.formatTime
import ir.plasco.managing.domain.stockAlerts
import ir.plasco.managing.domain.valuate
import ir.plasco.managing.model.ID
import ir.plasco.managing.model.Movement
import ir.plasco.managing.model.StockState
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.components.EmptyState
import ir.plasco.managing.ui.components.KpiBlock
import ir.plasco.managing.ui.components.Panel
import ir.plasco.managing.ui.components.ProductRow
import ir.plasco.managing.ui.components.ScreenHeader
import ir.plasco.managing.ui.components.SectionTitle
import ir.plasco.managing.ui.components.movementLabel
import ir.plasco.managing.ui.components.movementTone
import ir.plasco.managing.ui.theme.toneColor
import kotlin.math.abs

private const val BACKUP_STALE_DAYS = 7
private const val ALERT_LIMIT = 5
private const val RECENT_LIMIT = 5

@Composable
fun HomeScreen(
    onOpenProduct: (ID) -> Unit,
    onNewMovement: () -> Unit,
) {
    val container = LocalAppContainer.current
    val products by container.hub.products.collectAsStateWithLifecycle()
    val levels by container.hub.levels.collectAsStateWithLifecycle()
    val locations by container.hub.locations.collectAsStateWithLifecycle()
    val brands by container.hub.brands.collectAsStateWithLifecycle()
    val settings by container.hub.settings.collectAsStateWithLifecycle()
    val movements by container.hub.movements.collectAsStateWithLifecycle()

    val valuation = remember(products, levels) { valuate(products, levels) }
    val alerts = remember(products, levels) { stockAlerts(products, levels) }
    val brandNames = remember(brands) { brands.associate { it.id to it.name } }
    val productNames = remember(products) { products.associate { it.id to displayProductName(it.name) } }
    val locationNames = remember(locations) { locations.associate { it.id to it.name } }
    // مثل نسخهٔ وب: فقط کالاهای فعال و فقط سهم مثبت هر مکان (valuate byLocation).
    val activeIds = remember(products) {
        products.filter { it.active && it.deletedAt == null }.map { it.id }.toSet()
    }
    val perLocation = remember(levels, locations, activeIds) {
        locations.map { location ->
            location.name to levels
                .filter { it.locationId == location.id && it.qty > 0 && it.productId in activeIds }
                .sumOf { it.qty }
        }
    }
    val recent = remember(movements) { movements.take(RECENT_LIMIT) }
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
                    KpiBlock(Fa.home.sku, valuation.productCount.toLong(), Modifier.weight(1f))
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    KpiBlock(Fa.home.costValue, valuation.cost, Modifier.weight(1f), locked = settings.costLockEnabled)
                    KpiBlock(Fa.home.retailValue, valuation.retail, Modifier.weight(1f), locked = settings.costLockEnabled)
                }
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
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
                            formatMoney(valuation.potentialProfit.toInt(), settings.currencyLabel)
                        },
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

        item {
            SectionTitle(Fa.home.lowTitle, Modifier.padding(horizontal = 12.dp))
        }
        val low = alerts.first
        if (low.isEmpty()) {
            item { EmptyState(Fa.home.lowEmpty) }
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
            item { EmptyState(Fa.home.outEmpty) }
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

        // حرکات اخیر (مثل نسخهٔ وب): از حافظهٔ خود hub که «تازه‌ترین‌ها» را دارد.
        item { SectionTitle(Fa.home.recentTitle, Modifier.padding(horizontal = 12.dp)) }
        if (recent.isEmpty()) {
            item { EmptyState(Fa.home.recentEmpty) }
        } else {
            item {
                Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                    recent.forEach { movement ->
                        RecentMovementRow(
                            movement = movement,
                            productName = productNames[movement.productId],
                            locationName = locationNames[movement.locationId],
                            onOpen = { onOpenProduct(movement.productId) },
                        )
                    }
                }
            }
        }

        item { SectionTitle(Fa.home.byLocation, Modifier.padding(horizontal = 12.dp)) }
        item {
            Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                perLocation.forEach { (name, qty) ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        Text(formatQty(qty), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        item {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    Fa.more.dataOnDevice,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** یک حرکت اخیر در خانه: نوع و کالا، تاریخ و مکان، و عدد با رنگ علامت. */
@Composable
private fun RecentMovementRow(
    movement: Movement,
    productName: String?,
    locationName: String?,
    onOpen: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onOpen)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                listOfNotNull(movementLabel(movement.type), productName).joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                listOfNotNull(
                    formatJalali(movement.at) + " · " + formatTime(movement.at),
                    locationName,
                ).joinToString(" · "),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            (if (movement.qty > 0) "+" else "−") + formatNumber(abs(movement.qty)),
            fontWeight = FontWeight.Bold,
            color = movementTone(movement.qty),
        )
    }
}
