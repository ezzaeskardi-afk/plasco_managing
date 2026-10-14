package ir.plasco.managing.ui.scan

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.annotation.OptIn as AndroidxOptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import ir.plasco.managing.ui.Fa
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

/** یک بارکد چند بار پشت‌سرهم خوانده می‌شود؛ تا این مدت دوباره گزارش نمی‌شود. */
private const val DEDUP_WINDOW_MS = 1_500L

/**
 * خواندن بارکد با دوربین گوشی.
 *
 * یک دیالوگ تمام‌صفحه که تا اولین بارکد باز می‌ماند و بعد از تحویل مقدار، خودِ
 * صفحهٔ صداکننده آن را می‌بندد. تحلیل تصویر با ML Kit **نسخهٔ همراه** است (مدل
 * داخل APK)، پس مثل بقیهٔ برنامه آفلاین کار می‌کند و هیچ درخواستی به اینترنت ندارد.
 */
@Composable
fun BarcodeScannerDialog(
    onResult: (String) -> Unit,
    onDismiss: () -> Unit,
    hint: String = Fa.scan.hint,
) {
    val context = LocalContext.current
    var granted by remember {
        mutableStateOf(context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    var deniedOnce by remember { mutableStateOf(false) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok
        deniedOnce = true
    }

    LaunchedEffect(Unit) {
        if (!granted) ask.launch(Manifest.permission.CAMERA)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            if (granted) {
                CameraScanner(onResult = onResult, onClose = onDismiss, hint = hint)
            } else {
                PermissionPane(
                    deniedOnce = deniedOnce,
                    onAsk = { ask.launch(Manifest.permission.CAMERA) },
                    onOpenSettings = { openAppSettings(context) },
                    onClose = onDismiss,
                )
            }
        }
    }
}

@Composable
private fun CameraScanner(onResult: (String) -> Unit, onClose: () -> Unit, hint: String) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    val executor: ExecutorService = remember { Executors.newSingleThreadExecutor() }
    val providerRef = remember { AtomicReference<ProcessCameraProvider?>(null) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var torchOn by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    // لامبدای بیرونی ممکن است عوض شود؛ تحلیلگر باید همیشه تازه‌ترین را صدا بزند.
    val currentOnResult by rememberUpdatedState(onResult)

    DisposableEffect(lifecycleOwner) {
        // اگر خوانندهٔ بارکد روی این گوشی بالا نیاید، پیام فارسی می‌دهیم نه کرش.
        val scanner = runCatching {
            BarcodeScanning.getClient(
                BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS).build(),
            )
        }.getOrNull()
        val future = ProcessCameraProvider.getInstance(context)
        val onMain = java.util.concurrent.Executor { command -> Handler(Looper.getMainLooper()).post(command) }
        future.addListener(
            {
                try {
                    val provider = future.get()
                    providerRef.set(provider)
                    val activeScanner = scanner
                    if (activeScanner == null) {
                        failed = true
                        return@addListener
                    }
                    val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                    analysis.setAnalyzer(executor, barcodeAnalyzer(activeScanner) { value ->
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        currentOnResult(value)
                    })
                    provider.unbindAll()
                    camera = provider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        analysis,
                    )
                } catch (_: Throwable) {
                    failed = true
                }
            },
            onMain,
        )
        onDispose {
            providerRef.get()?.unbindAll()
            scanner?.close()
            executor.shutdown()
        }
    }

    LaunchedEffect(torchOn, camera) {
        camera?.cameraControl?.enableTorch(torchOn)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())

        Column(
            modifier = Modifier.fillMaxSize().systemBarsPadding().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(
                    onClick = onClose,
                    colors = ButtonDefaults.textButtonColors(contentColor = Color.White),
                ) { Text(Fa.scan.close) }
                Spacer(Modifier.weight(1f))
                TextButton(
                    onClick = { torchOn = !torchOn },
                    colors = ButtonDefaults.textButtonColors(contentColor = if (torchOn) Color.Yellow else Color.White),
                ) { Text(Fa.scan.torch) }
            }

            Spacer(Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp)
                    .border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(16.dp)),
            )
            Spacer(Modifier.height(12.dp))
            Text(
                if (failed) Fa.scan.noCamera else hint,
                color = Color.White,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyLarge,
            )
            Spacer(Modifier.weight(1f))
        }
    }
}

/**
 * هر فریم را به ML Kit می‌دهد؛ عکس تا پایان پردازش بسته نمی‌شود (وگرنه ML Kit
 * فریم را از دست می‌دهد) و فقط فریم‌های تازه تحلیل می‌شوند.
 */
@AndroidxOptIn(ExperimentalGetImage::class)
private fun barcodeAnalyzer(scanner: BarcodeScanner, onValue: (String) -> Unit): ImageAnalysis.Analyzer {
    var lastValue = ""
    var lastAt = 0L
    return ImageAnalysis.Analyzer { image ->
        val mediaImage = image.image
        if (mediaImage == null) {
            image.close()
            return@Analyzer
        }
        val input = InputImage.fromMediaImage(mediaImage, image.imageInfo.rotationDegrees)
        scanner.process(input)
            .addOnSuccessListener { barcodes ->
                val value = barcodes.firstNotNullOfOrNull { it.rawValue?.takeIf(String::isNotBlank) }
                    ?: return@addOnSuccessListener
                val now = System.currentTimeMillis()
                if (value == lastValue && now - lastAt < DEDUP_WINDOW_MS) return@addOnSuccessListener
                lastValue = value
                lastAt = now
                onValue(value)
            }
            .addOnCompleteListener { image.close() }
    }
}

@Composable
private fun PermissionPane(
    deniedOnce: Boolean,
    onAsk: () -> Unit,
    onOpenSettings: () -> Unit,
    onClose: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().systemBarsPadding().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            Fa.scan.denied,
            color = Color.White,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodyLarge,
        )
        if (deniedOnce) {
            Spacer(Modifier.height(8.dp))
            Text(
                Fa.scan.deniedHint,
                color = Color.White,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.labelMedium,
            )
        }
        Spacer(Modifier.height(16.dp))
        Button(onClick = onAsk) { Text(Fa.scan.allow) }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
            onClick = onOpenSettings,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
        ) { Text(Fa.scan.appSettings) }
        Spacer(Modifier.height(8.dp))
        TextButton(
            onClick = onClose,
            colors = ButtonDefaults.textButtonColors(contentColor = Color.White),
        ) { Text(Fa.scan.close) }
    }
}

private fun openAppSettings(context: Context) {
    val intent = Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.fromParts("package", context.packageName, null),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
}
