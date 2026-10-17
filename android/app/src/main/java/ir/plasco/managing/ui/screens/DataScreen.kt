package ir.plasco.managing.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ir.plasco.managing.data.BackupInvalidException
import ir.plasco.managing.data.RestoreMode
import ir.plasco.managing.data.RestoreSummary
import ir.plasco.managing.domain.formatJalali
import ir.plasco.managing.domain.formatNumber
import ir.plasco.managing.ui.Fa
import ir.plasco.managing.ui.LocalAppContainer
import ir.plasco.managing.ui.LocalShowMessage
import ir.plasco.managing.ui.components.Panel
import ir.plasco.managing.ui.components.ScreenHeader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private data class PendingRestore(val bytes: ByteArray, val info: RestoreSummary) {
    // ByteArray در data class باید دستی مقایسه شود تا هشدار هم‌ارزی ندهد.
    override fun equals(other: Any?): Boolean = this === other
    override fun hashCode(): Int = bytes.contentHashCode()
}

@Composable
fun DataScreen(onBack: () -> Unit) {
    val container = LocalAppContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val showMessage = LocalShowMessage.current
    val settings by container.hub.settings.collectAsStateWithLifecycle()
    val products by container.hub.products.collectAsStateWithLifecycle()
    val movementCount by container.hub.movementCount.collectAsStateWithLifecycle()
    val photoStamps by container.hub.photoStamps.collectAsStateWithLifecycle()

    var pending by remember { mutableStateOf<PendingRestore?>(null) }
    var busy by remember { mutableStateOf(false) }
    var lastResult by remember { mutableStateOf<String?>(null) }

    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/zip"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        scope.launch {
            try {
                val (bytes, summary) = container.backup.createBackup()
                withContext(Dispatchers.IO) {
                    val stream = context.contentResolver.openOutputStream(uri)
                        ?: throw IllegalStateException(Fa.backup.fileFailed)
                    stream.use { it.write(bytes) }
                }
                lastResult = "${Fa.backup.created} — ${formatNumber(summary.products)} کالا، " +
                    "${formatNumber(summary.photos)} عکس، ${formatNumber(summary.movements)} حرکت، " +
                    "${formatNumber(summary.bytes / 1024)} کیلوبایت"
                showMessage(Fa.backup.created)
            } catch (error: Throwable) {
                showMessage(error.message ?: Fa.errors.failed)
            } finally {
                busy = false
            }
        }
    }

    val openLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        scope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) {
                    val stream = context.contentResolver.openInputStream(uri)
                        ?: throw IllegalStateException(Fa.backup.fileFailed)
                    stream.use { it.readBytes() }
                }
                pending = PendingRestore(bytes, container.backup.inspect(bytes))
            } catch (error: Throwable) {
                showMessage(restoreErrorText(error))
            } finally {
                busy = false
            }
        }
    }

    val doRestore: (RestoreMode) -> Unit = { mode ->
        val file = pending
        pending = null
        if (file != null) {
            busy = true
            scope.launch {
                try {
                    val result = container.backup.restore(file.bytes, mode)
                    val base = if (mode == RestoreMode.Replace) Fa.backup.restored else Fa.backup.restoredMerge
                    lastResult = "$base — ${formatNumber(result.products)} کالا، " +
                        "${formatNumber(result.photos)} عکس، ${formatNumber(result.movements)} حرکت" +
                        if (result.renumbered > 0) {
                            " · " + Fa.backup.renumbered.replace("{count}", formatNumber(result.renumbered))
                        } else {
                            ""
                        }
                    showMessage(base)
                } catch (error: Throwable) {
                    showMessage(restoreErrorText(error))
                } finally {
                    busy = false
                }
            }
        }
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item { ScreenHeader(title = Fa.backup.title, onBack = onBack) }

        item {
            Panel(modifier = Modifier.padding(horizontal = 12.dp)) {
                Text(Fa.backup.hint, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
                Text(
                    "${Fa.more.lastBackup}: " + (settings.lastBackupAt?.let { formatJalali(it) } ?: Fa.more.never),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    "${formatNumber(products.size)} کالا · ${formatNumber(photoStamps.size)} عکس · " +
                        "${formatNumber(movementCount)} حرکت",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    enabled = !busy,
                    onClick = { saveLauncher.launch(suggestedFileName()) },
                ) { Text(Fa.backup.create) }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    enabled = !busy,
                    onClick = { openLauncher.launch(arrayOf("application/zip", "application/json")) },
                ) { Text(Fa.backup.restore) }
                if (busy) {
                    Spacer(Modifier.height(8.dp))
                    Text(Fa.backup.working, style = MaterialTheme.typography.labelMedium)
                }
                lastResult?.let { text ->
                    Spacer(Modifier.height(8.dp))
                    Text(text, style = MaterialTheme.typography.labelMedium)
                }
            }
        }

        item {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    Fa.backup.storageNote,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    val file = pending
    if (file != null) {
        AlertDialog(
            onDismissRequest = { pending = null },
            title = { Text(Fa.backup.restoreTitle) },
            text = {
                Text(
                    Fa.backup.contents
                        .replace("{products}", formatNumber(file.info.products))
                        .replace("{photos}", formatNumber(file.info.photos))
                        .replace("{movements}", formatNumber(file.info.movements)) +
                        "\n\n" + Fa.backup.restoreBody,
                )
            },
            confirmButton = {
                TextButton(onClick = { doRestore(RestoreMode.Replace) }) { Text(Fa.backup.replace) }
            },
            dismissButton = {
                TextButton(onClick = { doRestore(RestoreMode.Merge) }) { Text(Fa.backup.merge) }
            },
        )
    }
}

/** نام پیشنهادی فایل، مثل نسخهٔ وب: plasco-backup-2026-10-14.zip */
private fun suggestedFileName(): String {
    val stamp = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    return "plasco-backup-$stamp.zip"
}

/**
 * پیام خطای بازیابی: «BackupInvalidException» علت را داخل detail دارد؛
 * فایل جدیدتر باید پیام خودش را بدهد (مثل backupNewer نسخهٔ وب) و خطای
 * خواندن فایل هم دیگر قاطی «فایل بکاپ نیست» نمی‌شود.
 */
private fun restoreErrorText(error: Throwable): String = when {
    error is BackupInvalidException ->
        if (error.detail?.startsWith("schema-newer:") == true) {
            Fa.backup.newerFile.replace("{version}", error.detail.substringAfter("schema-newer:"))
        } else {
            Fa.backup.invalid
        }
    else -> error.message ?: Fa.errors.failed
}
