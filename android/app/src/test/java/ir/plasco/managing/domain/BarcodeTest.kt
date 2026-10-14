package ir.plasco.managing.domain

import ir.plasco.managing.model.Product
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private fun product(id: String, code: String, barcodes: List<String> = emptyList()) = Product(
    id = id,
    code = code,
    name = "کالای $id",
    nameN = "کالای $id",
    barcodes = barcodes,
    createdAt = 0,
    updatedAt = 0,
)

class BarcodeTest {

    @Test
    fun `scanned value becomes digits and latin letters`() {
        // فاصله، خط تیره و رقم فارسی همه در یک شکل یکسان جمع می‌شوند.
        assertEquals("6001234567890", normalizeBarcode(" 6001234567890 "))
        assertEquals("6001234567890", normalizeBarcode("۶۰۰۱۲۳۴۵۶۷۸۹۰"))
        assertEquals("60012ab", normalizeBarcode("600-12 AB"))
        assertEquals("", normalizeBarcode("   "))
    }

    @Test
    fun `upc-a and ean-13 with a leading zero are the same barcode`() {
        assertEquals(setOf("600123456789", "0600123456789"), barcodeKeys("600123456789").toSet())
        assertEquals(setOf("0600123456789", "600123456789"), barcodeKeys("0600123456789").toSet())
    }

    @Test
    fun `list text is split, cleaned and deduplicated`() {
        assertEquals(
            listOf("111", "222"),
            parseBarcodeList("۱۱۱\n222, 111، 222"),
        )
        assertEquals(emptyList<String>(), parseBarcodeList(" ,، \n"))
    }

    @Test
    fun `product is found by its barcode even with persian digits`() {
        val products = listOf(product("p1", "P-00001", listOf("6001234567890")))
        assertEquals("p1", findProductByBarcode(products, "6001234567890")?.id)
        assertEquals("p1", findProductByBarcode(products, "۶۰۰۱۲۳۴۵۶۷۸۹۰")?.id)
    }

    @Test
    fun `twelve digit scan finds the thirteen digit row`() {
        val products = listOf(product("p1", "P-00001", listOf("0600123456789")))
        assertEquals("p1", findProductByBarcode(products, "600123456789")?.id)
    }

    @Test
    fun `code of the product counts as a barcode`() {
        val products = listOf(product("p1", "P-00042"))
        assertEquals("p1", findProductByBarcode(products, "p-00042")?.id)
        assertEquals("p1", findProductByBarcode(products, "P-00042")?.id)
    }

    @Test
    fun `unknown barcode and empty scan find nothing`() {
        val products = listOf(product("p1", "P-00001", listOf("111")))
        assertNull(findProductByBarcode(products, "999"))
        assertNull(findProductByBarcode(products, "   "))
    }
}
