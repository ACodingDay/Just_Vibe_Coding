package com.yyt.dama.feature.result

import android.graphics.Bitmap
import android.graphics.Rect
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.yyt.dama.R
import com.yyt.dama.engine.MosaicEngine
import com.yyt.dama.engine.MosaicStyle
import com.yyt.dama.feature.settings.MosaicStyleOption
import com.yyt.dama.feature.settings.saveMosaicStyleOption
import com.yyt.dama.navigation.DetectionSource
import com.yyt.dama.ui.animation.bounceClick
import com.yyt.dama.ui.components.DamaTopBar
import com.yyt.dama.util.ImageSaver
import com.yyt.dama.util.SaveResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun ResultScreen(
    originalBitmap: Bitmap,
    detectedRegions: List<Rect>,
    initialStyle: MosaicStyle,
    initialStyleOption: MosaicStyleOption = MosaicStyleOption.FILL_WHITE,
    mosaicStrength: Float = 0.5f,
    source: DetectionSource = DetectionSource.DEFAULT,
    onStyleChanged: (MosaicStyleOption) -> Unit = {},
    onBack: () -> Unit
) {
    val context = LocalContext.current
    var currentStyleOption by remember { mutableStateOf(initialStyleOption) }
    var currentStyle by remember { mutableStateOf(initialStyle) }
    var displaySize by remember { mutableStateOf(IntSize.Zero) }
    var immersive by remember { mutableStateOf(false) }
    val hasRegions = detectedRegions.isNotEmpty()

    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val messageEvents = remember {
        MutableSharedFlow<String>(
            extraBufferCapacity = 1,
            onBufferOverflow = BufferOverflow.DROP_OLDEST
        )
    }
    LaunchedEffect(Unit) {
        messageEvents.collect { snackbarHostState.showSnackbar(it) }
    }

    var displayBitmap by remember {
        mutableStateOf(
            if (hasRegions) MosaicEngine.applyMosaic(originalBitmap, detectedRegions, currentStyle)
            else originalBitmap.copy(originalBitmap.config ?: Bitmap.Config.ARGB_8888, false)
        )
    }
    // 暂存被替换的 displayBitmap，在下一轮切换或退出时安全回收，
    // 避免快速切换风格时两个 LaunchedEffect 对同一 Bitmap double-recycle
    var pendingRecycle by remember { mutableStateOf<Bitmap?>(null) }

    // 检测不到文本时弹出提示弹窗
    var showNoRegionsDialog by remember { mutableStateOf(!hasRegions) }

    // 风格切换时重新渲染
    LaunchedEffect(currentStyle) {
        if (hasRegions) {
            // 先回收上一轮暂存的旧 Bitmap（此时已不在渲染管线中）
            pendingRecycle?.recycle()
            val newBmp = MosaicEngine.applyMosaic(originalBitmap, detectedRegions, currentStyle)
            // 将当前 displayBitmap 暂存，而非立即 recycle
            pendingRecycle = displayBitmap
            displayBitmap = newBmp
        }
    }

    // 离开页面时回收 displayBitmap 和暂存的旧 Bitmap
    DisposableEffect(Unit) {
        onDispose {
            displayBitmap.recycle()
            pendingRecycle?.recycle()
        }
    }

    // 沉浸式背景色动画过渡
    val bgColor by animateColorAsState(
        targetValue = if (immersive) Color.Black else MaterialTheme.colorScheme.background,
        label = "bgColor"
    )

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = {
            SnackbarHost(
                hostState = snackbarHostState,
                modifier = Modifier
                    .navigationBarsPadding()
                    .padding(bottom = 8.dp)
            )
        },
        topBar = {
            if (!immersive) {
                DamaTopBar(title = stringResource(R.string.result_title), onBack = onBack)
            }
        },
        bottomBar = {
            if (!immersive) {
                Surface(
                    color = MaterialTheme.colorScheme.background,
                    tonalElevation = 2.dp
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // ── 风格选择器（分段按钮）──
                        if (hasRegions) {
                            StyleSegmentedRow(
                                selected = currentStyleOption,
                                onSelected = { option ->
                                    currentStyleOption = option
                                    currentStyle = option.toMosaicStyle(mosaicStrength)
                                    saveMosaicStyleOption(context, option)
                                    onStyleChanged(option)
                                }
                            )
                        }

                        // ── 保存 / 分享 ──
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Button(
                                onClick = {
                                    scope.launch {
                                        val finalBmp = MosaicEngine.applyMosaic(
                                            originalBitmap, detectedRegions, currentStyle
                                        )
                                        val result = withContext(Dispatchers.IO) {
                                            ImageSaver.saveToGallery(context, finalBmp)
                                        }
                                        finalBmp.recycle()
                                        when (result) {
                                            is SaveResult.Success ->
                                                messageEvents.emit(context.getString(R.string.save_success))
                                            is SaveResult.Failure ->
                                                messageEvents.emit(context.getString(R.string.save_failed, result.message))
                                        }
                                    }
                                },
                                modifier = Modifier
                                    .bounceClick()
                                    .weight(1f)
                                    .height(48.dp),
                                enabled = hasRegions,
                                shape = MaterialTheme.shapes.medium
                            ) {
                                Icon(
                                    painterResource(R.drawable.ic_save),
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    stringResource(R.string.result_save),
                                    style = MaterialTheme.typography.labelLarge
                                )
                            }

                            FilledIconButton(
                                onClick = {
                                    val finalBmp = MosaicEngine.applyMosaic(
                                        originalBitmap, detectedRegions, currentStyle
                                    )
                                    ImageSaver.shareImage(context, finalBmp)
                                    finalBmp.recycle()
                                },
                                modifier = Modifier
                                    .bounceClick()
                                    .size(48.dp),
                                enabled = hasRegions,
                                shape = CircleShape,
                                colors = IconButtonDefaults.filledIconButtonColors(
                                    containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                                    contentColor = MaterialTheme.colorScheme.onTertiaryContainer
                                )
                            ) {
                                Icon(
                                    painterResource(R.drawable.ic_share),
                                    contentDescription = stringResource(R.string.result_share)
                                )
                            }
                        }
                    }
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(bgColor)
                .then(
                    if (immersive) Modifier else Modifier.padding(innerPadding)
                ),
            contentAlignment = Alignment.Center
        ) {
            if (!hasRegions) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Text(
                        text = stringResource(source.noRegionsTextRes),
                        style = MaterialTheme.typography.titleMedium,
                        color = if (immersive) Color.White
                                else MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(12.dp))
                    Image(
                        bitmap = originalBitmap.asImageBitmap(),
                        contentDescription = null,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp)
                            .pointerInput(Unit) {
                                detectTapGestures(onTap = { immersive = !immersive })
                            },
                        contentScale = ContentScale.Fit
                    )
                }
            } else {
                val aspect = originalBitmap.width.toFloat() / originalBitmap.height

                Image(
                    bitmap = displayBitmap.asImageBitmap(),
                    contentDescription = stringResource(R.string.result_title),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = if (immersive) 0.dp else 12.dp,
                            vertical = if (immersive) 0.dp else 8.dp
                        )
                        .aspectRatio(aspect)
                        .onSizeChanged { displaySize = it }
                        .pointerInput(Unit) {
                            detectTapGestures(onTap = { immersive = !immersive })
                        },
                    contentScale = ContentScale.Fit
                )
            }
        }
    }

    // ── 识别失败提示弹窗（Material You）──
    if (showNoRegionsDialog) {
        AlertDialog(
            onDismissRequest = { showNoRegionsDialog = false },
            title = {
                Text(
                    text = stringResource(R.string.result_dialog_title),
                    style = MaterialTheme.typography.headlineSmall
                )
            },
            text = {
                Text(
                    text = stringResource(source.dialogHintRes),
                    style = MaterialTheme.typography.bodyMedium
                )
            },
            confirmButton = {
                TextButton(onClick = { showNoRegionsDialog = false }) {
                    Text(stringResource(R.string.result_dialog_confirm))
                }
            },
            shape = MaterialTheme.shapes.extraLarge,
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            titleContentColor = MaterialTheme.colorScheme.onSurface,
            textContentColor = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

// ═══════════════════════════════════════════════════════
//  风格分段选择器
// ═══════════════════════════════════════════════════════

@Composable
private fun StyleSegmentedRow(
    selected: MosaicStyleOption,
    onSelected: (MosaicStyleOption) -> Unit
) {
    val options = MosaicStyleOption.entries
    val selectedIndex = options.indexOf(selected).coerceAtLeast(0)

    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
        options.forEachIndexed { index, option ->
            SegmentedButton(
                selected = index == selectedIndex,
                onClick = { onSelected(option) },
                shape = SegmentedButtonDefaults.itemShape(
                    index = index,
                    count = options.size
                ),
                label = {
                    Text(
                        text = styleLabel(option),
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1
                    )
                }
            )
        }
    }
}

@Composable
private fun styleLabel(option: MosaicStyleOption): String = when (option) {
    MosaicStyleOption.FILL_WHITE -> stringResource(R.string.mosaic_style_fill_white)
    MosaicStyleOption.BLUR -> stringResource(R.string.mosaic_style_blur)
    MosaicStyleOption.PIXELATE -> stringResource(R.string.mosaic_style_pixelate)
}
