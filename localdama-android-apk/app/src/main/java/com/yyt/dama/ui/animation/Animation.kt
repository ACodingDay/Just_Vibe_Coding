package com.yyt.dama.ui.animation

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Spring
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput

// ================================================================
// Spring Presets
// ================================================================

/** Bouncy spring — for playful, tactile interactions */
val BouncySpring = spring<Float>(
    stiffness = Spring.StiffnessMediumLow,
    dampingRatio = 0.65f
)

/** Medium spring — balanced for most UI transitions */
val MediumSpring = spring<Float>(
    stiffness = Spring.StiffnessMedium,
    dampingRatio = 0.8f
)

/** Gentle spring — for subtle, smooth transitions */
val GentleSpring = spring<Float>(
    stiffness = Spring.StiffnessLow,
    dampingRatio = 0.9f
)

// ================================================================
// bounceClick — Press-scale modifier (inspired by photoo)
// ================================================================

/**
 * Adds tactile press-scale feedback to any composable.
 * On press, the element scales down to [scaleDown] with a bouncy spring,
 * then springs back to 1f on release.
 *
 * When used with components that have their own onClick (Button, Card, etc.),
 * pass [onClick] as null — the modifier only provides visual feedback.
 *
 * @param scaleDown Target scale when pressed (default 0.94)
 * @param onClick Optional click callback (if null, only scale feedback is applied)
 */
fun Modifier.bounceClick(
    scaleDown: Float = 0.94f,
    onClick: (() -> Unit)? = null
): Modifier = composed {
    var isPressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (isPressed) scaleDown else 1f,
        animationSpec = BouncySpring,
        label = "bounce"
    )

    this
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .pointerInput(onClick) {
            awaitPointerEventScope {
                while (true) {
                    awaitFirstDown(requireUnconsumed = false)
                    isPressed = true
                    val up = waitForUpOrCancellation()
                    isPressed = false
                    if (up != null) {
                        onClick?.invoke()
                    }
                }
            }
        }
}
