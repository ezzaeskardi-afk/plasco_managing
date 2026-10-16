package ir.plasco.managing.domain

import ir.plasco.managing.model.ID
import ir.plasco.managing.model.Product

/**
 * جست‌وجوی کالا — همان قاعدهٔ نسخهٔ وب (AGENTS.md بخش ۶):
 * متن پرس‌وجو یکسان‌سازی می‌شود، به توکن می‌شکند و همهٔ توکن‌ها باید در متن کالا
 * باشند (AND). رتبه: بارکد/کد دقیق > شروع نام > تطابق توکن‌ها؛ تساوی با ترتیب فارسی.
 */
data class SearchHit(val product: Product, val score: Int)

private fun entryText(product: Product, brandName: String?, categoryName: String?): String = normalizeFa(
    listOfNotNull(
        product.name,
        product.variant,
        product.family,
        product.code,
        brandName,
        categoryName,
        product.barcodes.joinToString(" "),
    ).joinToString(" "),
)

fun searchProducts(
    query: String,
    products: List<Product>,
    brandNames: Map<ID, String> = emptyMap(),
    categoryNames: Map<ID, String> = emptyMap(),
    limit: Int = 200,
): List<SearchHit> {
    val tokens = normalizeTokens(query)
    val normalizedQuery = normalizeFa(query)
    val collator = persianCollator()
    if (tokens.isEmpty()) {
        return products.sortedWith { a, b -> collator.compare(a.name, b.name) }.take(limit)
            .map { SearchHit(it, 0) }
    }

    val hits = mutableListOf<SearchHit>()
    for (product in products) {
        var score = -1
        if (normalizeFa(product.code) == normalizedQuery ||
            product.barcodes.any { normalizeFa(it) == normalizedQuery }
        ) {
            score = 100
        } else {
            val text = entryText(product, brandNames[product.brandId], categoryNames[product.categoryId])
            if (text.startsWith(normalizedQuery)) {
                score = 50
            } else if (tokens.all { text.contains(it) }) {
                score = 10
            } else if (product.barcodes.any { code -> code.contains(normalizedQuery) }) {
                score = 40
            }
        }
        if (score >= 0) hits += SearchHit(product, score)
    }
    hits.sortWith(
        compareByDescending<SearchHit> { it.score }
            .thenComparator { a, b -> collator.compare(a.product.name, b.product.name) },
    )
    return hits.take(limit)
}
