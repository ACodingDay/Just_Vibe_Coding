package com.yyt.dama.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Apple-inspired shape scale.
 *
 * Tiered radii matching Apple HIG conventions:
 * - 6dp:  small tags, badges, compact inputs
 * - 8dp:  standard buttons, text fields
 * - 12dp: cards, dialogs, setting groups
 * - 18dp: larger cards, content panels
 * - 28dp: hero modules, spotlight containers
 *
 * Capsule/pill shapes (980dp) and circles (50%)
 * should be applied directly via RoundedCornerShape(50)
 * at the component level.
 */
val DamaShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(18.dp),
    extraLarge = RoundedCornerShape(28.dp)
)
