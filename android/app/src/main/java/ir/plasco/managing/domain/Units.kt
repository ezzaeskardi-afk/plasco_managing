package ir.plasco.managing.domain

/** بسته و عدد — ذخیره‌سازی همیشه «عدد» است (AGENTS.md بخش ۶). */
data class PacksAndPieces(val packs: Int, val pieces: Int)

/** سقف تعداد در کل برنامه (هم‌تراز با `clampInt` نسخهٔ وب). */
const val MAX_QTY = 9_999_999

/** packs × packSize + pieces */
fun piecesFrom(packs: Int, pieces: Int, packSize: Int): Int {
    val size = if (packSize >= 1) packSize else 1
    return packs * size + pieces
}

/** کارتن × تعداد در کارتن + عدد. هر سه ورودی منفی به صفر بسته می‌شوند. */
fun cartonPieces(cartons: Int, perCarton: Int, pieces: Int): Int {
    val c = if (cartons > 0) cartons else 0
    val s = if (perCarton > 0) perCarton else 0
    val p = if (pieces > 0) pieces else 0
    // Int×Int می‌تواند سرریز شود و تعداد را منفی نشان دهد؛ با Long حساب و
    // به سقف کسب‌وکار بسته می‌شود.
    return (c.toLong() * s + p).coerceAtMost(MAX_QTY.toLong()).toInt()
}

/** یک تعداد کل را به بسته + عدد می‌شکند. packSize = ۱ فقط عدد می‌دهد. */
fun splitPieces(total: Int, packSize: Int): PacksAndPieces {
    val size = if (packSize >= 1) packSize else 1
    if (size <= 1) return PacksAndPieces(0, total)
    val sign = if (total < 0) -1 else 1
    val abs = if (total < 0) -total else total
    return PacksAndPieces(sign * (abs / size), sign * (abs % size))
}
