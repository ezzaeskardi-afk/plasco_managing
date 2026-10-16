package ir.plasco.managing.domain

import ir.plasco.managing.model.Product

/**
 * تطبیق بارکد — همان قاعدهٔ نسخهٔ وب: بارکد، بعد کد کالا.
 *
 * خواندن با دوربین ممکن است رقم فارسی، فاصله یا خط تیره برگرداند و بارکد یک کالا
 * ممکن است ۱۲ رقمی (UPC-A) یا ۱۳ رقمی با صفر ابتدایی (EAN-13) ذخیره شده باشد؛
 * هر دو یک کالا هستند، پس هر دو شکل بررسی می‌شود.
 */
fun normalizeBarcode(raw: String): String = normalizeFa(raw).filter { it.isLetterOrDigit() }

/** همهٔ شکل‌هایی که یک بارکد ممکن است با آن ذخیره شده باشد. */
fun barcodeKeys(raw: String): List<String> {
    val value = normalizeBarcode(raw)
    if (value.isEmpty()) return emptyList()
    val keys = linkedSetOf(value)
    keys += value.trimStart('0').ifEmpty { "0" }
    if (value.length == 12) keys += "0$value"
    return keys.toList()
}

/** متن چندخطی/جداشده با ویرگول یا فاصله را به فهرست بارکد یکتا تبدیل می‌کند. */
fun parseBarcodeList(text: String): List<String> = text
    .split('\n', ',', '،', ';', '\t', ' ')
    .map { normalizeBarcode(it) }
    .filter { it.isNotEmpty() }
    .distinct()

/** کالایی که این بارکد (یا کد کالای) مال اوست؛ پیدا نشد → null. */
fun findProductByBarcode(products: List<Product>, raw: String): Product? {
    val keys = barcodeKeys(raw)
    if (keys.isEmpty()) return null
    products.firstOrNull { product -> product.barcodes.any { normalizeBarcode(it) in keys } }?.let { return it }
    // کد کالا هم مثل بارکد با همهٔ شکل‌ها بررسی می‌شود: خواندن ۱۲ رقمی باید کد
    // ۱۳ رقمیِ صفر-ابتدایی را هم پیدا کند و برعکس (قبلاً فقط keys.first() آمد).
    return products.firstOrNull { product -> normalizeBarcode(product.code) in keys }
}
