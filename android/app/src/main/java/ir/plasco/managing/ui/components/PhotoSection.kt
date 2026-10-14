package ir.plasco.managing.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import ir.plasco.managing.data.PhotoCodec
import ir.plasco.managing.model.ID
import ir.plasco.managing.ui.Fa
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * بخش عکس کالا در فرم: پیش‌نمایش، «افزودن عکس» (گالری یا دوربین) و «حذف عکس».
 *
 * عکس مثل بقیهٔ فیلدهای فرم **با ذخیرهٔ فرم** ثبت می‌شود (نسخهٔ وب هم همین کار را
 * می‌کند: `if (photoFile && productId) await putPhoto(...)`). پس اگر کاربر فرم را
 * رها کند، نه عکسی ذخیره می‌شود و نه عکسی پاک.
 */
@Composable
fun PhotoSection(
    productId: ID?,
    pending: ByteArray?,
    onPending: (ByteArray?) -> Unit,
    cleared: Boolean,
    onCleared: () -> Unit,
    onMessage: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val stored = rememberProductPhoto(productId, full = true)

    var chooserOpen by remember { mutableStateOf(false) }
    var confirmRemove by remember { mutableStateOf(false) }
    var cameraFile by remember { mutableStateOf<File?>(null) }
    var pendingPreview by remember(pending) { mutableStateOf<Bitmap?>(null) }

    LaunchedEffect(pending) {
        pendingPreview = if (pending == null) null else withContext(Dispatchers.Default) { PhotoCodec.preview(pending) }
    }

    // هر عکسی که خوانده نشود، به فرم راه پیدا نمی‌کند.
    val accept: (ByteArray) -> Unit = { bytes ->
        scope.launch {
            val readable = withContext(Dispatchers.Default) { PhotoCodec.preview(bytes) } != null
            if (readable) onPending(bytes) else onMessage(Fa.photos.failed)
        }
    }

    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            scope.launch {
                val bytes = withContext(Dispatchers.IO) { readBytes(context, uri) }
                if (bytes == null) onMessage(Fa.photos.failed) else accept(bytes)
            }
        }
    }

    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val file = cameraFile
        cameraFile = null
        if (ok && file != null) {
            scope.launch {
                val bytes = withContext(Dispatchers.IO) { runCatching { file.readBytes() }.getOrNull() }
                file.delete()
                if (bytes == null) onMessage(Fa.photos.failed) else accept(bytes)
            }
        } else {
            file?.delete()
        }
    }

    val preview = pendingPreview ?: if (!cleared) stored else null

    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(96.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            if (preview != null) {
                Image(
                    bitmap = preview.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Text(
                    Fa.photos.empty,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                Fa.photos.hint,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { chooserOpen = true }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(Fa.photos.add)
            }
            if (preview != null) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        // عکسِ انتخاب‌شده ولی ذخیره‌نشده فقط از فرم برداشته می‌شود.
                        if (pending != null) onPending(null) else confirmRemove = true
                    },
                ) {
                    Icon(Icons.Filled.Delete, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text(Fa.photos.remove)
                }
            }
            val note = when {
                pending != null -> Fa.photos.pendingHint
                cleared -> Fa.photos.clearHint
                else -> null
            }
            if (note != null) {
                Spacer(Modifier.height(6.dp))
                Text(note, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

    if (chooserOpen) {
        AlertDialog(
            onDismissRequest = { chooserOpen = false },
            title = { Text(Fa.photos.add) },
            text = { Text(Fa.photos.chooseBody) },
            confirmButton = {
                TextButton(onClick = {
                    chooserOpen = false
                    gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }) { Text(Fa.photos.gallery) }
            },
            dismissButton = {
                TextButton(onClick = {
                    chooserOpen = false
                    val file = newCameraFile(context)
                    cameraFile = file
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                    if (runCatching { camera.launch(uri) }.isFailure) onMessage(Fa.photos.noCamera)
                }) { Text(Fa.photos.camera) }
            },
        )
    }

    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text(Fa.photos.remove) },
            text = { Text(Fa.photos.removeConfirm) },
            confirmButton = {
                TextButton(onClick = {
                    confirmRemove = false
                    onCleared()
                }) { Text(Fa.common.delete) }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text(Fa.common.cancel) } },
        )
    }
}

private fun readBytes(context: Context, uri: Uri): ByteArray? =
    runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()

/** فایل موقت دوربین در حافظهٔ پنهان برنامه؛ بعد از خواندن پاک می‌شود. */
private fun newCameraFile(context: Context): File {
    val dir = File(context.cacheDir, "camera").apply { mkdirs() }
    return File(dir, "photo-${System.currentTimeMillis()}.jpg")
}
