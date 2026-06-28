package com.yyt.dama.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import com.yyt.dama.feature.settings.MosaicStyleOption
import com.yyt.dama.ui.theme.ThemeColor
import com.yyt.dama.ui.theme.ThemeMode

/**
 * Repository encapsulating all SharedPreferences read/write operations.
 * ViewModels delegate to this class instead of calling top-level functions directly.
 */
class SettingsRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // ── Theme Mode ──

    fun loadThemeMode(): ThemeMode {
        val ordinal = prefs.getInt(KEY_THEME_MODE, ThemeMode.SYSTEM.ordinal)
        return ThemeMode.entries.getOrElse(ordinal) { ThemeMode.SYSTEM }
    }

    fun saveThemeMode(mode: ThemeMode) {
        prefs.edit { putInt(KEY_THEME_MODE, mode.ordinal) }
    }

    // ── Theme Color ──

    fun loadThemeColor(): ThemeColor {
        val ordinal = prefs.getInt(KEY_THEME_COLOR, ThemeColor.CLASSIC.ordinal)
        return ThemeColor.entries.getOrElse(ordinal) { ThemeColor.CLASSIC }
    }

    fun saveThemeColor(color: ThemeColor) {
        prefs.edit { putInt(KEY_THEME_COLOR, color.ordinal) }
    }

    // ── Fullscreen ──

    fun loadFullscreen(): Boolean =
        prefs.getBoolean(KEY_FULLSCREEN, false)

    fun saveFullscreen(enabled: Boolean) {
        prefs.edit { putBoolean(KEY_FULLSCREEN, enabled) }
    }

    // ── Mosaic Strength ──

    fun loadMosaicStrength(): Float =
        prefs.getFloat(KEY_MOSAIC_STRENGTH, 0.5f)

    fun saveMosaicStrength(value: Float) {
        prefs.edit { putFloat(KEY_MOSAIC_STRENGTH, value) }
    }

    // ── Mosaic Style ──

    fun loadMosaicStyleOption(): MosaicStyleOption {
        val ordinal = prefs.getInt(KEY_MOSAIC_STYLE, MosaicStyleOption.FILL_WHITE.ordinal)
        return MosaicStyleOption.entries.getOrElse(ordinal) { MosaicStyleOption.FILL_WHITE }
    }

    fun saveMosaicStyleOption(option: MosaicStyleOption) {
        prefs.edit { putInt(KEY_MOSAIC_STYLE, option.ordinal) }
    }

    companion object {
        private const val PREFS_NAME = "dama_settings"
        private const val KEY_THEME_MODE = "theme_mode"
        private const val KEY_THEME_COLOR = "theme_color"
        private const val KEY_MOSAIC_STRENGTH = "mosaic_strength"
        private const val KEY_MOSAIC_STYLE = "mosaic_style"
        private const val KEY_FULLSCREEN = "fullscreen"
    }
}
