package com.yyt.dama.ui.theme

import androidx.compose.ui.graphics.Color

// ================================================================
// Apple-Inspired Design Tokens
// Neutral: cool gray scale · Accent: Apple blue · Semantic: iOS system colors
// ================================================================

// ── Apple Neutral Scale (Light) ────────────────────────────────────
val AppleBlack = Color(0xFF000000)
val AppleInk = Color(0xFF1D1D1F)        // primary text on light
val AppleSecondary = Color(0xFF424245)   // secondary text
val AppleTertiary = Color(0xFF6E6E73)    // tertiary / muted
val AppleDisabled = Color(0xFFAEAEB2)    // disabled text
val ApplePaleGray = Color(0xFFF5F5F7)    // page background
val AppleSurface = Color(0xFFFFFFFF)      // card surface
val AppleContainer = Color(0xFFE8E8ED)   // elevated container
val AppleBorder = Color(0xFFD2D2D7)      // standard border
val AppleBorderSubtle = Color(0xFFE5E5EA) // subtle border

// ── Apple Neutral Scale (Dark) ─────────────────────────────────────
val AppleDarkBg = Color(0xFF000000)        // pure black canvas
val AppleDarkElevated = Color(0xFF1C1C1E)  // surface / cards
val AppleDarkVariant = Color(0xFF2C2C2E)   // surface variant
val AppleDarkContainer = Color(0xFF3A3A3C) // surface container
val AppleDarkFg = Color(0xFFF5F5F7)        // primary text on dark
val AppleDarkSecondary = Color(0xFFD1D1D6) // secondary text
val AppleDarkTertiary = Color(0xFF98989D)   // tertiary text
val AppleDarkDisabled = Color(0xFF48484A)   // disabled text

// ── Apple Blue (Action / Link) ─────────────────────────────────────
val AppleBlue = Color(0xFF0071E3)          // primary CTA, links (light)
val AppleBlueHover = Color(0xFF0077ED)     // hover / pressed
val AppleBlueDark = Color(0xFF2997FF)      // primary CTA on dark
val AppleBlueContainer = Color(0xFFE8F2FE) // blue tinted background (light)
val AppleBlueContainerDark = Color(0xFF0A3D6E) // blue container on dark

// ── Semantic Colors (iOS system) ───────────────────────────────────
val AppleSuccess = Color(0xFF34C759)
val AppleSuccessDark = Color(0xFF30D158)
val AppleWarning = Color(0xFFFF9F0A)
val AppleWarningDark = Color(0xFFFFD60A)
val AppleError = Color(0xFFFF3B30)
val AppleErrorDark = Color(0xFFFF453A)
val AppleInfo = Color(0xFF007AFF)
val AppleInfoDark = Color(0xFF64D2FF)

// ── Feature Card Accent Colors (Light) ─────────────────────────────
val AccentPurple = Color(0xFF5856D6)      // ID Card
val AccentOrange = Color(0xFFFF9500)       // Privacy Lock
val AccentBlueFeat = Color(0xFF007AFF)     // OCR Test
val AccentGray = Color(0xFF8E8E93)         // Coming Soon (disabled)

// ── Feature Card Accent Colors (Dark) ──────────────────────────────
val AccentPurpleDark = Color(0xFF7D7AFF)
val AccentOrangeDark = Color(0xFFFFB340)
val AccentBlueFeatDark = Color(0xFF64D2FF)
val AccentGrayDark = Color(0xFF98989D)

// ── Accent Containers ──────────────────────────────────────────────
val AccentPurpleContainer = Color(red = 0xED, green = 0xED, blue = 0xFC) // light purple tint
val AccentOrangeContainer = Color(0xFFFFF4E5) // light orange tint
val AccentBlueFeatContainer = Color(0xFFE8F2FE) // light blue tint
val AccentGrayContainer = Color(0xFFF2F2F7) // light gray tint

val AccentPurpleContainerDark = Color(0xFF1A1A3D)
val AccentOrangeContainerDark = Color(0xFF3D2400)
val AccentBlueFeatContainerDark = Color(0xFF0A2E3D)
val AccentGrayContainerDark = Color(0xFF2C2C2E)

// ── Overlay & Indicator Colors ─────────────────────────────────────
val OverlayFrosted = Color(0x70FFFFFF)
val OverlayCardBorder = Color(0x1FFFFFFF) // subtle white border on dark

val IndicatorActive = Color(0x880071E3)
val IndicatorDisabled = Color(0x88FF3B30)
val TemplateBorder = Color(0xFFFF3B30)

// ================================================================
// Helper: accent color by index, respecting dark mode
// ================================================================

fun accentColorFor(index: Int, isDark: Boolean): Color {
    return when (index) {
        0 -> if (isDark) AccentPurpleDark else AccentPurple
        1 -> if (isDark) AccentOrangeDark else AccentOrange
        2 -> if (isDark) AccentBlueFeatDark else AccentBlueFeat
        else -> if (isDark) AccentGrayDark else AccentGray
    }
}

fun accentContainerFor(index: Int, isDark: Boolean): Color {
    return when (index) {
        0 -> if (isDark) AccentPurpleContainerDark else AccentPurpleContainer
        1 -> if (isDark) AccentOrangeContainerDark else AccentOrangeContainer
        2 -> if (isDark) AccentBlueFeatContainerDark else AccentBlueFeatContainer
        else -> if (isDark) AccentGrayContainerDark else AccentGrayContainer
    }
}
