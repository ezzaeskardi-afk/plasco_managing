package ir.plasco.managing.domain

/** بسته و عدد — ذخیره‌سازی همیشه «عدد» است (AGENTS.md بخش ۶). */
data class PacksAndPieces(val packs: Int, val pieces: Int)

/** packs × packSize + pieces */
fun piecesFrom(packs: Int, pieces: Int, packSize: Int): Int {
    val size = if (packSize >= 1) packSize else 1
    return packs * size + pieces
}

/** یک تعداد کل را به بسته + عدد می‌شکند. packSize = ۱ فقط عدد می‌دهد. */
fun splitPieces(total: Int, packSize: Int): PacksAndPieces {
    val size = if (packSize >= 1) packSize else 1
    if (size <= 1) return PacksAndPieces(0, total)
    val sign = if (total < 0) -1 else 1
    val abs = if (total < 0) -total else total
    return PacksAndPieces(sign * (abs / size), sign * (abs % size))
}

/** متن کوتاه تعداد، مثلاً «۳ کارتن + ۴». */
fun describePieces(total: Int, packSize: Int, packLabel: String): String {
    if (packSize <= 1) return total.toString()
    val (packs, pieces) = splitPieces(total, packSize)
    return when {
        packs == 0 -> pieces.toString()
        pieces == 0 -> "$packs $packLabel"
        else -> "$packs $packLabel + $pieces"
    }
}
