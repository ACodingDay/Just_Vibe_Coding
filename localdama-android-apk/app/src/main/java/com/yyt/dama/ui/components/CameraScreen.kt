package com.yyt.dama.ui.components

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.util.Log
import android.view.ViewGroup
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.yyt.dama.R
import com.yyt.dama.ui.theme.CameraDarkColorScheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.max
import kotlin.math.min

private const val TAG = "CameraScreen"

/**
 * 通用拍照界面组件 — 与业务无关的可复用相机 UI。
 *
 * 提供：CameraX 预览、相机权限处理、闪光灯开关、双指缩放、拍照回调。
 * 不包含任何业务裁剪/OCR 逻辑——业务方通过 [onPhotoCaptured] 拿到原始
 * `Bitmap` 后自行处理（裁剪、识别、跳转等）。
 *
 * 暗色沉浸式：始终使用 [CameraDarkColorScheme]，与现有 IdCardCameraScreen 保持一致。
 *
 * 业务方可选地通过 [overlay] 在取景区上叠加自定义引导层（如身份证取景框、
 * 敏感信息提示等）。
 *
 * @param onBack 返回回调
 * @param onPhotoCaptured 拍照成功回调，参数为方向对齐后的原始 Bitmap
 * @param onGalleryFallback 用户点击「从相册选择」时的回调（业务方负责跳转相册页）
 * @param overlay 业务自定义取景覆盖层，null 表示无覆盖层
 * @param galleryButtonText 相册入口按钮文案资源
 */
@Composable
fun CameraScreen(
    onBack: () -> Unit,
    onPhotoCaptured: (android.graphics.Bitmap) -> Unit,
    onGalleryFallback: () -> Unit,
    modifier: Modifier = Modifier,
    overlay: @Composable (BoxScope.() -> Unit)? = null,
    galleryButtonTextRes: Int = R.string.id_card_from_gallery,
    securityBadgeTextRes: Int = R.string.id_card_security_badge,
    hintTopTextRes: Int? = null,
    hintBottomTextRes: Int = R.string.id_card_align_hint
) {
    MaterialTheme(colorScheme = CameraDarkColorScheme) {
        CameraScreenContent(
            onBack = onBack,
            onPhotoCaptured = onPhotoCaptured,
            onGalleryFallback = onGalleryFallback,
            modifier = modifier,
            overlay = overlay,
            galleryButtonTextRes = galleryButtonTextRes,
            securityBadgeTextRes = securityBadgeTextRes,
            hintTopTextRes = hintTopTextRes,
            hintBottomTextRes = hintBottomTextRes
        )
    }
}

@Composable
private fun CameraScreenContent(
    onBack: () -> Unit,
    onPhotoCaptured: (android.graphics.Bitmap) -> Unit,
    onGalleryFallback: () -> Unit,
    modifier: Modifier,
    overlay: @Composable (BoxScope.() -> Unit)?,
    galleryButtonTextRes: Int,
    securityBadgeTextRes: Int,
    hintTopTextRes: Int?,
    hintBottomTextRes: Int
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var isCapturing by remember { mutableStateOf(false) }
    var hasCameraPermission by remember { mutableStateOf(false) }
    var showRationale by remember { mutableStateOf(false) }
    var isPermanentlyDenied by remember { mutableStateOf(false) }
    var flashOn by remember { mutableStateOf(false) }
    var zoomRatio by remember { mutableFloatStateOf(1f) }
    var cameraReady by remember { mutableStateOf(false) }

    val imageCapture = remember {
        ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()
    }
    var applyCameraSettings by remember { mutableStateOf<((Boolean, Float) -> Unit)?>(null) }

    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        if (!granted) {
            if ((context as? android.app.Activity)
                    ?.shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) == true
            ) {
                showRationale = true
            } else {
                isPermanentlyDenied = true
            }
        }
    }

    LaunchedEffect(Unit) {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
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

    fun capturePhoto() {
        if (isCapturing || !cameraReady) return
        isCapturing = true

        imageCapture.takePicture(
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    val bmp = image.toBitmap()
                    image.close()
                    isCapturing = false
                    onPhotoCaptured(bmp)
                }

                override fun onError(exception: ImageCaptureException) {
                    Log.e(TAG, "拍照失败", exception)
                    isCapturing = false
                }
            }
        )
    }

    Box(
        modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        if (hasCameraPermission) {
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

            // 业务自定义覆盖层（身份证取景框 / 敏感信息提示等）
            if (overlay != null) {
                Box(modifier = Modifier.fillMaxSize(), content = overlay)
            }

            // 双指缩放
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        detectTransformGestures { _, _, zoom, _ ->
                            zoomRatio = max(1f, min(zoomRatio * zoom, 5f))
                        }
                    }
            )

            // 顶部栏：返回 + 闪光灯
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 4.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        painterResource(R.drawable.ic_arrow_back),
                        contentDescription = stringResource(R.string.back),
                        tint = MaterialTheme.colorScheme.onBackground
                    )
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { flashOn = !flashOn }) {
                    Icon(
                        if (flashOn) painterResource(R.drawable.ic_flash_on) else painterResource(R.drawable.ic_flash_off),
                        contentDescription = stringResource(R.string.id_card_flash),
                        tint = if (flashOn) MaterialTheme.colorScheme.error
                               else Color.White.copy(alpha = 0.65f)
                    )
                }
            }

            // 底部：提示文案 + 快门 + 相册入口
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(bottom = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                hintTopTextRes?.let {
                    Text(
                        text = stringResource(it),
                        color = MaterialTheme.colorScheme.onBackground,
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(Modifier.height(4.dp))
                }
                Text(
                    text = stringResource(hintBottomTextRes),
                    color = Color.White.copy(alpha = 0.65f),
                    style = MaterialTheme.typography.bodySmall
                )
                Spacer(Modifier.height(28.dp))
                ShutterButton(enabled = !isCapturing && cameraReady, onClick = ::capturePhoto)
                Spacer(Modifier.height(20.dp))
                Text(
                    text = stringResource(securityBadgeTextRes),
                    color = Color.White.copy(alpha = 0.65f),
                    style = MaterialTheme.typography.labelSmall
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = stringResource(galleryButtonTextRes),
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier
                        .clip(androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                        .clickable { onGalleryFallback() }
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }
        } else {
            // 无权限：占位引导
            Column(
                modifier = Modifier.fillMaxSize().padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    stringResource(R.string.id_card_camera_permission_needed),
                    color = MaterialTheme.colorScheme.onBackground,
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(Modifier.height(32.dp))
                Button(onClick = onGalleryFallback) {
                    Text(stringResource(galleryButtonTextRes))
                }
                Spacer(Modifier.height(12.dp))
                if (isPermanentlyDenied) {
                    OutlinedButton(onClick = {
                        context.startActivity(
                            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.fromParts("package", context.packageName, null)
                            }
                        )
                    }) { Text(stringResource(R.string.id_card_camera_go_settings)) }
                    Spacer(Modifier.height(12.dp))
                }
                TextButton(onClick = onBack) {
                    Text(stringResource(R.string.back), color = Color.White.copy(alpha = 0.65f))
                }
            }
        }

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
    }
}

@Composable
private fun ShutterButton(enabled: Boolean, onClick: () -> Unit) {
    val alpha = if (enabled) 1f else 0.4f
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(76.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.25f * alpha))
            .clickable(enabled = enabled) { onClick() }
    ) {
        Box(
            Modifier.size(76.dp)
                .background(Color.Transparent)
                .drawBehind {
                    drawCircle(Color.White.copy(alpha = alpha), style = Stroke(3f))
                }
        )
        Box(
            Modifier.size(58.dp)
                .clip(CircleShape)
                .background(Color(0xFFF5F5F7).copy(alpha = alpha))
        )
    }
}
