package com.yyt.dama.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import com.yyt.dama.data.SettingsRepository
import com.yyt.dama.feature.settings.MosaicStyleOption
import com.yyt.dama.ui.theme.ThemeColor
import com.yyt.dama.ui.theme.ThemeMode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * ViewModel for Settings screen.
 * Manages all user preferences via SettingsRepository.
 */
class SettingsViewModel(application: Application) : AndroidViewModel(application) {

    private val repo = SettingsRepository(application)

    private val _themeMode = MutableStateFlow(repo.loadThemeMode())
    val themeMode: StateFlow<ThemeMode> = _themeMode.asStateFlow()

    private val _themeColor = MutableStateFlow(repo.loadThemeColor())
    val themeColor: StateFlow<ThemeColor> = _themeColor.asStateFlow()

    private val _fullscreen = MutableStateFlow(repo.loadFullscreen())
    val fullscreen: StateFlow<Boolean> = _fullscreen.asStateFlow()

    private val _mosaicStrength = MutableStateFlow(repo.loadMosaicStrength())
    val mosaicStrength: StateFlow<Float> = _mosaicStrength.asStateFlow()

    private val _mosaicStyleOption = MutableStateFlow(repo.loadMosaicStyleOption())
    val mosaicStyleOption: StateFlow<MosaicStyleOption> = _mosaicStyleOption.asStateFlow()

    fun setThemeMode(mode: ThemeMode) {
        _themeMode.value = mode
        repo.saveThemeMode(mode)
    }

    fun setThemeColor(color: ThemeColor) {
        _themeColor.value = color
        repo.saveThemeColor(color)
    }

    fun setFullscreen(enabled: Boolean) {
        _fullscreen.value = enabled
        repo.saveFullscreen(enabled)
    }

    fun setMosaicStrength(value: Float) {
        _mosaicStrength.value = value
        repo.saveMosaicStrength(value)
    }

    fun setMosaicStyleOption(option: MosaicStyleOption) {
        _mosaicStyleOption.value = option
        repo.saveMosaicStyleOption(option)
    }
}
