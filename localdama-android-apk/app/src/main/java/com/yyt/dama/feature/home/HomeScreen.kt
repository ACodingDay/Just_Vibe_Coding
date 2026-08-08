package com.yyt.dama.feature.home

import android.util.Log
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.yyt.dama.R
import com.yyt.dama.ui.animation.BouncySpring
import com.yyt.dama.ui.components.DamaTopBar
import com.yyt.dama.ui.theme.accentColorFor
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.delay

@Composable
fun HomeScreen(
    isDarkTheme: Boolean,
    isTestRunning: Boolean = false,
    onIdCardClick: () -> Unit,
    onSensitiveInfoClick: () -> Unit,
    onTestClick: () -> Unit,
    onTestLongClick: () -> Unit = {},
    onTestDoubleClick: () -> Unit = {},
    onSettingsClick: () -> Unit,
    snackbarHostState: SnackbarHostState = remember { SnackbarHostState() }
) {
    val HOME_TAG = "Dama/Home"

//    SideEffect {
//        Log.d(HOME_TAG, "HomeScreen recompose: isDark=$isDarkTheme isTestRunning=$isTestRunning")
//    }

    // Wrap Scaffold + overlay in a plain Box (no .background) so the
    // loading scrim covers the entire screen including the top bar.
    // The Scaffold's own containerColor provides the page background,
    // avoiding the redundant double-background that caused rendering
    // artefacts after theme-switch + navigation.
    Box(modifier = Modifier.fillMaxSize()) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            DamaTopBar(
                title = stringResource(R.string.home_title),
                actions = {
                    IconButton(onClick = onSettingsClick) {
                        Icon(
                            painter = painterResource(R.drawable.ic_settings),
                            contentDescription = stringResource(R.string.settings),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            )
        }
    ) { innerPadding ->
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            val isWide = maxWidth >= 600.dp

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // -- Hero Section --
                Spacer(Modifier.height(40.dp))

                Text(
                    text = stringResource(R.string.home_brand_title),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onSurface,
//                    modifier = Modifier.clickable {
//                        Log.d(HOME_TAG, "click on brand title '本地隐私打码'")
//                    }
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.home_brand_subtitle),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(40.dp))

                if (isWide) {
                    // ── Wide layout: 4 cards in a single row (tablets / landscape) ──
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        StaggeredFeatureCard(
                            modifier = Modifier.weight(1f), index = 0,
                            icon = painterResource(R.drawable.ic_badge),
                            title = stringResource(R.string.home_id_card),
                            subtitle = stringResource(R.string.home_id_card_desc),
                            enabled = true, isDarkTheme = isDarkTheme, onClick = onIdCardClick
                        )
                        StaggeredFeatureCard(
                            modifier = Modifier.weight(1f), index = 1,
                            icon = painterResource(R.drawable.ic_lock),
                            title = stringResource(R.string.home_sensitive_info),
                            subtitle = stringResource(R.string.home_sensitive_info_desc),
                            enabled = true, isDarkTheme = isDarkTheme, onClick = onSensitiveInfoClick
                        )
                        StaggeredFeatureCard(
                            modifier = Modifier.weight(1f), index = 2,
                            icon = painterResource(R.drawable.ic_science),
                            title = stringResource(R.string.home_ocr_test),
                            subtitle = stringResource(R.string.home_ocr_test_desc),
                            enabled = true, isDarkTheme = isDarkTheme, onClick = onTestClick
                        )
                        StaggeredFeatureCard(
                            modifier = Modifier.weight(1f), index = 3,
                            icon = painterResource(R.drawable.ic_construction),
                            title = stringResource(R.string.home_more_features),
                            subtitle = stringResource(R.string.home_coming_soon),
                            enabled = false, isDarkTheme = isDarkTheme, onClick = {}
                        )
                    }
                } else {
                    // ── Compact layout: 2x2 grid (phones) ──
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        StaggeredFeatureCard(
                            modifier = Modifier.weight(1f),
                            index = 0,
                            icon = painterResource(R.drawable.ic_badge),
                            title = stringResource(R.string.home_id_card),
                            subtitle = stringResource(R.string.home_id_card_desc),
                            enabled = true,
                            isDarkTheme = isDarkTheme,
                            onClick = onIdCardClick
                        )
                        StaggeredFeatureCard(
                            modifier = Modifier.weight(1f),
                            index = 1,
                            icon = painterResource(R.drawable.ic_lock),
                            title = stringResource(R.string.home_sensitive_info),
                            subtitle = stringResource(R.string.home_sensitive_info_desc),
                            enabled = true,
                            isDarkTheme = isDarkTheme,
                            onClick = onSensitiveInfoClick
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        StaggeredFeatureCard(
                            modifier = Modifier.weight(1f),
                            index = 2,
                            icon = painterResource(R.drawable.ic_science),
                            title = stringResource(R.string.home_ocr_test),
                            subtitle = stringResource(R.string.home_ocr_test_desc),
                            enabled = true,
                            isDarkTheme = isDarkTheme,
                            onClick = onTestClick,
                            onLongClick = onTestLongClick,
                            onDoubleClick = onTestDoubleClick
                        )
                        StaggeredFeatureCard(
                            modifier = Modifier.weight(1f),
                            index = 3,
                            icon = painterResource(R.drawable.ic_construction),
                            title = stringResource(R.string.home_more_features),
                            subtitle = stringResource(R.string.home_coming_soon),
                            enabled = false,
                            isDarkTheme = isDarkTheme,
                            onClick = {}
                        )
                    }
                }
            }
        }
    }

    // Loading overlay when OCR detection is running — covers entire screen
    if (isTestRunning) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f))
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() }
                ) { /* consume clicks */ },
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                CircularProgressIndicator(color = Color.White)
                val detectingCd = stringResource(R.string.home_detecting_cd)
                Text(
                    text = stringResource(R.string.home_detecting),
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.semantics {
                        contentDescription = detectingCd
                    }
                )
            }
        }
    }
    } // end outer Box
}

@Composable
private fun StaggeredFeatureCard(
    modifier: Modifier = Modifier,
    index: Int,
    icon: Painter,
    title: String,
    subtitle: String,
    enabled: Boolean,
    isDarkTheme: Boolean,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    onDoubleClick: (() -> Unit)? = null
) {
    val visibleState = remember { MutableTransitionState(false) }
    LaunchedEffect(Unit) {
        delay((80 + index * 60).milliseconds)
        visibleState.targetState = true
    }

    AnimatedVisibility(
        visibleState = visibleState,
        enter = fadeIn(BouncySpring) +
                slideInVertically(
                    animationSpec = spring(
                        stiffness = Spring.StiffnessMediumLow,
                        dampingRatio = 0.65f
                    )
                ) { it / 3 } +
                scaleIn(BouncySpring, initialScale = 0.92f),
        modifier = modifier
    ) {
        FeatureCard(
            icon = icon,
            title = title,
            subtitle = subtitle,
            accentIndex = index,
            enabled = enabled,
            isDarkTheme = isDarkTheme,
            onClick = onClick,
            onLongClick = onLongClick,
            onDoubleClick = onDoubleClick
        )
    }
}

@Composable
private fun FeatureCard(
    icon: Painter,
    title: String,
    subtitle: String,
    accentIndex: Int,
    enabled: Boolean,
    isDarkTheme: Boolean,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    onDoubleClick: (() -> Unit)? = null
) {
    val alpha = if (enabled) 1f else 0.4f
    val accentColor = accentColorFor(accentIndex, isDarkTheme)

    val clickModifier = if (onLongClick != null || onDoubleClick != null) {
        Modifier.combinedClickable(
            onClick = { if (enabled) onClick() },
            onLongClick = onLongClick?.let { l -> { if (enabled) l() } },
            onDoubleClick = onDoubleClick?.let { d -> { if (enabled) d() } }
        )
    } else {
        Modifier.clickable { if (enabled) onClick() }
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(155.dp)
            .then(clickModifier),
        shape = MaterialTheme.shapes.extraLarge,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
        ) {
            // Icon circle with accent tint
            Surface(
                shape = CircleShape,
                color = accentColor.copy(alpha = 0.12f * alpha),
                modifier = Modifier.size(44.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        painter = icon,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = accentColor.copy(alpha = alpha)
                    )
                }
            }

            Spacer(Modifier.weight(1f))

            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = alpha)
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = alpha)
            )
        }
    }
}
