package ir.plasco.managing.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.domain.displayProductName
import ir.plasco.managing.model.ID
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.LocalShowMessage
import ir.plasco.managing.ui.components.EmptyState
import ir.plasco.managing.ui.components.MovementRow
import ir.plasco.managing.ui.components.ScreenHeader
import kotlinx.coroutines.launch

@Composable
fun MovementsScreen(onNewMovement: () -> Unit, onOpenProduct: (ID) -> Unit) {
    val container = LocalAppContainer.current
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val movements by container.hub.movements.collectAsStateWithLifecycle()
    val products by container.hub.products.collectAsStateWithLifecycle()
    val locations by container.hub.locations.collectAsStateWithLifecycle()

    val productNames = remember(products) { products.associate { it.id to displayProductName(it.name) } }
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

        itemsIndexed(movements, key = { _, movement -> movement.id }) { index, movement ->
            Column {
                MovementRow(
                    movement = movement,
                    productName = productNames[movement.productId],
                    locationName = locationNames[movement.locationId],
                    alreadyUndone = undoneIds.contains(movement.id),
                    onOpenProduct = { onOpenProduct(movement.productId) },
                )
                if (index < movements.lastIndex) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
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
