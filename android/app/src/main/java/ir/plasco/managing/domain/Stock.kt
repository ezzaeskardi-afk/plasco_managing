package ir.plasco.managing.domain

import ir.plasco.managing.model.ID
import ir.plasco.managing.model.Product
import ir.plasco.managing.model.StockLevel
import ir.plasco.managing.model.StockState

/** وضعیت موجودی و نشانگر پشته — AGENTS.md بخش‌های ۶ و ۸. */
fun stockState(total: Int, minStock: Int?): StockState {
    if (total <= 0) return StockState.Out
    if (minStock != null && minStock > 0 && total <= minStock) return StockState.Low
    return StockState.Ok
}

/** ۰ تا ۴ میله. صفر یعنی «ناموجود» (در UI با خط‌چین). */
fun stackLevel(total: Int, minStock: Int?): Int {
    if (total <= 0) return 0
    if (minStock != null && minStock > 0) {
        val ratio = total.toDouble() / minStock
        return when {
            ratio <= 1 -> 1
            ratio <= 2 -> 2
            ratio <= 4 -> 3
            else -> 4
        }
    }
    return when {
        total <= 9 -> 1
        total <= 49 -> 2
        total <= 199 -> 3
        else -> 4
    }
}

/** مجموع موجودی هر کالا در همهٔ مکان‌ها. */
fun productTotals(levels: List<StockLevel>): Map<ID, Int> {
    val totals = HashMap<ID, Int>()
    for (level in levels) {
        if (level.qty == 0) continue
        totals[level.productId] = (totals[level.productId] ?: 0) + level.qty
    }
    return totals
}

data class GroupValuation(
    val id: ID,
    val label: String? = null,
    val pieces: Int = 0,
    val skuCount: Int = 0,
    val cost: Long = 0,
    val retail: Long = 0,
)

data class ValuationSummary(
    val pieces: Int = 0,
    val skuCount: Int = 0,
    val productCount: Int = 0,
    val cost: Long = 0,
    val retail: Long = 0,
    val byLocation: List<GroupValuation> = emptyList(),
    val byBrand: List<GroupValuation> = emptyList(),
    val byCategory: List<GroupValuation> = emptyList(),
) {
    val potentialProfit: Long get() = retail - cost
}

private fun sortedGroups(acc: Map<ID, GroupValuation>): List<GroupValuation> =
    acc.values.sortedWith(compareByDescending<GroupValuation> { it.retail }.thenByDescending { it.pieces })

/**
 * ارزش‌گذاری: خرید = Σ(تعداد × buyPrice)، فروش = Σ(تعداد × retailPrice)،
 * سود بالقوه = فروش − خرید. کالای غیرفعال حساب نمی‌شود و تعداد ≤ ۰ صفر می‌شود.
 * سه گروه مکان/برند/دسته هم مثل `src/domain/valuation.ts` ساخته می‌شوند تا خانه
 * بتواند مثل نسخهٔ وب تفکیک نشان دهد.
 */
fun valuate(products: List<Product>, levels: List<StockLevel>): ValuationSummary {
    val totals = productTotals(levels)
    val active = products.filter { it.active && it.deletedAt == null }
    val activeById: Map<ID, Product> = active.associateBy { it.id }
    var pieces = 0
    var skuCount = 0
    var productCount = 0
    var cost = 0L
    var retail = 0L
    for (product in active) {
        productCount += 1
        val total = maxOf(0, totals[product.id] ?: 0)
        if (total <= 0) continue
        skuCount += 1
        pieces += total
        cost += total.toLong() * product.buyPrice
        retail += total.toLong() * product.retailPrice
    }

    // مکان: هر سطح مثبت یک سهم است (کالای غیرفعال یا حذف‌شده حساب نمی‌شود).
    val locationAcc = HashMap<ID, GroupValuation>()
    for (level in levels) {
        if (level.qty <= 0) continue
        val product = activeById[level.productId] ?: continue
        val current = locationAcc[level.locationId] ?: GroupValuation(level.locationId)
        locationAcc[level.locationId] = current.copy(
            pieces = current.pieces + level.qty,
            skuCount = current.skuCount + 1,
            cost = current.cost + level.qty.toLong() * product.buyPrice,
            retail = current.retail + level.qty.toLong() * product.retailPrice,
        )
    }

    // برند و دسته: هر کالای دارای موجودی یک سهم است.
    val brandAcc = HashMap<ID, GroupValuation>()
    val categoryAcc = HashMap<ID, GroupValuation>()
    for (product in active) {
        val total = maxOf(0, totals[product.id] ?: 0)
        if (total <= 0) continue
        val costShare = total.toLong() * product.buyPrice
        val retailShare = total.toLong() * product.retailPrice
        product.brandId?.let { brandId ->
            val current = brandAcc[brandId] ?: GroupValuation(brandId)
            brandAcc[brandId] = current.copy(
                pieces = current.pieces + total,
                skuCount = current.skuCount + 1,
                cost = current.cost + costShare,
                retail = current.retail + retailShare,
            )
        }
        product.categoryId?.let { categoryId ->
            val current = categoryAcc[categoryId] ?: GroupValuation(categoryId)
            categoryAcc[categoryId] = current.copy(
                pieces = current.pieces + total,
                skuCount = current.skuCount + 1,
                cost = current.cost + costShare,
                retail = current.retail + retailShare,
            )
        }
    }

    return ValuationSummary(
        pieces = pieces,
        skuCount = skuCount,
        productCount = productCount,
        cost = cost,
        retail = retail,
        byLocation = sortedGroups(locationAcc),
        byBrand = sortedGroups(brandAcc),
        byCategory = sortedGroups(categoryAcc),
    )
}

data class StockAlertRow(val product: Product, val total: Int, val state: StockState)

/** فهرست کالاهای کم‌موجود و ناموجود برای خانه. */
fun stockAlerts(products: List<Product>, levels: List<StockLevel>): Pair<List<StockAlertRow>, List<StockAlertRow>> {
    val totals = productTotals(levels)
    val low = mutableListOf<StockAlertRow>()
    val out = mutableListOf<StockAlertRow>()
    for (product in products) {
        if (!product.active || product.deletedAt != null) continue
        val total = totals[product.id] ?: 0
        when (stockState(total, product.minStock)) {
            StockState.Out -> out += StockAlertRow(product, total, StockState.Out)
            StockState.Low -> low += StockAlertRow(product, total, StockState.Low)
            StockState.Ok -> Unit
        }
    }
    // فوری‌ترین اول: ارزش کمبود، بعد نام.
    val collator = persianCollator()
    val deficitValue = { row: StockAlertRow ->
        maxOf(0, (row.product.minStock ?: 0) - row.total).toLong() * row.product.buyPrice
    }
    low.sortWith(compareByDescending<StockAlertRow> { deficitValue(it) }.thenComparator { a, b -> collator.compare(a.product.name, b.product.name) })
    out.sortWith { a, b -> collator.compare(a.product.name, b.product.name) }
    return low to out
}

/** مرتب‌سازی متن فارسی (به‌جای Intl.Collator نسخهٔ وب). */
fun persianCollator(): java.text.Collator {
    val collator = java.text.Collator.getInstance(java.util.Locale.forLanguageTag("fa-IR"))
    collator.strength = java.text.Collator.PRIMARY
    return collator
}
