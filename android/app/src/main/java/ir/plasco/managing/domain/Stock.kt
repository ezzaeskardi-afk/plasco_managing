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
) {
    val potentialProfit: Long get() = retail - cost
}

/**
 * ارزش‌گذاری: خرید = Σ(تعداد × buyPrice)، فروش = Σ(تعداد × retailPrice)،
 * سود بالقوه = فروش − خرید. کالای غیرفعال حساب نمی‌شود و تعداد ≤ ۰ صفر می‌شود.
 */
fun valuate(products: List<Product>, levels: List<StockLevel>): ValuationSummary {
    val totals = productTotals(levels)
    var pieces = 0
    var skuCount = 0
    var productCount = 0
    var cost = 0L
    var retail = 0L
    for (product in products) {
        if (!product.active || product.deletedAt != null) continue
        productCount += 1
        val total = maxOf(0, totals[product.id] ?: 0)
        if (total <= 0) continue
        skuCount += 1
        pieces += total
        cost += total.toLong() * product.buyPrice
        retail += total.toLong() * product.retailPrice
    }
    return ValuationSummary(pieces, skuCount, productCount, cost, retail)
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
