package ir.plasco.managing.domain

import ir.plasco.managing.model.ID
import ir.plasco.managing.model.Product

/**
 * جست‌وجوی کالا — همان قاعده و امتیازهای نسخهٔ وب (AGENTS.md بخش ۶):
 * متن پرس‌وجو یکسان‌سازی می‌شود، به توکن می‌شکند و همهٔ توکن‌ها باید باشند (AND).
 * رتبه: بارکد دقیق > کد دقیق > پیشوند بارکد > پیشوند کد > پیشوند نام > توکن‌ها؛
 * تساوی با ترتیب فارسی روی نام یکسان‌سازی‌شده.
 */
data class SearchHit(val product: Product, val score: Int)

private const val SCORE_BARCODE_EXACT = 1000
private const val SCORE_CODE_EXACT = 900
private const val SCORE_BARCODE_PREFIX = 820
private const val SCORE_CODE_PREFIX = 800
private const val SCORE_NAME_PREFIX = 700
private const val SCORE_TOKEN_ALL = 500

fun searchProducts(
    query: String,
    products: List<Product>,
    brandNames: Map<ID, String> = emptyMap(),
    categoryNames: Map<ID, String> = emptyMap(),
    limit: Int = 200,
): List<SearchHit> = ProductSearchIndex(products, brandNames, categoryNames).search(query, limit)

/**
 * ایندکس جست‌وجو: متن/نام/کد/بارکد یکسان‌سازی‌شدهٔ هر کالا یک بار ساخته می‌شود و
 * بین تایپ‌ها بازاستفاده می‌شود. جست‌وجوی سرِ هر کلید قبلاً متن همهٔ کالاها را از
 * نو می‌ساخت و روی چند هزار کالا تایپ را کند می‌کرد.
 */
class ProductSearchIndex(
    products: List<Product>,
    brandNames: Map<ID, String> = emptyMap(),
    categoryNames: Map<ID, String> = emptyMap(),
) {
    private class Entry(
        val product: Product,
        val nameN: String,
        val codeN: String,
        val barcodesN: List<String>,
        val tokens: List<String>,
    )

    private val entries: List<Entry> = products.map { product ->
        val haystack = normalizeFa(
            listOfNotNull(
                product.name,
                product.variant,
                product.family,
                product.code,
                brandNames[product.brandId],
                categoryNames[product.categoryId],
                product.barcodes.joinToString(" "),
            ).filter { it.isNotEmpty() }.joinToString(" "),
        )
        Entry(
            product = product,
            nameN = normalizeFa(product.name),
            codeN = normalizeFa(product.code),
            barcodesN = product.barcodes.map { normalizeFa(it) }.filter { it.isNotEmpty() },
            tokens = haystack.split(' ').filter { it.isNotEmpty() }.distinct(),
        )
    }

    // Collator فقط رشته مقایسه می‌کند، پس ترتیب فهرست از نام خام انتخاب می‌شود.
    private val byName: List<Entry> = entries.sortedWith(compareBy(persianCollator()) { it.product.name })

    /** فهرست کامل کالاها با ترتیب نام (برای وقتی پرس‌وجویی تایپ نشده). */
    fun all(): List<Product> = byName.map { it.product }

    fun search(query: String, limit: Int = Int.MAX_VALUE): List<SearchHit> {
        val normalizedQuery = normalizeFa(query)
        if (normalizedQuery.isEmpty()) {
            return byName.take(limit).map { SearchHit(it.product, 0) }
        }
        val tokens = normalizedQuery.split(' ').filter { it.isNotEmpty() }
        val collator = persianCollator()

        val scored = ArrayList<Pair<Entry, Int>>()
        for (entry in entries) {
            val barcodeExact = entry.barcodesN.contains(normalizedQuery)
            val score = when {
                barcodeExact || entry.codeN == normalizedQuery ->
                    if (barcodeExact) SCORE_BARCODE_EXACT else SCORE_CODE_EXACT
                entry.barcodesN.any { it.startsWith(normalizedQuery) } -> SCORE_BARCODE_PREFIX
                entry.codeN.startsWith(normalizedQuery) -> SCORE_CODE_PREFIX
                entry.nameN.startsWith(normalizedQuery) -> SCORE_NAME_PREFIX
                else -> {
                    // هر توکنِ پرس‌وجو باید پیشوند یکی از توکن‌های کالا باشد.
                    val matched = tokens.count { token -> entry.tokens.any { it.startsWith(token) } }
                    if (matched == tokens.size) SCORE_TOKEN_ALL + matched else 0
                }
            }
            if (score > 0) scored += entry to score
        }
        scored.sortWith(
            compareByDescending<Pair<Entry, Int>> { it.second }
                .thenComparator { a, b -> collator.compare(a.first.nameN, b.first.nameN) },
        )
        return scored.take(limit).map { SearchHit(it.first.product, it.second) }
    }
}
