package ir.plasco.managing.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.domain.formatNumber
import ir.plasco.managing.model.ID
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.components.EmptyState
import ir.plasco.managing.ui.components.ProductRow
import ir.plasco.managing.ui.components.ScreenHeader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/**
 * فهرست کالاها. از خانه می‌شود با فیلتر آمادهٔ مکان/برند/دسته وارد شد
 * (`products?location=…`) — همان کاری که کلیک روی ردیف‌های تفکیک داشبورد وب می‌کند.
 */
@Composable
fun ProductsScreen(
    onOpenProduct: (ID) -> Unit,
    onNewProduct: () -> Unit,
    initialLocationId: String = "",
    initialBrandId: String = "",
    initialCategoryId: String = "",
) {
    val container = LocalAppContainer.current
    val products by container.hub.products.collectAsStateWithLifecycle()
    val levels by container.hub.levels.collectAsStateWithLifecycle()
    val totals by container.hub.totals.collectAsStateWithLifecycle()
    val brands by container.hub.brands.collectAsStateWithLifecycle()
    val categories by container.hub.categories.collectAsStateWithLifecycle()
    val locations by container.hub.locations.collectAsStateWithLifecycle()
    val index by container.hub.searchIndex.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var locationFilter by rememberSaveable { mutableStateOf(initialLocationId) }
    var brandFilter by rememberSaveable { mutableStateOf(initialBrandId) }
    var categoryFilter by rememberSaveable { mutableStateOf(initialCategoryId) }

    // جست‌وجو ۱۲۰ms بعد از آخرین کلید اجرا می‌شود و روی ترد پس‌زمینه؛
    // روی گوشی ضعیف، هر کلید دیگر ایندکس ۵٬۰۰۰ کالا را نمی‌گردد.
    var settledQuery by remember { mutableStateOf(query) }
    LaunchedEffect(query) {
        if (query == settledQuery) return@LaunchedEffect
        delay(120)
        settledQuery = query
    }
    var results by remember { mutableStateOf(index.all()) }
    LaunchedEffect(index, settledQuery) {
        results = withContext(Dispatchers.Default) {
            if (settledQuery.isBlank()) index.all() else index.search(settledQuery).map { it.product }
        }
    }

    val brandNames = remember(brands) { brands.associate { it.id to it.name } }
    val categoryNames = remember(categories) { categories.associate { it.id to it.name } }
    // کالاهایی که در این مکان موجودی مثبت دارند — قاعدهٔ فیلتر مکان نسخهٔ وب.
    val positiveAt = remember(levels) {
        levels.asSequence().filter { it.qty > 0 }.map { it.productId to it.locationId }.toHashSet()
    }
    val filtered = remember(results, locationFilter, brandFilter, categoryFilter, positiveAt) {
        results.filter { product ->
            (locationFilter.isEmpty() || positiveAt.contains(product.id to locationFilter)) &&
                (brandFilter.isEmpty() || product.brandId == brandFilter) &&
                (categoryFilter.isEmpty() || product.categoryId == categoryFilter)
        }
    }
    // با هر پرس‌وجو/فیلتر تازه از بالای فهرست شروع می‌شود، ولی برگشتن به تب
    // همان جای قبلی را نگه می‌دارد (کلیدها عوض نشده‌اند).
    val listState = rememberSaveable(
        settledQuery,
        locationFilter,
        brandFilter,
        categoryFilter,
        saver = LazyListState.Saver,
    ) { LazyListState() }

    Column(modifier = Modifier.fillMaxSize()) {
        ScreenHeader(
            title = Fa.products.title,
            subtitle = "${formatNumber(filtered.size)} ${Fa.products.countLabel}",
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
        if (locationFilter.isNotEmpty() || brandFilter.isNotEmpty() || categoryFilter.isNotEmpty()) {
            Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
                if (locationFilter.isNotEmpty()) {
                    ActiveFilterChip(
                        label = locations.firstOrNull { it.id == locationFilter }?.name ?: Fa.common.unknown,
                        onClear = { locationFilter = "" },
                    )
                }
                if (brandFilter.isNotEmpty()) {
                    ActiveFilterChip(
                        label = brandNames[brandFilter] ?: Fa.common.unknown,
                        onClear = { brandFilter = "" },
                    )
                }
                if (categoryFilter.isNotEmpty()) {
                    ActiveFilterChip(
                        label = categoryNames[categoryFilter] ?: Fa.common.unknown,
                        onClear = { categoryFilter = "" },
                    )
                }
            }
        }
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            if (products.isEmpty()) {
                item { EmptyState(Fa.products.empty, Fa.products.newProduct, onNewProduct) }
            } else if (filtered.isEmpty()) {
                item { EmptyState(Fa.products.noResult, Fa.products.newProduct, onNewProduct) }
            } else {
                items(filtered, key = { it.id }) { product ->
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

/** چیپ فیلتر فعال با ضربدر پاک‌کردن — مثل چیپ‌های صفحهٔ کالاهای وب. */
@Composable
private fun ActiveFilterChip(label: String, onClear: () -> Unit) {
    FilterChip(
        selected = true,
        onClick = onClear,
        label = { Text(label) },
        trailingIcon = {
            Icon(Icons.Filled.Close, contentDescription = Fa.common.delete, modifier = Modifier.padding(0.dp))
        },
        modifier = Modifier.padding(end = 8.dp),
    )
}

