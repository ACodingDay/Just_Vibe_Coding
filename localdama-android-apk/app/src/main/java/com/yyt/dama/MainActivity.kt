package com.yyt.dama

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.yyt.dama.navigation.DamaNavGraph
import com.yyt.dama.ui.theme.DamaTheme
import com.yyt.dama.ui.theme.ThemeMode
import com.yyt.dama.viewmodel.MainViewModel

private const val TAG = "Dama/Main"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
//        Log.d(TAG, "onCreate")

//        // Catch uncaught exceptions that may cause white screen
//        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
//        Thread.setDefaultUncaughtExceptionHandler { t, e ->
//            Log.e(TAG, "Uncaught exception on ${t.name}", e)
//            defaultHandler?.uncaughtException(t, e)
//        }

        setContent {
            val mainViewModel: MainViewModel = viewModel()
            val themeMode by mainViewModel.themeMode.collectAsState()
            val themeColor by mainViewModel.themeColor.collectAsState()
            val fullscreen by mainViewModel.fullscreen.collectAsState()

//            // Log every recomposition of the root content
//            SideEffect {
//                Log.d(TAG, "setContent recompose: mode=$themeMode color=$themeColor fullscreen=$fullscreen")
//            }

            // 根据设置动态控制状态栏显隐
            val window = this.window
            val controller = WindowCompat.getInsetsController(window, window.decorView)

            LaunchedEffect(fullscreen) {
                if (fullscreen) {
                    controller.hide(WindowInsetsCompat.Type.statusBars())
                    controller.systemBarsBehavior =
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                } else {
                    controller.show(WindowInsetsCompat.Type.statusBars())
                }
            }

            // 根据主题模式设置状态栏图标颜色（深色模式用浅色图标，浅色模式用深色图标）
            val systemDark = isSystemInDarkTheme()
            LaunchedEffect(themeMode, systemDark) {
                val isDark = when (themeMode) {
                    ThemeMode.DARK -> true
                    ThemeMode.LIGHT -> false
                    ThemeMode.SYSTEM -> systemDark
                }
                controller.isAppearanceLightStatusBars = !isDark
            }

            DamaTheme(themeMode = themeMode, themeColor = themeColor) {
                DamaNavGraph(
                    mainViewModel = mainViewModel
                )
            }
        }
    }
}
