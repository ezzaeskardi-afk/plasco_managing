package ir.plasco.managing.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.domain.ProductSearchIndex
import ir.plasco.managing.domain.productTotals
import ir.plasco.managing.model.ID
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.components.EmptyState
import ir.plasco.managing.ui.components.ProductRow
import ir.plasco.managing.ui.components.ScreenHeader

@Composable
fun ProductsScreen(onOpenProduct: (ID) -> Unit, onNewProduct: () -> Unit) {
    val container = LocalAppContainer.current
    val products by container.hub.products.collectAsStateWithLifecycle()
    val levels by container.hub.levels.collectAsStateWithLifecycle()
    val brands by container.hub.brands.collectAsStateWithLifecycle()
    val categories by container.hub.categories.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }

    val totals = remember(levels) { productTotals(levels) }
    val brandNames = remember(brands) { brands.associate { it.id to it.name } }
    val categoryNames = remember(categories) { categories.associate { it.id to it.name } }
    val index = remember(products, brandNames, categoryNames) {
        ProductSearchIndex(products, brandNames, categoryNames)
    }
    // بدون پرس‌وجو همهٔ کالاها نشان داده می‌شوند (قبلاً بی‌سروصدا به ۲۰۰ تا بریده می‌شد).
    val results = remember(query, index) {
        if (query.isBlank()) index.all() else index.search(query).map { it.product }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        ScreenHeader(
            title = Fa.products.title,
            subtitle = "${results.size} کالا",
            action = { Button(onClick = onNewProduct) { Text(Fa.products.newProduct) } },
        )
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text(Fa.common.search) },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(horizontal = 12.dp),
        )
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            if (products.isEmpty()) {
                item { EmptyState(Fa.products.empty, Fa.products.newProduct, onNewProduct) }
            } else if (results.isEmpty()) {
                item { EmptyState(Fa.products.noResult) }
            } else {
                items(results, key = { it.id }) { product ->
                    ProductRow(
                        product = product,
                        total = totals[product.id] ?: 0,
                        brandName = brandNames[product.brandId],
                        onClick = { onOpenProduct(product.id) },
                    )
                }
            }
        }
    }
}
