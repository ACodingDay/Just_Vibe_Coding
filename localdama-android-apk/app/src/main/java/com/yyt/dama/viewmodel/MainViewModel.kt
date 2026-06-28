package com.yyt.dama.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import com.yyt.dama.data.SettingsRepository
import com.yyt.dama.ui.theme.ThemeColor
import com.yyt.dama.ui.theme.ThemeMode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * ViewModel for MainActivity.
 * Manages top-level theme state shared across the entire app.
 */
class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val repo = SettingsRepository(application)

    private val _themeMode = MutableStateFlow(repo.loadThemeMode())
    val themeMode: StateFlow<ThemeMode> = _themeMode.asStateFlow()

    private val _themeColor = MutableStateFlow(repo.loadThemeColor())
    val themeColor: StateFlow<ThemeColor> = _themeColor.asStateFlow()

    private val _fullscreen = MutableStateFlow(repo.loadFullscreen())
    val fullscreen: StateFlow<Boolean> = _fullscreen.asStateFlow()

    fun updateThemeMode(mode: ThemeMode) {
//        Log.d("Dama/MainVM", "updateThemeMode: $mode")
        _themeMode.value = mode
        repo.saveThemeMode(mode)
    }

    fun updateThemeColor(color: ThemeColor) {
//        Log.d("Dama/MainVM", "updateThemeColor: $color")
        _themeColor.value = color
        repo.saveThemeColor(color)
    }

    fun updateFullscreen(enabled: Boolean) {
//        Log.d("Dama/MainVM", "updateFullscreen: $enabled")
        _fullscreen.value = enabled
        repo.saveFullscreen(enabled)
    }
}
