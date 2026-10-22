package ir.plasco.managing.domain

import ir.plasco.managing.model.Product
import ir.plasco.managing.model.StockLevel
import ir.plasco.managing.model.StockState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NormalizeFaTest {

    @Test
    fun `arabic letters and digits become persian and latin`() {
        // ي و ك عربی به ی و ک فارسی، رقم فارسی به لاتین.
        // (نویسه‌ها با کد نوشته شده‌اند تا «ی عربی» و «ی فارسی» قاطی نشود.)
        assertEquals("\u06CC\u06A9 12", normalizeFa("\u064A\u06A9 \u06F1\u06F2"))
        assertEquals("\u06A9\u062A\u0627\u0628", normalizeFa("\u0643\u062A\u0627\u0628"))
    }

    @Test
    fun `zwnj and diacritics are turned into spaces and removed`() {
        assertEquals("\u06A9\u062A\u0627\u0628 \u062E\u0648\u062F\u06A9\u0627\u0631", normalizeFa("\u06A9\u062A\u0627\u0628\u200C\u062E\u0648\u062F\u06A9\u0627\u0631"))
        assertEquals("\u0633\u0644\u0627\u0645", normalizeFa("\u0633\u064E\u0644\u0627\u0645"))
        assertEquals("\u062F\u0633\u062A\u0645\u0627\u0644", normalizeFa("\u062F\u0633\u062A\u0640\u0645\u0627\u0644"))
    }

    @Test
    fun `whitespace collapses and latin is lowercased`() {
        assertEquals("p-00001 \u0638\u0631\u0641", normalizeFa("  P-00001   \u0638\u0631\u0641  "))
        // فاصلهٔ سخت (NBSP) و نیم‌فاصله هم مثل `\s` جاوااسکریپت به فاصلهٔ ساده می‌شوند.
        assertEquals(
            "\u0638\u0631\u0641 \u0628\u0632\u0631\u06AF",
            normalizeFa("\u0638\u0631\u0641\u00A0\u0628\u0632\u0631\u06AF"),
        )
        assertEquals(
            "\u0638\u0631\u0641 \u0628\u0632\u0631\u06AF",
            normalizeFa("\u0638\u0631\u0641\u202F\u0628\u0632\u0631\u06AF"),
        )
    }

    @Test
    fun `tokens are unique`() {
        assertEquals(
            listOf("\u0638\u0631\u0641", "\u0628\u0632\u0631\u06AF"),
            normalizeTokens("\u0638\u0631\u0641 \u0628\u0632\u0631\u06AF \u0638\u0631\u0641"),
        )
    }
}

class NumbersTest {

    @Test
    fun `persian and arabic digits are accepted`() {
        assertEquals(12500.0, parseNumberInput("۱۲۵۰۰")!!, 0.0)
        assertEquals(12500.0, parseNumberInput("١٢٥٠٠")!!, 0.0)
    }

    @Test
    fun `group and decimal separators are accepted`() {
        assertEquals(12500.0, parseNumberInput("12,500")!!, 0.0)
        assertEquals(12500.0, parseNumberInput("12٬500")!!, 0.0)
        assertEquals(12.5, parseNumberInput("۱۲٫۵")!!, 0.0)
        // فاصله‌های یونیکد هم مثل `\s` نسخهٔ وب جداکننده‌اند (NBSP، باریک، تمام‌عرض).
        assertEquals(12500.0, parseNumberInput("12\u00A0500")!!, 0.0)
        assertEquals(12500.0, parseNumberInput("12\u202F500")!!, 0.0)
        assertEquals(12500.0, parseNumberInput("12\u3000500")!!, 0.0)
    }

    @Test
    fun `bad input returns null`() {
        assertNull(parseNumberInput(""))
        assertNull(parseNumberInput("سلام"))
        assertNull(parseNumberInput("۱۲٫"))
        // «٫۵» بدون رقم صحیح عدد نیست (هم‌رفتار با نسخهٔ وب؛ قبلاً ۰٫۵ می‌شد).
        assertNull(parseNumberInput("٫۵"))
        assertNull(parseNumberInput(".5"))
    }

    @Test
    fun `integer parsing rounds`() {
        assertEquals(13, parseIntegerInput("12.6"))
        assertEquals(-5, parseIntegerInput("−۵"))
        // عددی که در Int جا نمی‌شود null می‌دهد، نه مقدار بریده.
        assertNull(parseIntegerInput("999999999999999"))
        assertEquals(2_000_000_000, parseIntegerInput("2000000000"))
    }

    @Test
    fun `display uses persian digits and the arabic thousands separator`() {
        assertEquals("۱۲٬۵۰۰", formatNumber(12500))
        assertEquals("۱۲٬۵۰۰ تومان", formatMoney(12500))
        assertEquals("۱۲٫۵ هزار", formatCompact(12500))
        assertEquals("۳ میلیون", formatCompact(3_000_000))
        assertEquals("۱٫۱ میلیارد", formatCompact(1_100_000_000))
        // مثل نسخهٔ وب: گرد شدن به «۱۰۰۰ هزار» یک پله بالا می‌رود.
        assertEquals("۱ میلیارد", formatCompact(999_999_999L))
        assertEquals("۹۹۹٫۵ میلیون", formatCompact(999_500_000L))
        // پول Long است و در Int جا نمی‌شود؛ نبودِ این آزمون یک باگ برش را نگه می‌داشت.
        assertEquals("۳٬۰۰۰٬۰۰۰٬۰۰۰ تومان", formatMoney(3_000_000_000L))
    }

    @Test
    fun `empty product names show the placeholder`() {
        // نام خالی مجاز است (AGENTS.md بخش ۲۵)؛ فهرست‌ها جای خالی را «بدون نام» نشان می‌دهند.
        assertEquals("بدون نام", displayProductName(""))
        assertEquals("بدون نام", displayProductName("   "))
        assertEquals("ظرف", displayProductName("ظرف"))
    }
}

class UnitsTest {

    @Test
    fun `packs and pieces multiply`() {
        assertEquals(34, piecesFrom(3, 4, 10))
        assertEquals(4, piecesFrom(0, 4, 10))
    }

    @Test
    fun `single piece goods ignore packs`() {
        assertEquals(PacksAndPieces(0, 7), splitPieces(7, 1))
    }

    @Test
    fun `splitting keeps the sign`() {
        assertEquals(PacksAndPieces(2, 3), splitPieces(23, 10))
        assertEquals(PacksAndPieces(-2, -3), splitPieces(-23, 10))
    }

    @Test
    fun `cartons multiply by the per-carton count and add loose pieces`() {
        assertEquals(77, cartonPieces(3, 24, 5))
        assertEquals(5, cartonPieces(0, 24, 5))
        assertEquals(0, cartonPieces(2, 0, 0))
        assertEquals(0, cartonPieces(-2, 24, -3))
        assertEquals(MAX_QTY, cartonPieces(Int.MAX_VALUE, Int.MAX_VALUE, Int.MAX_VALUE))
    }
}

class CaretTest {

    @Test
    fun `digits right of the caret ignore separators`() {
        assertEquals(0, digitsRightOf("۱۲٬۳۴۵", 6))
        assertEquals(3, digitsRightOf("۱۲٬۳۴۵", 2))
        assertEquals(0, digitsRightOf("", 0))
    }

    @Test
    fun `caret keeps its digit anchor after regrouping`() {
        assertEquals(9, caretFromRight("۲٬۱۰۰٬۰۰۰", 0))
        assertEquals(5, caretFromRight("۲٬۱۰۰٬۰۰۰", 3))
        assertEquals(0, caretFromRight("۱۲", 2))
    }
}

class StockTest {

    private fun product(id: String, buy: Int = 100, retail: Int = 200, min: Int? = null, active: Boolean = true) =
        Product(
            id = id,
            code = "P-$id",
            name = "کالای $id",
            nameN = "کالای $id",
            buyPrice = buy,
            retailPrice = retail,
            minStock = min,
            active = active,
            createdAt = 0,
            updatedAt = 0,
        )

    @Test
    fun `state follows quantity and min stock`() {
        assertEquals(StockState.Out, stockState(0, 5))
        assertEquals(StockState.Low, stockState(5, 5))
        assertEquals(StockState.Ok, stockState(6, 5))
        assertEquals(StockState.Ok, stockState(1, null))
    }

    @Test
    fun `stack level follows the four bars rule`() {
        assertEquals(0, stackLevel(0, null))
        assertEquals(1, stackLevel(9, null))
        assertEquals(2, stackLevel(10, null))
        assertEquals(3, stackLevel(50, null))
        assertEquals(4, stackLevel(200, null))
        assertEquals(1, stackLevel(10, 10))
        assertEquals(2, stackLevel(15, 10))
        assertEquals(3, stackLevel(35, 10))
        assertEquals(4, stackLevel(100, 10))
    }

    @Test
    fun `valuation skips inactive and counts pieces once`() {
        val products = listOf(product("a", min = 3), product("b", active = false))
        val levels = listOf(
            StockLevel("a", "loc-shop", 4, null, 0),
            StockLevel("a", "loc-warehouse", 6, null, 0),
            StockLevel("b", "loc-shop", 9, null, 0),
        )
        val summary = valuate(products, levels)
        assertEquals(10, summary.pieces)
        assertEquals(1, summary.skuCount)
        // productCount فقط کالاهای فعال را می‌شمارد (کالای غیرفعال در ارزش‌گذاری نیست).
        assertEquals(1, summary.productCount)
        assertEquals(1_000L, summary.cost)
        assertEquals(2_000L, summary.retail)
        assertEquals(1_000L, summary.potentialProfit)
    }

    @Test
    fun `valuation groups by location brand and category`() {
        val products = listOf(
            product("a", buy = 100, retail = 200).copy(brandId = "brand-1", categoryId = "cat-1"),
            product("b", buy = 100, retail = 300).copy(brandId = "brand-1"),
            product("c", active = false).copy(brandId = "brand-2"),
        )
        val levels = listOf(
            StockLevel("a", "loc-shop", 5, null, 0),
            StockLevel("b", "loc-shop", 2, null, 0),
            StockLevel("a", "loc-warehouse", 0, null, 0),
            StockLevel("a", "loc-basement", 3, null, 0),
        )
        val summary = valuate(products, levels)
        // مکان: سطح صفر نباید گروه بسازد؛ مرتب‌سازی با ارزش فروش نزولی.
        assertEquals(listOf("loc-shop", "loc-basement"), summary.byLocation.map { it.id })
        val shop = summary.byLocation.first()
        assertEquals(7, shop.pieces)
        assertEquals(2, shop.skuCount)
        assertEquals(700L, shop.cost) // ۵×۱۰۰ + ۲×۱۰۰
        assertEquals(1_600L, shop.retail) // ۵×۲۰۰ + ۲×۳۰۰
        // برند/دسته: کالای غیرفعال نیاید و کالای بی‌دسته گروه «دسته» نسازد.
        assertEquals(listOf("brand-1"), summary.byBrand.map { it.id })
        assertEquals(10, summary.byBrand.first().pieces)
        assertEquals(2, summary.byBrand.first().skuCount)
        assertEquals(listOf("cat-1"), summary.byCategory.map { it.id })
        assertEquals(8, summary.byCategory.first().pieces) // ۵ + ۳ در دو مکان
        assertEquals(1, summary.byCategory.first().skuCount)
    }

    @Test
    fun `group sort breaks ties by pieces`() {
        val products = listOf(
            product("a", buy = 100, retail = 200).copy(brandId = "brand-a"),
            product("b", buy = 100, retail = 200).copy(brandId = "brand-b"),
        )
        val levels = listOf(
            StockLevel("b", "loc-shop", 7, null, 0),
            StockLevel("a", "loc-shop", 2, null, 0),
        )
        val summary = valuate(products, levels)
        // ارزش فروش برابر → تعداد بیشتر اول.
        assertEquals(listOf("brand-b", "brand-a"), summary.byBrand.map { it.id })
    }

    @Test
    fun `group ties keep the first seen order`() {
        val products = listOf(
            product("a", retail = 200).copy(brandId = "brand-a"),
            product("b", retail = 200).copy(brandId = "brand-b"),
        )
        val levels = listOf(
            StockLevel("a", "loc-shop", 2, null, 0),
            StockLevel("b", "loc-shop", 2, null, 0),
        )
        // ارزش و تعداد کاملاً برابر → ترتیب دیدنِ اول (مثل Map نسخهٔ وب).
        val summary = valuate(products, levels)
        assertEquals(listOf("brand-a", "brand-b"), summary.byBrand.map { it.id })
    }

    @Test
    fun `valuation skips blank brand and category ids`() {
        val products = listOf(product("a").copy(brandId = "", categoryId = ""))
        val levels = listOf(StockLevel("a", "loc-shop", 1, null, 0))
        // نسخهٔ وب فقط id غیرخالی را گروه می‌کند.
        val summary = valuate(products, levels)
        assertEquals(0, summary.byBrand.size)
        assertEquals(0, summary.byCategory.size)
    }

    @Test
    fun `alerts list low and out products`() {
        val products = listOf(product("low", min = 5), product("out", min = 1), product("fine", min = 1))
        val levels = listOf(
            StockLevel("low", "loc-shop", 5, null, 0),
            StockLevel("fine", "loc-shop", 20, null, 0),
        )
        val (low, out) = stockAlerts(products, levels)
        assertEquals(1, low.size)
        assertEquals("low", low.first().product.id)
        assertEquals(1, out.size)
        assertEquals("out", out.first().product.id)
    }

    @Test
    fun `search ranks exact code first and needs every token`() {
        val products = listOf(
            product("1").copy(name = "ظرف غذا", code = "P-00001"),
            product("2").copy(name = "ظرف بزرگ", code = "P-00002"),
        )
        val exact = searchProducts("P-00002", products)
        assertEquals("2", exact.first().product.id)
        assertEquals(1, searchProducts("ظرف بزرگ", products).size)
        assertEquals(0, searchProducts("ظرف یخچال", products).size)
    }

    @Test
    fun `search scores follow the web index`() {
        val products = listOf(
            product("code").copy(name = "بیسکویت", code = "P-00012"),
            product("name").copy(name = "P-00012 بیسکویت", code = "P-00099"),
            product("barcode").copy(name = "چیزی", code = "P-00077", barcodes = listOf("6001234567890")),
        )
        // کد دقیق (۹۰۰) بر پیشوند نام (۷۰۰) و توکن (۵۰۱) مقدم است.
        assertEquals("code", searchProducts("P-00012", products).first().product.id)
        // پیشوند کد (۸۰۰) هم از بقیه جلوتر است.
        assertEquals("code", searchProducts("P-0001", products).first().product.id)
        // بارکد دقیق (۱۰۰۰) بالاترین امتیاز را دارد.
        assertEquals("barcode", searchProducts("6001234567890", products).first().product.id)
        assertEquals(1000, searchProducts("6001234567890", products).first().score)
    }

    @Test
    fun `token matching is prefix based like the web`() {
        val products = listOf(product("1").copy(name = "ظرف غذای بزرگ", code = "P-00001"))
        // «غذا» پیشوند توکن «غذای» است و کافی است.
        assertEquals(1, searchProducts("غذا", products).size)
        assertEquals(1, searchProducts("ظرف بزرگ", products).size)
        assertEquals(0, searchProducts("ظرف کوچک", products).size)
    }
}
