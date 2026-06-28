package com.yyt.dama.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

// ================================================================
// Apple-Inspired Color Schemes
// ================================================================

private val AppleDarkColorScheme = darkColorScheme(
    primary = AppleDarkFg,                  // #F5F5F7 — white on black mono
    onPrimary = AppleDarkBg,                // #000000
    primaryContainer = AppleDarkContainer,  // #3A3A3C
    onPrimaryContainer = AppleDarkFg,
    secondary = AppleDarkSecondary,          // #D1D1D6
    onSecondary = AppleDarkBg,
    secondaryContainer = AppleDarkVariant,    // #2C2C2E
    onSecondaryContainer = AppleDarkFg,
    tertiary = AccentPurpleDark,              // #7D7AFF
    onTertiary = AppleDarkBg,
    tertiaryContainer = AccentPurpleContainerDark, // #1A1A3D
    onTertiaryContainer = Color(0xFFDEE0FF),
    error = AppleErrorDark,                   // #FF453A
    onError = Color.Black,
    errorContainer = Color(0xFF3D0A0A),
    onErrorContainer = Color(0xFFFFDAD6),
    background = AppleDarkBg,                 // #000000
    onBackground = AppleDarkFg,               // #F5F5F7
    surface = AppleDarkElevated,              // #1C1C1E
    onSurface = AppleDarkFg,
    surfaceVariant = AppleDarkVariant,        // #2C2C2E
    onSurfaceVariant = AppleDarkTertiary,     // #98989D
    outline = Color(0xFF48484A),
    outlineVariant = Color(0xFF2C2C2E),
    inverseSurface = AppleDarkFg,
    inverseOnSurface = AppleInk,
    inversePrimary = AppleInk,
)

private val AppleLightColorScheme = lightColorScheme(
    primary = AppleInk,                      // #1D1D1F — black on white mono
    onPrimary = Color.White,
    primaryContainer = AppleContainer,       // #E8E8ED
    onPrimaryContainer = AppleInk,
    secondary = AppleSecondary,               // #424245
    onSecondary = Color.White,
    secondaryContainer = AppleContainer,      // #E8E8ED
    onSecondaryContainer = AppleInk,
    tertiary = AccentPurple,                  // #5856D6
    onTertiary = Color.White,
    tertiaryContainer = AccentPurpleContainer, // #EDED00 → fixed in Color.kt
    onTertiaryContainer = Color(0xFF000E5C),
    error = AppleError,                       // #FF3B30
    onError = Color.White,
    errorContainer = Color(0xFFFFE5E5),
    onErrorContainer = Color(0xFF410002),
    background = ApplePaleGray,               // #F5F5F7
    onBackground = AppleInk,                  // #1D1D1F
    surface = AppleSurface,                   // #FFFFFF
    onSurface = AppleInk,
    surfaceVariant = ApplePaleGray,           // #F5F5F7
    onSurfaceVariant = AppleTertiary,         // #6E6E73
    outline = AppleBorder,                    // #D2D2D7
    outlineVariant = AppleBorderSubtle,       // #E5E5EA
    inverseSurface = AppleInk,
    inverseOnSurface = ApplePaleGray,
    inversePrimary = ApplePaleGray,
)

// ================================================================
// Tech Blue Color Schemes — deeper blue accent (#007AFF / #0A84FF)
// ================================================================

private val TechBlueDarkColorScheme = darkColorScheme(
    primary = Color(0xFF0A84FF),
    onPrimary = AppleDarkBg,
    primaryContainer = Color(0xFF0A2E5C),
    onPrimaryContainer = Color(0xFFC0DFFF),
    secondary = AppleDarkSecondary,
    onSecondary = AppleDarkBg,
    secondaryContainer = AppleDarkVariant,
    onSecondaryContainer = AppleDarkFg,
    tertiary = AccentPurpleDark,
    onTertiary = AppleDarkBg,
    tertiaryContainer = AccentPurpleContainerDark,
    onTertiaryContainer = Color(0xFFDEE0FF),
    error = AppleErrorDark,
    onError = Color.Black,
    errorContainer = Color(0xFF3D0A0A),
    onErrorContainer = Color(0xFFFFDAD6),
    background = AppleDarkBg,
    onBackground = AppleDarkFg,
    surface = AppleDarkElevated,
    onSurface = AppleDarkFg,
    surfaceVariant = AppleDarkVariant,
    onSurfaceVariant = AppleDarkTertiary,
    outline = Color(0xFF48484A),
    outlineVariant = Color(0xFF2C2C2E),
    inverseSurface = AppleDarkFg,
    inverseOnSurface = AppleInk,
    inversePrimary = Color(0xFF007AFF),
)

private val TechBlueLightColorScheme = lightColorScheme(
    primary = Color(0xFF007AFF),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE0EFFF),
    onPrimaryContainer = Color(0xFF003D80),
    secondary = AppleSecondary,
    onSecondary = Color.White,
    secondaryContainer = AppleContainer,
    onSecondaryContainer = AppleInk,
    tertiary = AccentPurple,
    onTertiary = Color.White,
    tertiaryContainer = AccentPurpleContainer,
    onTertiaryContainer = Color(0xFF000E5C),
    error = AppleError,
    onError = Color.White,
    errorContainer = Color(0xFFFFE5E5),
    onErrorContainer = Color(0xFF410002),
    background = ApplePaleGray,
    onBackground = AppleInk,
    surface = AppleSurface,
    onSurface = AppleInk,
    surfaceVariant = ApplePaleGray,
    onSurfaceVariant = AppleTertiary,
    outline = AppleBorder,
    outlineVariant = AppleBorderSubtle,
    inverseSurface = AppleInk,
    inverseOnSurface = ApplePaleGray,
    inversePrimary = Color(0xFF0A84FF),
)

// ================================================================
// Fresh Green Color Schemes — green accent (#34C759 / #30D158)
// ================================================================

private val FreshGreenDarkColorScheme = darkColorScheme(
    primary = Color(0xFF30D158),
    onPrimary = Color(0xFF002207),
    primaryContainer = Color(0xFF0A3D1A),
    onPrimaryContainer = Color(0xFFC0F0CF),
    secondary = AppleDarkSecondary,
    onSecondary = AppleDarkBg,
    secondaryContainer = AppleDarkVariant,
    onSecondaryContainer = AppleDarkFg,
    tertiary = AccentPurpleDark,
    onTertiary = AppleDarkBg,
    tertiaryContainer = AccentPurpleContainerDark,
    onTertiaryContainer = Color(0xFFDEE0FF),
    error = AppleErrorDark,
    onError = Color.Black,
    errorContainer = Color(0xFF3D0A0A),
    onErrorContainer = Color(0xFFFFDAD6),
    background = AppleDarkBg,
    onBackground = AppleDarkFg,
    surface = Color(0xFF141614),
    onSurface = AppleDarkFg,
    surfaceVariant = Color(0xFF262826),
    onSurfaceVariant = AppleDarkTertiary,
    outline = Color(0xFF48484A),
    outlineVariant = Color(0xFF2C2C2E),
    inverseSurface = AppleDarkFg,
    inverseOnSurface = AppleInk,
    inversePrimary = AppleSuccess,
)

private val FreshGreenLightColorScheme = lightColorScheme(
    primary = AppleSuccess,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE5F9ED),
    onPrimaryContainer = Color(0xFF004D1A),
    secondary = AppleSecondary,
    onSecondary = Color.White,
    secondaryContainer = AppleContainer,
    onSecondaryContainer = AppleInk,
    tertiary = AccentPurple,
    onTertiary = Color.White,
    tertiaryContainer = AccentPurpleContainer,
    onTertiaryContainer = Color(0xFF000E5C),
    error = AppleError,
    onError = Color.White,
    errorContainer = Color(0xFFFFE5E5),
    onErrorContainer = Color(0xFF410002),
    background = ApplePaleGray,
    onBackground = AppleInk,
    surface = AppleSurface,
    onSurface = AppleInk,
    surfaceVariant = ApplePaleGray,
    onSurfaceVariant = AppleTertiary,
    outline = AppleBorder,
    outlineVariant = AppleBorderSubtle,
    inverseSurface = AppleInk,
    inverseOnSurface = ApplePaleGray,
    inversePrimary = AppleSuccessDark,
)

// ================================================================
// Camera Dark Color Scheme — always dark, immersive camera UI
// ================================================================

val CameraDarkColorScheme = darkColorScheme(
    primary = Color(0xFF2997FF),
    onPrimary = Color.Black,
    primaryContainer = Color(0xFF0A2E5C),
    onPrimaryContainer = Color(0xFFC0DFFF),
    secondary = Color(0xFFD1D1D6),
    onSecondary = Color.Black,
    secondaryContainer = Color(0xFF2C2C2E),
    onSecondaryContainer = Color(0xFFF5F5F7),
    tertiary = Color(0xFF7D7AFF),
    onTertiary = Color.Black,
    tertiaryContainer = Color(0xFF1A1A3D),
    onTertiaryContainer = Color(0xFFDEE0FF),
    error = Color(0xFFFF453A),
    onError = Color.Black,
    errorContainer = Color(0xFF3D0A0A),
    onErrorContainer = Color(0xFFFFDAD6),
    background = Color.Black,
    onBackground = Color(0xFFF5F5F7),
    surface = Color(0xFF1C1C1E),
    onSurface = Color(0xFFF5F5F7),
    surfaceVariant = Color(0xFF2C2C2E),
    onSurfaceVariant = Color(0xFF98989D),
    outline = Color(0xFF48484A),
    outlineVariant = Color(0xFF2C2C2E),
    inverseSurface = Color(0xFFF5F5F7),
    inverseOnSurface = Color(0xFF1D1D1F),
    inversePrimary = Color(0xFF007AFF),
)

/** Theme mode enum, linked with settings page */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

/** Theme color palette enum — 3 Apple-inspired palettes */
enum class ThemeColor { CLASSIC, TECH_BLUE, FRESH_GREEN }

@Composable
fun DamaTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    themeColor: ThemeColor = ThemeColor.CLASSIC,
    dynamicColor: Boolean = false, // disabled by default for consistent Apple palette
    content: @Composable () -> Unit
) {
    val darkTheme = when (themeMode) {
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }

    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        else -> when (themeColor) {
            ThemeColor.CLASSIC -> if (darkTheme) AppleDarkColorScheme else AppleLightColorScheme
            ThemeColor.TECH_BLUE -> if (darkTheme) TechBlueDarkColorScheme else TechBlueLightColorScheme
            ThemeColor.FRESH_GREEN -> if (darkTheme) FreshGreenDarkColorScheme else FreshGreenLightColorScheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = DamaShapes,
        content = content
    )
}
