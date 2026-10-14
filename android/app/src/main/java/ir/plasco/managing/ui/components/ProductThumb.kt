package ir.plasco.managing.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.model.ID
import ir.plasco.managing.ui.LocalAppContainer

/**
 * عکس کالا؛ اگر عکسی نباشد حرف اول نام نشان داده می‌شود (مثل نسخهٔ وب که جای عکس
 * یک قاب خالی دارد، ولی اینجا حرف اول نام آشناتر است).
 */
@Composable
fun ProductThumb(
    productId: ID,
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    full: Boolean = false,
) {
    val bitmap = rememberProductPhoto(productId, full)
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                name.trim().take(1),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * عکس کالا از حافظهٔ نهان `PhotoStore` فوراً می‌آید و اگر نبود، یک بار از دیتابیس
 * خوانده می‌شود. با عوض شدن `photoStamps` (ذخیره یا حذف عکس، یا بازیابی بکاپ) از
 * نو خوانده می‌شود.
 */
@Composable
fun rememberProductPhoto(productId: ID?, full: Boolean = false): Bitmap? {
    val container = LocalAppContainer.current
    val stamps by container.hub.photoStamps.collectAsStateWithLifecycle()
    val stamp = productId?.let { stamps[it] }
    var bitmap by remember(productId, stamp, full) {
        mutableStateOf(container.photos.cached(productId, stamp, full))
    }
    LaunchedEffect(productId, stamp, full) {
        bitmap = if (productId == null || stamp == null) null else container.photos.bitmap(productId, stamp, full)
    }
    return bitmap
}
