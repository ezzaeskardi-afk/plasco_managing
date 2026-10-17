package ir.plasco.managing.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import ir.plasco.managing.domain.caretFromRight
import ir.plasco.managing.domain.digitsRightOf
import ir.plasco.managing.domain.formatNumber
import ir.plasco.managing.domain.parseIntegerInput

/**
 * ورودی عددی؛ هرگز type=number نیست و رقم فارسی را هم می‌پذیرد.
 * با `groupThousands` موقع تایپ سهرقمی جدا می‌شود (۲٬۱۰۰٬۰۰۰) و مکان‌نما
 * روی همان رقمی می‌ماند که بود؛ `suffix` برچسب واحد را ته فیلد می‌گذارد.
 */
@Composable
fun NumberField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    decimal: Boolean = false,
    singleLine: Boolean = true,
    groupThousands: Boolean = false,
    suffix: String? = null,
) {
    val keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number)
    val supportingText: (@Composable () -> Unit)? = supporting?.let { text -> { Text(text) } }
    val suffixSlot: (@Composable () -> Unit)? = suffix?.let { text ->
        {
            Text(
                text,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    if (!groupThousands) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            singleLine = singleLine,
            supportingText = supportingText,
            suffix = suffixSlot,
            keyboardOptions = keyboardOptions,
            textStyle = MaterialTheme.typography.bodyLarge,
            modifier = modifier.fillMaxWidth(),
        )
        return
    }

    // گروه‌بندی زنده: متنِ در حال تایپ پارس و از نو فرمت می‌شود؛ ورودی نامعتبر و
    // منفی همان‌طور که تایپ شده می‌ماند تا اعتبارسنجی فرم باقی کار را بکند.
    var field by remember { mutableStateOf(TextFieldValue(value, TextRange(value.length))) }
    LaunchedEffect(value) {
        if (field.text != value) field = TextFieldValue(value, TextRange(value.length))
    }
    OutlinedTextField(
        value = field,
        onValueChange = { next ->
            val right = digitsRightOf(next.text, next.selection.end)
            val parsed = parseIntegerInput(next.text)
            if (parsed == null || parsed < 0) {
                field = next
                onValueChange(next.text)
            } else {
                val formatted = formatNumber(parsed.toLong())
                field = TextFieldValue(formatted, TextRange(caretFromRight(formatted, right)))
                onValueChange(formatted)
            }
        },
        label = { Text(label) },
        singleLine = singleLine,
        supportingText = supportingText,
        suffix = suffixSlot,
        keyboardOptions = keyboardOptions,
        textStyle = MaterialTheme.typography.bodyLarge,
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
fun TextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        supportingText = supporting?.let { { Text(it) } },
        textStyle = MaterialTheme.typography.bodyLarge,
        modifier = modifier.fillMaxWidth(),
    )
}
