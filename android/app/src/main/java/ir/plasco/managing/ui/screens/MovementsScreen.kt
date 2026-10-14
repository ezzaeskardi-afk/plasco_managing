package ir.plasco.managing.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.domain.formatJalali
import ir.plasco.managing.domain.formatNumber
import ir.plasco.managing.domain.formatTime
import ir.plasco.managing.model.ID
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.LocalShowMessage
import ir.plasco.managing.ui.components.EmptyState
import ir.plasco.managing.ui.components.ScreenHeader
import ir.plasco.managing.ui.components.movementLabel
import ir.plasco.managing.ui.components.movementTone
import kotlinx.coroutines.launch

@Composable
fun MovementsScreen(onNewMovement: () -> Unit, onOpenProduct: (ID) -> Unit) {
    val container = LocalAppContainer.current
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val movements by container.hub.movements.collectAsStateWithLifecycle()
    val products by container.hub.products.collectAsStateWithLifecycle()
    val locations by container.hub.locations.collectAsStateWithLifecycle()

    val productNames = remember(products) { products.associate { it.id to it.name } }
    val locationNames = remember(locations) { locations.associate { it.id to it.name } }
    // حرکتی که خودش واگرد شده، دکمهٔ واگرد ندارد.
    val undoneIds = remember(movements) { movements.mapNotNull { it.undoOf }.toSet() }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            ScreenHeader(
                title = Fa.movements.title,
                subtitle = "${movements.size} حرکت آخر",
                action = { Button(onClick = onNewMovement) { Text(Fa.movements.newMovement) } },
            )
        }

        if (movements.isEmpty()) {
            item { EmptyState(Fa.movements.empty, Fa.movements.newMovement, onNewMovement) }
        }

        items(movements, key = { it.id }) { movement ->
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            movementLabel(movement.type),
                            style = MaterialTheme.typography.bodyLarge,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            listOfNotNull(
                                locationNames[movement.locationId],
                                formatJalali(movement.at) + " · " + formatTime(movement.at),
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        (if (movement.qty > 0) "+" else "−") + formatNumber(if (movement.qty > 0) movement.qty else -movement.qty),
                        fontWeight = FontWeight.Bold,
                        color = movementTone(movement.type),
                    )
                }
                Spacer(Modifier.width(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { onOpenProduct(movement.productId) }) {
                        Text(productNames[movement.productId] ?: Fa.errors.noProduct)
                    }
                    if (movement.undoOf == null && !undoneIds.contains(movement.id)) {
                        TextButton(
                            onClick = {
                                scope.launch {
                                    try {
                                        container.stock.undo(movement.id)
                                        showMessage(Fa.movements.undone)
                                    } catch (error: Throwable) {
                                        showMessage(messageFor(error))
                                    }
                                }
                            },
                        ) { Text(Fa.common.undo) }
                    } else {
                        Text(
                            Fa.movements.undoneMark,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(12.dp),
                        )
                    }
                }
            }
        }

        item {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    Fa.movements.rebuildHint,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = {
                        scope.launch {
                            container.stock.rebuildLevels()
                            showMessage(Fa.movements.rebuilt)
                        }
                    },
                ) { Text(Fa.movements.rebuild) }
            }
        }
    }
}
