package com.yyt.dama.navigation

import android.util.Log
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.yyt.dama.R
import com.yyt.dama.data.DetectionRepository
import com.yyt.dama.data.SettingsRepository
import com.yyt.dama.feature.home.HomeScreen
import com.yyt.dama.feature.idcard.IdCardCameraScreen
import com.yyt.dama.feature.idcard.IdCardEditScreen
import com.yyt.dama.feature.result.ResultScreen
import com.yyt.dama.feature.sensitive.SensitiveInfoScreen
import com.yyt.dama.feature.settings.SettingsScreen
import com.yyt.dama.ui.theme.ThemeMode
import com.yyt.dama.viewmodel.HomeViewModel
import com.yyt.dama.viewmodel.MainViewModel
import kotlinx.coroutines.launch

private const val TAG = "Dama/Nav"

/** 导航路由 */
sealed class Route(val path: String) {
    data object Home : Route("home")
    data object IdCardCamera : Route("id_card_camera")
    data object IdCardEdit : Route("id_card_edit")
    data object SensitiveInfo : Route("sensitive_info")
    data object Result : Route("result")
    data object Settings : Route("settings")
}

/**
 * Returns a lambda that calls [navController.popBackStack] at most once.
 *
 * During Compose Navigation's predictive back exit animation the exiting
 * composable stays in composition while the previous destination enters as
 * a preview.  If the user (or system) triggers back a second time before
 * the animation finishes, the exiting composable's onBack fires again and
 * pops an extra entry off the stack — often the start destination — which
 * results in a blank / white screen.
 *
 * The `hasPopped` flag is held in [remember] so it survives recompositions
 * throughout the exit animation but is reset when the composable re-enters
 * composition for a fresh visit.
 */
@Composable
private fun rememberSafePop(navController: androidx.navigation.NavController): () -> Unit {
    var hasPopped by remember { mutableStateOf(false) }
    return {
        if (!hasPopped) {
            hasPopped = true
            navController.popBackStack()
        }
    }
}

@Composable
fun DamaNavGraph(
    mainViewModel: MainViewModel
) {
    val navController = rememberNavController()

    // Only collect themeMode — needed to compute isDark for HomeScreen.
    // themeColor and fullscreen are NOT read here on purpose: they already
    // propagate through DamaTheme → MaterialTheme to every child composable.
    // Collecting them here would cause a redundant recomposition of the
    // entire NavHost on every theme change, which corrupts the navigation
    // back-stack state after a rapid sequence of theme-switch + navigate.
    val themeMode by mainViewModel.themeMode.collectAsState()

    // Compute effective dark state based on user's theme preference
    val systemDark = isSystemInDarkTheme()
    val isDark = when (themeMode) {
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
        ThemeMode.SYSTEM -> systemDark
    }

//    // Track recompositions
//    SideEffect {
//        Log.d(TAG, "NavGraph recompose: isDark=$isDark currentRoute=${navController.currentDestination?.route}")
//    }
//
//    // Log back stack changes
//    DisposableEffect(navController) {
//        val listener = androidx.navigation.NavController.OnDestinationChangedListener { _, dest, args ->
//            Log.d(TAG, "Navigation → ${dest.route}  backStackDepth=${navController.currentBackStack.value.size}")
//        }
//        navController.addOnDestinationChangedListener(listener)
//        onDispose { navController.removeOnDestinationChangedListener(listener) }
//    }

    NavHost(
        navController = navController,
        startDestination = Route.Home.path
    ) {
        composable(Route.Home.path) {
            val homeViewModel: HomeViewModel = viewModel()
            val isTestRunning by homeViewModel.isTestRunning.collectAsState()

//            SideEffect {
//                Log.d(TAG, "[Home] recompose: isTestRunning=$isTestRunning isDark=$isDark")
//            }
//            DisposableEffect(Unit) {
//                Log.d(TAG, "[Home] enter composition")
//                onDispose { Log.d(TAG, "[Home] leave composition") }
//            }

            val context = LocalContext.current
            val snackbarHostState = remember { SnackbarHostState() }
            val coroutineScope = rememberCoroutineScope()

            HomeScreen(
                isDarkTheme = isDark,
                isTestRunning = isTestRunning,
                snackbarHostState = snackbarHostState,
                onIdCardClick = {
//                    Log.d(TAG, "click → IdCardCamera")
                    navController.navigate(Route.IdCardCamera.path)
                },
                onSensitiveInfoClick = {
//                    Log.d(TAG, "click → SensitiveInfo")
                    navController.navigate(Route.SensitiveInfo.path)
                },
                onTestClick = {
//                    Log.d(TAG, "click → OCR test (isTestRunning=$isTestRunning)")
                    homeViewModel.runTestDetection(
                        onSuccess = { bitmap, regions ->
//                            Log.d(TAG, "OCR success: bmp=${bitmap.width}x${bitmap.height} regions=${regions.size}")
                            DetectionRepository.setResult(bitmap, regions, DetectionSource.OCR_TEST)
                            navController.navigate(Route.Result.path)
                        },
                        onError = { e ->
                            Log.w(TAG, "OCR test failed: ${e.message}")
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(
                                    message = context.getString(R.string.ocr_test_asset_missing),
                                    duration = SnackbarDuration.Short
                                )
                            }
                        }
                    )
                },
                onTestLongClick = {
                    homeViewModel.runDebugDetection(
                        onSuccess = { debugBitmap ->
                            DetectionRepository.setResult(
                                debugBitmap, emptyList(), DetectionSource.OCR_TEST
                            )
                            navController.navigate(Route.Result.path)
                        },
                        onError = { e ->
                            Log.w(TAG, "Debug detection failed: ${e.message}")
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(
                                    message = context.getString(R.string.ocr_test_asset_missing),
                                    duration = SnackbarDuration.Short
                                )
                            }
                        }
                    )
                },
                onTestDoubleClick = {
                    homeViewModel.runTextRecognitionTest(
                        onDone = { lineCount ->
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(
                                    message = context.getString(
                                        R.string.ocr_text_test_done, lineCount
                                    ),
                                    duration = SnackbarDuration.Short
                                )
                            }
                        },
                        onError = { e ->
                            Log.w(TAG, "Text recognition test failed: ${e.message}")
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(
                                    message = context.getString(
                                        R.string.ocr_text_test_failed,
                                        e.message?.substringBefore('\n')
                                            ?: e.javaClass.simpleName
                                    ),
                                    duration = SnackbarDuration.Short
                                )
                            }
                        }
                    )
                },
                onSettingsClick = {
//                    Log.d(TAG, "click → Settings")
                    navController.navigate(Route.Settings.path)
                }
            )
        }

        composable(Route.IdCardCamera.path) {
            val safePop = rememberSafePop(navController)
            IdCardCameraScreen(
                onBack = safePop,
                onDetectionDone = { bmp, regions ->
                    DetectionRepository.setResult(bmp, regions, DetectionSource.ID_CARD)
                    navController.navigate(Route.Result.path) {
                        popUpTo(Route.IdCardCamera.path) { inclusive = true }
                    }
                },
                onGalleryFallback = {
                    navController.navigate(Route.IdCardEdit.path)
                }
            )
        }

        composable(Route.IdCardEdit.path) {
            val safePop = rememberSafePop(navController)
            IdCardEditScreen(
                onBack = safePop,
                onDetectionDone = { bmp, regions ->
                    DetectionRepository.setResult(bmp, regions, DetectionSource.ID_CARD)
                    navController.navigate(Route.Result.path)
                }
            )
        }

        composable(Route.SensitiveInfo.path) {
            val safePop = rememberSafePop(navController)
            SensitiveInfoScreen(
                onBack = safePop
            )
        }

        composable(Route.Result.path) {
            val context = LocalContext.current
            val settingsRepo = remember { SettingsRepository(context) }
            val bmp = DetectionRepository.originalBitmap
            val regions = DetectionRepository.regions
            val source = DetectionRepository.source

//            SideEffect {
//                Log.d(TAG, "[Result] recompose: bmp=${if (bmp != null) "${bmp.width}x${bmp.height} recycled=${bmp.isRecycled}" else "null"} regions=${regions.size} source=$source")
//            }
//            DisposableEffect(Unit) {
//                Log.d(TAG, "[Result] enter composition: bmp=${if (bmp != null) "present" else "null"}")
//                onDispose { Log.d(TAG, "[Result] leave composition") }
//            }

            // Mosaic style is local UI state for the result screen
            var mosaicStyleOption by remember {
                mutableStateOf(settingsRepo.loadMosaicStyleOption())
            }

            if (bmp != null) {
                val safePop = rememberSafePop(navController)

                // Clear repository references on exit; delayed recycling
                // ensures exit animations can still render the bitmap
                DisposableEffect(Unit) {
                    onDispose {
//                        Log.d(TAG, "[Result] DisposableEffect onDispose → clear repo")
                        DetectionRepository.clear()
                    }
                }

                ResultScreen(
                    originalBitmap = bmp,
                    detectedRegions = regions,
                    initialStyle = mosaicStyleOption.toMosaicStyle(settingsRepo.loadMosaicStrength()),
                    initialStyleOption = mosaicStyleOption,
                    mosaicStrength = settingsRepo.loadMosaicStrength(),
                    source = source,
                    onStyleChanged = { option ->
                        mosaicStyleOption = option
                        settingsRepo.saveMosaicStyleOption(option)
                    },
                    onBack = {
//                        Log.d(TAG, "[Result] onBack → popBackStack")
                        safePop()
                    }
                )
            } else {
//                Log.w(TAG, "[Result] bmp is null! Scheduling popBackStack")
                // Data lost (e.g. process death) — navigate back
                LaunchedEffect(Unit) { navController.popBackStack() }
            }
        }

        composable(Route.Settings.path) {
            val safePop = rememberSafePop(navController)
//            DisposableEffect(Unit) {
//                Log.d(TAG, "[Settings] enter composition")
//                onDispose { Log.d(TAG, "[Settings] leave composition") }
//            }
            SettingsScreen(
                onBack = {
//                    Log.d(TAG, "[Settings] onBack → popBackStack")
                    safePop()
                },
                mainViewModel = mainViewModel
            )
        }
    }
}
