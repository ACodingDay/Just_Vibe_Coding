package com.yyt.dama.feature.idcard

import android.Manifest
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.Settings
import android.util.Log
import android.view.ViewGroup
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.yyt.dama.R
import com.yyt.dama.engine.runTemplateDetection
import com.yyt.dama.ui.theme.CameraDarkColorScheme
import com.yyt.dama.util.CropUtils
import com.yyt.dama.util.OverlayPercentRect
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

private const val TAG = "IdCardCamera"

// ── 相机页面专用颜色常量（通过 CameraDarkColorScheme 保证一致） ──
private val OverlayDim = Color.Black.copy(alpha = 0.55f)
private val ShutterFill = Color(0xFFF5F5F7)
private val ShutterRing = Color.White.copy(alpha = 0.7f)
private val WhiteSecondary = Color.White.copy(alpha = 0.65f)

/**
 * 支付宝风格身份证拍照界面。
 *
 * - CameraX 实时预览
 * - 暗色沉浸式 UI（始终使用 CameraDarkColorScheme）
 * - 人像面 / 国徽面自由切换（平行关系，非顺序）
 * - 定位锚点引导（头像 / 国徽图标）
 * - 拍一张 → OCR → 跳结果页
 * - 双指缩放
 */
@Composable
fun IdCardCameraScreen(
    onBack: () -> Unit,
    onDetectionDone: (originalBitmap: Bitmap, detectedRegions: List<android.graphics.Rect>) -> Unit,
    onGalleryFallback: () -> Unit
) {
    // Wrap entire screen in camera-specific dark theme
    MaterialTheme(colorScheme = CameraDarkColorScheme) {
        CameraScreenContent(
            onBack = onBack,
            onDetectionDone = onDetectionDone,
            onGalleryFallback = onGalleryFallback
        )
    }
}

@Composable
private fun CameraScreenContent(
    onBack: () -> Unit,
    onDetectionDone: (originalBitmap: Bitmap, detectedRegions: List<android.graphics.Rect>) -> Unit,
    onGalleryFallback: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current

    // ── 状态 ──
    var currentSide by remember { mutableStateOf(CardSide.FRONT) }
    var isProcessing by remember { mutableStateOf(false) }
    var isCapturing by remember { mutableStateOf(false) }
    var hasCameraPermission by remember { mutableStateOf(false) }
    var showRationale by remember { mutableStateOf(false) }
    var isPermanentlyDenied by remember { mutableStateOf(false) }
    var flashOn by remember { mutableStateOf(false) }
    var zoomRatio by remember { mutableFloatStateOf(1f) }

    // ── 裁剪预览确认状态 ──
    var previewBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var showPreview by remember { mutableStateOf(false) }
    // 拍照瞬间捕获的正反面，供预览确认后调用 runTemplateDetection 使用
    var capturedSide by remember { mutableStateOf(CardSide.FRONT) }

    // ── Snackbar 错误提示 ──
    val snackbarHostState = remember { SnackbarHostState() }
    val errorEvents = remember {
        MutableSharedFlow<String>(
            extraBufferCapacity = 1,
            onBufferOverflow = BufferOverflow.DROP_OLDEST
        )
    }
    LaunchedEffect(Unit) {
        errorEvents.collect { snackbarHostState.showSnackbar(it) }
    }

    // 离开相机页面时，回收未处理的预览图片（防止 bitmap 泄漏）
    DisposableEffect(Unit) {
        onDispose {
            previewBitmap?.recycle()
        }
    }

    // CameraX 对象 & 控制回调
    val imageCapture = remember {
        ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()
    }
    var applyCameraSettings by remember { mutableStateOf<((Boolean, Float) -> Unit)?>(null) }
    var cameraReady by remember { mutableStateOf(false) }

    // ── 权限请求 ──
    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        if (!granted) {
            if ((context as? android.app.Activity)
                    ?.shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) == true
            ) {
                // User denied once — show rationale and allow retry
                showRationale = true
            } else {
                // Permanently denied or "don't ask again"
                isPermanentlyDenied = true
            }
        }
    }

    LaunchedEffect(Unit) {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.CAMERA
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        hasCameraPermission = granted
        if (!granted) {
            if ((context as? android.app.Activity)
                    ?.shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) == true
            ) {
                showRationale = true
            } else {
                permLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }

    // ── 相册备选 ──
    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        if (uri != null) onGalleryFallback()
    }

    // ═══════════════════════════════════════════════
    //  UI
    // ═══════════════════════════════════════════════

    BoxWithConstraints(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // ── 根据屏幕尺寸计算取景框百分比坐标（复用 CameraOverlay 的公式）──
        val density = LocalDensity.current
        val viewW = with(density) { maxWidth.toPx() }
        val viewH = with(density) { maxHeight.toPx() }
        val overlayPercentRect = remember(viewW, viewH) {
            val frameW = viewW * IdCardCameraConfig.FRAME_WIDTH_RATIO
            val frameH = frameW / IdCardCameraConfig.FRAME_ASPECT_RATIO
            Log.d(TAG, "Overlay calc: view=${viewW}x${viewH} frame=${frameW}x$frameH ratio=${IdCardCameraConfig.FRAME_ASPECT_RATIO}")
            OverlayPercentRect(
                left   = ((viewW - frameW) / 2f) / viewW,
                top    = ((viewH - frameH) / 2f) / viewH,
                right  = ((viewW + frameW) / 2f) / viewW,
                bottom = ((viewH + frameH) / 2f) / viewH
            )
        }
        val viewRatio = viewW / viewH

        // ── 拍照 → 两步裁剪 → 模板 OCR → 跳结果 ──
        // 参考 CameraCrop 项目的两步裁剪法：
        //   Step 1: cropToPreviewRatio — 统一到屏幕宽高比（消除传感器/屏幕比例差异）
        //   Step 2: cropToOverlay      — 按取景框百分比坐标裁出卡片区域
        fun captureAndDetect() {
            if (isCapturing || isProcessing || !cameraReady) return
            isCapturing = true

            // 拍照瞬间捕获当前面，避免后续 UI 切换导致 side 错位
            capturedSide = currentSide
            val capturedOverlay = overlayPercentRect  // 捕获当前取景框位置
            val capturedViewRatio = viewRatio

            imageCapture.takePicture(
                ContextCompat.getMainExecutor(context),
                object : ImageCapture.OnImageCapturedCallback() {
                    override fun onCaptureSuccess(image: ImageProxy) {
                        // toBitmap() 自动处理 YUV_420_888 / JPEG 格式转换
                        val photoBmp = image.toBitmap()
                        image.close()

                        // 进入识别阶段
                        isCapturing = false
                        isProcessing = true

                        scope.launch {
                            try {
                                val cardBmp = withContext(Dispatchers.IO) {
                                    // 方向对齐 + 两步裁剪
                                    CropUtils.cropCameraPhoto(photoBmp, capturedViewRatio, capturedOverlay)
                                }
                                // cropCameraPhoto 内部旋转时已回收原图，此处仅处理未旋转的情况
                                if (photoBmp !== cardBmp && !photoBmp.isRecycled) {
                                    photoBmp.recycle()
                                }
                                // 裁剪完成，进入预览确认界面（不立即 OCR）
                                isProcessing = false
                                previewBitmap = cardBmp
                                showPreview = true
                            } catch (e: Exception) {
                                Log.e(TAG, "裁剪失败", e)
                                try { photoBmp.recycle() } catch (_: Exception) {}
                                isProcessing = false
                                scope.launch { errorEvents.emit(context.getString(R.string.id_card_detect_failed)) }
                            }
                        }
                    }

                    override fun onError(exception: ImageCaptureException) {
                        Log.e(TAG, "拍照失败", exception)
                        isCapturing = false
                        scope.launch { errorEvents.emit(context.getString(R.string.id_card_photo_failed)) }
                    }
                }
            )
        }

        // ═══ 裁剪预览确认界面（条件渲染，完全替代相机 UI）═══

        if (showPreview && previewBitmap != null) {
            val bmp = previewBitmap!!
            PreviewConfirmOverlay(
                bitmap = bmp,
                onConfirm = {
                    showPreview = false
                    isProcessing = true
                    scope.launch {
                        try {
                            val regions = withContext(Dispatchers.IO) {
                                runTemplateDetection(context, bmp, side = capturedSide)
                            }
                            isProcessing = false
                            previewBitmap = null
                            onDetectionDone(bmp, regions)
                        } catch (e: Exception) {
                            Log.e(TAG, "识别失败", e)
                            isProcessing = false
                            bmp.recycle()
                            previewBitmap = null
                            scope.launch { errorEvents.emit(context.getString(R.string.id_card_detect_failed)) }
                        }
                    }
                },
                onDiscard = {
                    bmp.recycle()
                    previewBitmap = null
                    showPreview = false
                }
            )
        } else {
            // ─── 相机 UI（仅在非预览状态下渲染）───

        if (hasCameraPermission) {
            // ─── 相机预览 ───
            val bindingStarted = remember { mutableStateOf(false) }
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                    }
                },
                update = { previewView ->
                    if (!bindingStarted.value) {
                        bindingStarted.value = true
                        val providerFuture = ProcessCameraProvider.getInstance(context)
                        providerFuture.addListener({
                            try {
                                val provider = providerFuture.get()
                                val preview = Preview.Builder().build().also {
                                    it.surfaceProvider = previewView.surfaceProvider
                                }
                                provider.unbindAll()
                                val camera = provider.bindToLifecycle(
                                    lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA,
                                    preview, imageCapture
                                )
                                applyCameraSettings = { torch, zoom ->
                                    camera.cameraControl.enableTorch(torch)
                                    camera.cameraInfo.zoomState.value?.let { zs ->
                                        val clamped = max(zs.minZoomRatio, min(zoom, zs.maxZoomRatio))
                                        camera.cameraControl.setZoomRatio(clamped)
                                    }
                                }
                                cameraReady = true
                            } catch (e: Exception) {
                                Log.e(TAG, "相机绑定失败", e)
                            }
                        }, ContextCompat.getMainExecutor(context))
                    }
                    applyCameraSettings?.invoke(flashOn, zoomRatio)
                },
                modifier = Modifier.fillMaxSize()
            )

            CameraOverlay(
                side = currentSide,
                overlayPercent = overlayPercentRect
            )

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        detectTransformGestures { _, _, zoom, _ ->
                            zoomRatio = max(1f, min(zoomRatio * zoom, 5f))
                        }
                    }
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 4.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.back),
                        tint = MaterialTheme.colorScheme.onBackground
                    )
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { flashOn = !flashOn }) {
                    Icon(
                        if (flashOn) Icons.Default.FlashOn else Icons.Default.FlashOff,
                        contentDescription = stringResource(R.string.id_card_flash),
                        tint = if (flashOn) MaterialTheme.colorScheme.error
                               else WhiteSecondary
                    )
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(top = 56.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                SideTab(
                    label = stringResource(R.string.id_card_side_front),
                    icon = Icons.Default.Face,
                    isSelected = currentSide == CardSide.FRONT,
                    onClick = { currentSide = CardSide.FRONT }
                )
                Spacer(Modifier.width(16.dp))
                SideTab(
                    label = stringResource(R.string.id_card_side_back),
                    icon = Icons.Default.Shield,
                    isSelected = currentSide == CardSide.BACK,
                    onClick = { currentSide = CardSide.BACK }
                )
            }

            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(bottom = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                AnimatedContent(targetState = currentSide, label = "instruction") { side ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = if (side == CardSide.FRONT)
                                stringResource(R.string.id_card_capture_front)
                            else stringResource(R.string.id_card_capture_back),
                            color = MaterialTheme.colorScheme.onBackground,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = stringResource(R.string.id_card_align_hint),
                            color = WhiteSecondary,
                            fontSize = 13.sp
                        )
                    }
                }

                Spacer(Modifier.height(28.dp))

                ShutterButton(
                    enabled = !isCapturing && !isProcessing && cameraReady,
                    onClick = ::captureAndDetect
                )

                Spacer(Modifier.height(20.dp))

                Text(
                    text = stringResource(R.string.id_card_security_badge),
                    color = WhiteSecondary,
                    fontSize = 12.sp
                )

                Spacer(Modifier.height(10.dp))

                Text(
                    text = stringResource(R.string.id_card_from_gallery),
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable {
                            galleryLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                            )
                        }
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }
        } else {
            Column(
                modifier = Modifier.fillMaxSize().padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Icon(
                    Icons.Default.PhotoLibrary, null,
                    modifier = Modifier.size(64.dp),
                    tint = WhiteSecondary
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    stringResource(R.string.id_card_camera_permission_needed),
                    color = MaterialTheme.colorScheme.onBackground, fontSize = 16.sp,
                    style = androidx.compose.ui.text.TextStyle(textAlign = TextAlign.Center)
                )
                Spacer(Modifier.height(32.dp))
                Button(
                    onClick = {
                        galleryLauncher.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) { Text(stringResource(R.string.id_card_from_gallery)) }
                Spacer(Modifier.height(12.dp))

                if (isPermanentlyDenied) {
                    OutlinedButton(
                        onClick = {
                            context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.fromParts("package", context.packageName, null)
                            })
                        },
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.primary
                        )
                    ) { Text(stringResource(R.string.id_card_camera_go_settings)) }
                    Spacer(Modifier.height(12.dp))
                }

                TextButton(onClick = onBack) {
                    Text(stringResource(R.string.back), color = WhiteSecondary)
                }
            }
        }

        // ═══ 识别中遮罩 ═══
        AnimatedVisibility(visible = isProcessing, enter = fadeIn(), exit = fadeOut()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.5f))
                    .clickable(
                        indication = null,
                        interactionSource = remember { MutableInteractionSource() }
                    ) { },
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    CircularProgressIndicator(color = Color.White)
                    Text(
                        text = stringResource(R.string.id_card_detecting),
                        color = Color.White,
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }
        }

        // ═══ 权限说明弹窗 ═══
        if (showRationale) {
            AlertDialog(
                onDismissRequest = { showRationale = false },
                title = { Text(stringResource(R.string.id_card_camera_permission_needed)) },
                text = { Text(stringResource(R.string.id_card_camera_rationale)) },
                confirmButton = {
                    TextButton(onClick = {
                        showRationale = false
                        permLauncher.launch(Manifest.permission.CAMERA)
                    }) { Text(stringResource(R.string.id_card_camera_allow)) }
                },
                dismissButton = {
                    TextButton(onClick = { showRationale = false }) {
                        Text(stringResource(R.string.settings_cancel))
                    }
                }
            )
        }
        }  // 闭合 if (showPreview) else

        // ── Snackbar 提示 ──
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 16.dp)
        )
    }
}

// ═══════════════════════════════════════════════════════
//  取景框覆盖层
// ═══════════════════════════════════════════════════════

/**
 * 取景框覆盖层，绘制暗色遮罩 + 蓝色边框 + 四角加强标记。
 *
 * @param side           当前正反面，决定定位锚点图标
 * @param overlayPercent 取景框在屏幕上的百分比坐标（由父组件统一计算传入）
 */
@Composable
private fun CameraOverlay(
    side: CardSide,
    overlayPercent: OverlayPercentRect
) {
    Log.d(TAG, "CameraOverlay: side=$side overlayPercent left=${overlayPercent.left} top=${overlayPercent.top} w=${overlayPercent.widthPercent} h=${overlayPercent.heightPercent}")
    val frameBlue = MaterialTheme.colorScheme.primary

    Box(
        modifier = Modifier
            .fillMaxSize()
            .drawWithContent {
                drawContent()

                val w = size.width
                val h = size.height

                // 从百分比坐标反算出像素坐标
                val frameW = overlayPercent.widthPercent * w
                val frameH = overlayPercent.heightPercent * h
                val fx = overlayPercent.left * w
                val fy = overlayPercent.top * h
                val cr = CornerRadius(14.dp.toPx())

                // 暗色遮罩
                val mask = Path().apply {
                    fillType = PathFillType.EvenOdd
                    addRect(Rect(0f, 0f, w, h))
                    addRoundRect(RoundRect(Rect(Offset(fx, fy), Size(frameW, frameH)), cr))
                }
                drawPath(mask, OverlayDim)

                // 蓝色边框
                drawRoundRect(
                    frameBlue,
                    topLeft = Offset(fx, fy),
                    size = Size(frameW, frameH),
                    cornerRadius = cr,
                    style = Stroke(2.5.dp.toPx())
                )

                // 四角加强标记
                val cLen = frameW * 0.08f
                val cWidth = 4.dp.toPx()
                val r = 14.dp.toPx()
                drawLine(frameBlue, Offset(fx, fy + cLen), Offset(fx, fy + r), strokeWidth = cWidth)
                drawLine(frameBlue, Offset(fx + r, fy), Offset(fx + cLen, fy), strokeWidth = cWidth)
                drawLine(frameBlue, Offset(fx + frameW - cLen, fy), Offset(fx + frameW - r, fy), strokeWidth = cWidth)
                drawLine(frameBlue, Offset(fx + frameW, fy + r), Offset(fx + frameW, fy + cLen), strokeWidth = cWidth)
                drawLine(frameBlue, Offset(fx, fy + frameH - cLen), Offset(fx, fy + frameH - r), strokeWidth = cWidth)
                drawLine(frameBlue, Offset(fx + r, fy + frameH), Offset(fx + cLen, fy + frameH), strokeWidth = cWidth)
                drawLine(frameBlue, Offset(fx + frameW - cLen, fy + frameH), Offset(fx + frameW - r, fy + frameH), strokeWidth = cWidth)
                drawLine(frameBlue, Offset(fx + frameW, fy + frameH - cLen), Offset(fx + frameW, fy + frameH - r), strokeWidth = cWidth)
            }
     ) {
        // 定位锚点引导图（直接复用百度 OCR SDK png 资源）
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxWidth(overlayPercent.widthPercent)
                     .aspectRatio(IdCardCameraConfig.FRAME_ASPECT_RATIO)  // 取景框宽高比 1.55
            ) {
                val density = LocalDensity.current
                val ctx = LocalContext.current
                val containerW = with(density) { maxWidth.toPx() }
                val containerH = with(density) { maxHeight.toPx() }

                // 加载百度 OCR SDK 引导 png（正反面各一张）
                val locatorBitmap = remember(side) {
                    // R 资源 ID 不能通过 object 属性间接引用（K2 常量折叠会报错），直接使用
                    val resId = if (side == CardSide.FRONT)
                        R.drawable.id_card_locator_front
                    else
                        R.drawable.id_card_locator_back
                    Log.d(TAG, "CameraOverlay: loading locator resId=$resId side=$side")
                    val bmp = BitmapFactory.decodeResource(ctx.resources, resId)
                    if (bmp == null) {
                        Log.e(TAG, "CameraOverlay: decodeResource returned null for resId=$resId")
                        throw RuntimeException("Failed to decode locator png resId=$resId")
                    }
                    Log.d(TAG, "CameraOverlay: locator decoded ${bmp.width}x${bmp.height}")
                    bmp.asImageBitmap()
                }

                Canvas(modifier = Modifier.fillMaxSize()) {
                    // 取景框已适配百度比例，直接拉伸 png 到目标区域（坐标来自 IdCardCameraConfig）
                    if (side == CardSide.FRONT) {
                        drawImage(locatorBitmap,
                            dstOffset = IntOffset((containerW * IdCardCameraConfig.FRONT_LOCATOR_LEFT).roundToInt(),
                                                  (containerH * IdCardCameraConfig.FRONT_LOCATOR_TOP).roundToInt()),
                            dstSize   = IntSize((containerW * IdCardCameraConfig.FRONT_LOCATOR_WIDTH).roundToInt(),
                                                (containerH * IdCardCameraConfig.FRONT_LOCATOR_HEIGHT).roundToInt())
                        )
                    } else {
                        drawImage(locatorBitmap,
                            dstOffset = IntOffset((containerW * IdCardCameraConfig.BACK_LOCATOR_LEFT).roundToInt(),
                                                  (containerH * IdCardCameraConfig.BACK_LOCATOR_TOP).roundToInt()),
                            dstSize   = IntSize((containerW * IdCardCameraConfig.BACK_LOCATOR_WIDTH).roundToInt(),
                                                (containerH * IdCardCameraConfig.BACK_LOCATOR_HEIGHT).roundToInt())
                        )
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════
//  正反面切换标签
// ═══════════════════════════════════════════════════════

@Composable
private fun SideTab(
    label: String,
    icon: ImageVector,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val primary = MaterialTheme.colorScheme.primary
    val bgColor = if (isSelected) primary.copy(alpha = 0.2f) else Color.Transparent
    val borderColor = if (isSelected) primary else Color.White.copy(alpha = 0.3f)
    val textColor = if (isSelected) MaterialTheme.colorScheme.onBackground else WhiteSecondary

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(bgColor)
            .drawBehind {
                drawRoundRect(
                    color = borderColor,
                    cornerRadius = CornerRadius(20.dp.toPx()),
                    style = Stroke(1.5.dp.toPx())
                )
            }
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = textColor,
            modifier = Modifier.size(16.dp)
        )
        Text(
            text = label,
            fontSize = 13.sp,
            fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
            color = textColor
        )
    }
}

// ═══════════════════════════════════════════════════════
//  快门按钮
// ═══════════════════════════════════════════════════════

@Composable
private fun ShutterButton(enabled: Boolean, onClick: () -> Unit) {
    val alpha = if (enabled) 1f else 0.4f
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(76.dp)
            .clip(CircleShape)
            .background(ShutterRing.copy(alpha = 0.25f * alpha))
            .clickable(enabled = enabled) { onClick() }
    ) {
        Box(
            Modifier.size(76.dp).drawBehind {
                drawCircle(ShutterRing.copy(alpha = alpha), style = Stroke(3.dp.toPx()))
            }
        )
        Box(
            Modifier.size(58.dp)
                .clip(CircleShape)
                .background(ShutterFill.copy(alpha = alpha))
        )
    }
}

// ═══════════════════════════════════════════════════════
//  裁剪预览确认界面
// ═══════════════════════════════════════════════════════

/**
 * 拍照裁剪后的预览确认界面。
 *
 * 显示裁剪后的卡片图片，让用户确认是否满意。
 * - 点击 ✓（绿色）→ 进入 OCR 识别
 * - 点击 ✕（红色）→ 放弃图片，返回相机
 *
 * 参考支付宝身份证拍照的"确认裁剪区域"交互模式。
 */
@Composable
private fun PreviewConfirmOverlay(
    bitmap: Bitmap,
    onConfirm: () -> Unit,
    onDiscard: () -> Unit
) {
    val img = bitmap.asImageBitmap()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.85f))
    ) {
        // ── 中央：裁剪后的卡片图片 ──
        Card(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth(0.85f)
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(
                containerColor = Color.Transparent
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Image(
                bitmap = img,
                contentDescription = "裁剪预览",
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(bitmap.width.toFloat() / bitmap.height)
            )
        }

        // ── 底部：确认 / 放弃按钮 ──
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {


            // 两个按钮
            Row(
                horizontalArrangement = Arrangement.spacedBy(64.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // 放弃按钮（红色 ✕）
                ConfirmActionButton(
                    icon = Icons.Default.Close,
                    contentDescription = "放弃",
                    containerColor = Color(0xFFE53935).copy(alpha = 0.15f),
                    iconTint = Color(0xFFE53935),
                    onClick = onDiscard
                )
                // 确认按钮（蓝色 ✓）
                ConfirmActionButton(
                    icon = Icons.Default.Check,
                    contentDescription = "确认",
                    containerColor = Color(0xFF2196F3).copy(alpha = 0.15f),
                    iconTint = Color(0xFF2196F3),
                    onClick = onConfirm
                )
            }
        }
    }
}

/**
 * 预览确认界面的操作按钮（圆形，带半透明背景）。
 */
@Composable
private fun ConfirmActionButton(
    icon: ImageVector,
    contentDescription: String,
    containerColor: Color,
    iconTint: Color,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(72.dp)
            .clip(CircleShape)
            .background(containerColor)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = iconTint,
            modifier = Modifier.size(36.dp)
        )
    }
}
