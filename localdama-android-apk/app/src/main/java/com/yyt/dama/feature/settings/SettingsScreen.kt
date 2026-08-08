package com.yyt.dama.feature.settings

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.yyt.dama.R
import com.yyt.dama.engine.MosaicStyle
import com.yyt.dama.ocr.OcrModelOption
import com.yyt.dama.ui.components.DamaTopBar
import com.yyt.dama.ui.theme.ThemeMode
import com.yyt.dama.ui.theme.ThemeColor
import com.yyt.dama.viewmodel.MainViewModel
import com.yyt.dama.viewmodel.SettingsViewModel
import androidx.core.content.edit
import androidx.lifecycle.viewmodel.compose.viewModel

// -- SharedPreferences keys --
private const val PREFS_NAME = "dama_settings"
private const val KEY_THEME_MODE = "theme_mode"
private const val KEY_THEME_COLOR = "theme_color"
private const val KEY_MOSAIC_STRENGTH = "mosaic_strength"
private const val KEY_MOSAIC_STYLE = "mosaic_style"
private const val KEY_FULLSCREEN = "fullscreen"

/** 打码方案选项枚举，支持 SharedPreferences 持久化 */
enum class MosaicStyleOption {
    FILL_WHITE,
    BLUR,
    PIXELATE;

    /**
     * 将选项转换为具体的 [MosaicStyle] 实例，并根据 [strength] 计算打码参数。
     *
     * [strength] 取值 0.0~1.0（来自设置页打码强度滑动条），
     * 线性映射到各风格的 blockSize / radius / noise 参数：
     * - Pixelate: blockSize 8~40, noise 0~40
     * - Blur: radius 8~32, noise 0~40
     * - FillWhite: 无参数，不受强度影响
     *
     * strength=0.5（默认值）时输出与原硬编码默认值一致：
     * Pixelate(24, 20)、Blur(20, 20)。
     */
    fun toMosaicStyle(strength: Float): MosaicStyle {
        val s = strength.coerceIn(0f, 1f)
        return when (this) {
            FILL_WHITE -> MosaicStyle.FillWhite
            BLUR -> MosaicStyle.Blur(
                radius = lerp(8, 32, s),
                noise = lerp(0, 40, s)
            )
            PIXELATE -> MosaicStyle.Pixelate(
                blockSize = lerp(8, 40, s),
                noise = lerp(0, 40, s)
            )
        }
    }
}

/** 线性插值：[strength]=0 返回 [start]，[strength]=1 返回 [end] */
private fun lerp(start: Int, end: Int, strength: Float): Int =
    (start + (end - start) * strength).toInt()

fun getSettingsPrefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

fun loadThemeMode(context: Context): ThemeMode {
    val ordinal = getSettingsPrefs(context).getInt(KEY_THEME_MODE, ThemeMode.SYSTEM.ordinal)
    return ThemeMode.entries.getOrElse(ordinal) { ThemeMode.SYSTEM }
}

fun saveThemeMode(context: Context, mode: ThemeMode) {
    getSettingsPrefs(context).edit { putInt(KEY_THEME_MODE, mode.ordinal) }
}

fun loadThemeColor(context: Context): ThemeColor {
    val ordinal = getSettingsPrefs(context).getInt(KEY_THEME_COLOR, ThemeColor.CLASSIC.ordinal)
    return ThemeColor.entries.getOrElse(ordinal) { ThemeColor.CLASSIC }
}

fun saveThemeColor(context: Context, color: ThemeColor) {
    getSettingsPrefs(context).edit { putInt(KEY_THEME_COLOR, color.ordinal) }
}

fun loadMosaicStrength(context: Context): Float {
    return getSettingsPrefs(context).getFloat(KEY_MOSAIC_STRENGTH, 0.5f)
}

fun saveMosaicStrength(context: Context, value: Float) {
    getSettingsPrefs(context).edit { putFloat(KEY_MOSAIC_STRENGTH, value) }
}

fun loadMosaicStyleOption(context: Context): MosaicStyleOption {
    val ordinal = getSettingsPrefs(context).getInt(KEY_MOSAIC_STYLE, MosaicStyleOption.FILL_WHITE.ordinal)
    return MosaicStyleOption.entries.getOrElse(ordinal) { MosaicStyleOption.FILL_WHITE }
}

fun saveMosaicStyleOption(context: Context, option: MosaicStyleOption) {
    getSettingsPrefs(context).edit { putInt(KEY_MOSAIC_STYLE, option.ordinal) }
}

fun loadFullscreen(context: Context): Boolean {
    return getSettingsPrefs(context).getBoolean(KEY_FULLSCREEN, false)
}

fun saveFullscreen(context: Context, enabled: Boolean) {
    getSettingsPrefs(context).edit { putBoolean(KEY_FULLSCREEN, enabled) }
}

@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onLicensesClick: () -> Unit,
    mainViewModel: MainViewModel
) {
    val settingsViewModel: SettingsViewModel = viewModel()
    val context = LocalContext.current

    val currentThemeMode by mainViewModel.themeMode.collectAsState()
    val currentThemeColor by mainViewModel.themeColor.collectAsState()
    val currentFullscreen by mainViewModel.fullscreen.collectAsState()
    val mosaicStrength by settingsViewModel.mosaicStrength.collectAsState()
    val ocrModelOption by settingsViewModel.ocrModelOption.collectAsState()

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { DamaTopBar(title = stringResource(R.string.settings_title), onBack = onBack) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
        ) {
            Spacer(Modifier.height(16.dp))

            // ================================================================
            // Section: Appearance
            // ================================================================
            SectionHeader(stringResource(R.string.settings_section_appearance))
            Spacer(Modifier.height(8.dp))

            SettingsCard {
                // Theme mode
                var showThemeDialog by remember { mutableStateOf(false) }
                SettingsRow(
                    icon = painterResource(R.drawable.ic_dark_mode),
                    title = stringResource(R.string.settings_theme_mode),
                    subtitle = when (currentThemeMode) {
                        ThemeMode.SYSTEM -> stringResource(R.string.settings_theme_system)
                        ThemeMode.LIGHT -> stringResource(R.string.settings_theme_light)
                        ThemeMode.DARK -> stringResource(R.string.settings_theme_dark)
                    },
                    onClick = { showThemeDialog = true }
                )

                if (showThemeDialog) {
                    ThemeModeDialog(
                        currentMode = currentThemeMode,
                        onSelect = { mode ->
                            mainViewModel.updateThemeMode(mode)
                            showThemeDialog = false
                        },
                        onDismiss = { showThemeDialog = false }
                    )
                }

                SettingsDivider()

                // Theme color selector
                var showColorDialog by remember { mutableStateOf(false) }
                SettingsRow(
                    icon = painterResource(R.drawable.ic_palette),
                    title = stringResource(R.string.settings_theme_color),
                    subtitle = when (currentThemeColor) {
                        ThemeColor.CLASSIC -> stringResource(R.string.settings_theme_color_classic)
                        ThemeColor.TECH_BLUE -> stringResource(R.string.settings_theme_color_tech_blue)
                        ThemeColor.FRESH_GREEN -> stringResource(R.string.settings_theme_color_fresh_green)
                    },
                    onClick = { showColorDialog = true }
                )

                if (showColorDialog) {
                    ThemeColorDialog(
                        currentColor = currentThemeColor,
                        onSelect = { color ->
                            mainViewModel.updateThemeColor(color)
                            showColorDialog = false
                        },
                        onDismiss = { showColorDialog = false }
                    )
                }

                SettingsDivider()

                // Language (placeholder)
                SettingsRow(
                    icon = painterResource(R.drawable.ic_language),
                    title = stringResource(R.string.settings_language),
                    subtitle = stringResource(R.string.settings_language_desc),
                    onClick = {},
                    enabled = false
                )

                SettingsDivider()

                // 隐藏状态栏（全屏）
                SettingsSwitchRow(
                    icon = painterResource(R.drawable.ic_fullscreen),
                    title = stringResource(R.string.settings_fullscreen),
                    subtitle = stringResource(R.string.settings_fullscreen_desc),
                    checked = currentFullscreen,
                    onCheckedChange = { checked ->
                        mainViewModel.updateFullscreen(checked)
                    }
                )
            }

            Spacer(Modifier.height(24.dp))

            // ================================================================
            // Section: Mosaic
            // ================================================================
            SectionHeader(stringResource(R.string.settings_section_mosaic))
            Spacer(Modifier.height(8.dp))

            SettingsCard {
                // ── 打码强度滑条 ──
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Surface(
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.primaryContainer,
                                modifier = Modifier.size(36.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        painterResource(R.drawable.ic_blur),
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp),
                                        tint = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                }
                            }
                            Spacer(Modifier.width(12.dp))
                            Text(
                                stringResource(R.string.settings_mosaic_strength),
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                        Surface(
                            shape = MaterialTheme.shapes.small,
                            color = MaterialTheme.colorScheme.primaryContainer
                        ) {
                            Text(
                                text = when {
                                    mosaicStrength < 0.33f -> stringResource(R.string.settings_mosaic_fine)
                                    mosaicStrength < 0.66f -> stringResource(R.string.settings_mosaic_medium)
                                    else -> stringResource(R.string.settings_mosaic_coarse)
                                },
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Slider(
                        value = mosaicStrength,
                        onValueChange = {
                            settingsViewModel.setMosaicStrength(it)
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            stringResource(R.string.settings_mosaic_label_fine),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            stringResource(R.string.settings_mosaic_label_coarse),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            // ================================================================
            // Section: OCR
            // ================================================================
            SectionHeader(stringResource(R.string.settings_section_ocr))
            Spacer(Modifier.height(8.dp))

            SettingsCard {
                var showOcrModelDialog by remember { mutableStateOf(false) }
                SettingsRow(
                    icon = painterResource(R.drawable.ic_scan),
                    title = stringResource(R.string.settings_ocr_model),
                    subtitle = ocrModelOption.displayName,
                    onClick = { showOcrModelDialog = true }
                )

                if (showOcrModelDialog) {
                    OcrModelDialog(
                        currentModel = ocrModelOption,
                        onSelect = { model ->
                            settingsViewModel.setOcrModelOption(model)
                            showOcrModelDialog = false
                        },
                        onDismiss = { showOcrModelDialog = false }
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            // ================================================================
            // Section: About
            // ================================================================
            SectionHeader(stringResource(R.string.settings_section_about))
            Spacer(Modifier.height(8.dp))

            SettingsCard {
                SettingsRow(
                    icon = painterResource(R.drawable.ic_info),
                    title = stringResource(R.string.settings_version),
                    subtitle = stringResource(R.string.settings_version_value),
                    onClick = {}
                )

                SettingsDivider()

                SettingsRow(
                    icon = painterResource(R.drawable.ic_document),
                    title = stringResource(R.string.settings_license),
                    subtitle = stringResource(R.string.settings_license_value),
                    onClick = {}
                )

                SettingsDivider()

                SettingsRow(
                    icon = painterResource(R.drawable.ic_code),
                    title = stringResource(R.string.settings_oss_licenses),
                    subtitle = stringResource(R.string.settings_oss_licenses_desc),
                    onClick = onLicensesClick
                )
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

// ================================================================
// Reusable Components
// ================================================================

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(horizontal = 4.dp)
    )
}

/** Card wrapper for a group of settings items */
@Composable
private fun SettingsCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            content = content
        )
    }
}

/** Individual settings row with icon, title, subtitle */
@Composable
private fun SettingsRow(
    icon: Painter,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    val alpha = if (enabled) 1f else 0.4f
    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 14.dp, horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = alpha),
                modifier = Modifier.size(36.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        icon,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = alpha)
                    )
                }
            }
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = alpha)
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = alpha)
                )
            }
        }
    }
}

/** Settings row with a Switch toggle */
@Composable
private fun SettingsSwitchRow(
    icon: Painter,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Surface(
        onClick = { onCheckedChange(!checked) },
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 14.dp, horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.size(36.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        icon,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.width(12.dp))
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange
            )
        }
    }
}

@Composable
private fun SettingsDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(horizontal = 16.dp),
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
    )
}

@Composable
private fun ThemeModeDialog(
    currentMode: ThemeMode,
    onSelect: (ThemeMode) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_theme_dialog_title)) },
        text = {
            Column {
                ThemeMode.entries.forEach { mode ->
                    Surface(
                        onClick = { onSelect(mode) },
                        shape = MaterialTheme.shapes.medium,
                        color = if (mode == currentMode)
                            MaterialTheme.colorScheme.primaryContainer
                        else
                            MaterialTheme.colorScheme.surface
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp, horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = mode == currentMode,
                                onClick = { onSelect(mode) }
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                text = when (mode) {
                                    ThemeMode.SYSTEM -> stringResource(R.string.settings_theme_system)
                                    ThemeMode.LIGHT -> stringResource(R.string.settings_theme_light)
                                    ThemeMode.DARK -> stringResource(R.string.settings_theme_dark)
                                },
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.settings_cancel)) }
        }
    )
}

@Composable
private fun ThemeColorDialog(
    currentColor: ThemeColor,
    onSelect: (ThemeColor) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_theme_color_dialog_title)) },
        text = {
            Column {
                ThemeColor.entries.forEach { color ->
                    Surface(
                        onClick = { onSelect(color) },
                        shape = MaterialTheme.shapes.medium,
                        color = if (color == currentColor)
                            MaterialTheme.colorScheme.primaryContainer
                        else
                            MaterialTheme.colorScheme.surface
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp, horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Color preview dot
                            Surface(
                                shape = CircleShape,
                                color = when (color) {
                                    ThemeColor.CLASSIC -> Color(0xFF1D1D1F)
                                    ThemeColor.TECH_BLUE -> Color(0xFF007AFF)
                                    ThemeColor.FRESH_GREEN -> Color(0xFF34C759)
                                },
                                modifier = Modifier.size(20.dp)
                            ) {}
                            Spacer(Modifier.width(12.dp))
                            Text(
                                text = when (color) {
                                    ThemeColor.CLASSIC -> stringResource(R.string.settings_theme_color_classic)
                                    ThemeColor.TECH_BLUE -> stringResource(R.string.settings_theme_color_tech_blue)
                                    ThemeColor.FRESH_GREEN -> stringResource(R.string.settings_theme_color_fresh_green)
                                },
                                style = MaterialTheme.typography.bodyLarge
                            )
                            Spacer(Modifier.weight(1f))
                            if (color == currentColor) {
                                Icon(
                                    painterResource(R.drawable.ic_check),
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.settings_cancel)) }
        }
    )
}

@Composable
private fun OcrModelDialog(
    currentModel: OcrModelOption,
    onSelect: (OcrModelOption) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_ocr_model_dialog_title)) },
        text = {
            Column {
                OcrModelOption.entries.forEach { model ->
                    Surface(
                        onClick = { onSelect(model) },
                        shape = MaterialTheme.shapes.medium,
                        color = if (model == currentModel)
                            MaterialTheme.colorScheme.primaryContainer
                        else
                            MaterialTheme.colorScheme.surface
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp, horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = model == currentModel,
                                onClick = { onSelect(model) }
                            )
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = model.displayName,
                                    style = MaterialTheme.typography.bodyLarge
                                )
                                Text(
                                    text = model.modelPath,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Spacer(Modifier.weight(1f))
                            if (model == currentModel) {
                                Icon(
                                    painterResource(R.drawable.ic_check),
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.settings_cancel)) }
        }
    )
}
