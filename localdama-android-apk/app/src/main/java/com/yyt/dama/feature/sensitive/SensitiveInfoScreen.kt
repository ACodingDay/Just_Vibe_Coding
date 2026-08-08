package com.yyt.dama.feature.sensitive

import android.graphics.Bitmap
import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.yyt.dama.R
import com.yyt.dama.ui.animation.bounceClick
import com.yyt.dama.ui.components.CameraScreen
import com.yyt.dama.ui.components.DetectionLoadingOverlay
import com.yyt.dama.ui.components.DamaTopBar
import com.yyt.dama.ui.components.ImageLoader
import com.yyt.dama.ui.components.PreviewConfirmOverlay
import com.yyt.dama.ui.components.rememberPhotoPicker
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val TAG = "SensitiveInfo"

/**
 * 敏感信息打码页面 — 第二个核心功能页。
 *
 * 与身份证打码页（IdCardCameraScreen / IdCardEditScreen）的差异：
 * - 无证件模板约束，对任意图片做全图 OCR + 正则匹配
 * - 复用通用 [CameraScreen] / [rememberPhotoPicker] / [PreviewConfirmOverlay] 组件
 * - 检测管道由 [SensitiveDetector] 实现：det 检测 → rec 识别 → 正则匹配
 *
 * 三态 UI：
 * 1. 空态：展示拍照/相册两个入口
 * 2. 相机态：调用 [CameraScreen]
 * 3. 预览态：[PreviewConfirmOverlay] 确认图片后触发检测
 */
@Composable
fun SensitiveInfoScreen(
    onBack: () -> Unit,
    onDetectionDone: (originalBitmap: Bitmap, detectedRegions: List<android.graphics.Rect>) -> Unit
) {
    val context = LocalContextSafe()
    val scope = rememberCoroutineScope()

    // ── 页面状态 ──
    var mode by remember { mutableStateOf<UiMode>(UiMode.Empty) }
    var pendingBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isProcessing by remember { mutableStateOf(false) }
    var showNoMatchDialog by remember { mutableStateOf(false) }
    var showErrorDialog by remember { mutableStateOf(false) }

    // 检测器持有 det/rec ONNX 模型，页面级复用（多次检测不重复加载），销毁时释放
    val detector = remember { SensitiveDetector(context) }

    // 离开页面时释放 OCR 模型并回收未处理的预览图，防止模型与 bitmap 泄漏。
    // 检测进行中不回收 pendingBitmap：IO 线程仍在读它，回收会触发
    // "recycled bitmap" 崩溃，改由 runDetection 的收尾逻辑负责回收
    DisposableEffect(Unit) {
        onDispose {
            detector.close()
            if (!isProcessing) pendingBitmap?.recycle()
        }
    }

    // ── 相册选取 ──
    val photoPicker = rememberPhotoPicker { uri ->
        if (uri != null) {
            scope.launch {
                val bmp = withContext(Dispatchers.IO) {
                    ImageLoader.decodeFromUri(context, uri)
                }
                if (bmp != null) {
                    pendingBitmap = bmp
                    mode = UiMode.Preview
                }
            }
        }
    }

    // ═══════════════════════════════════════════════
    //  检测管道：预览图 → SensitiveDetector → 回调
    // ═══════════════════════════════════════════════
    fun runDetection(bitmap: Bitmap) {
        if (isProcessing) return
        isProcessing = true
        scope.launch {
            try {
                val regions = withContext(Dispatchers.IO) {
                    detector.detectSensitiveInfo(bitmap)
                }
                isProcessing = false
                if (regions.isEmpty()) {
                    // 未命中：回收图片，避免等页面销毁才释放内存
                    bitmap.recycle()
                    pendingBitmap = null
                    showNoMatchDialog = true
                } else if (coroutineContext.isActive) {
                    // 检测成功且页面仍在：移交 bitmap 所有权给 ResultScreen（不在此回收）
                    pendingBitmap = null
                    onDetectionDone(bitmap, regions)
                } else {
                    // 检测完成时用户已离开页面：回收图片，不再导航
                    bitmap.recycle()
                    pendingBitmap = null
                }
            } catch (e: CancellationException) {
                // 页面销毁导致协程取消：onDispose 已跳过回收（isProcessing=true），
                // 在此回收 in-flight 的图片，防止泄漏；不弹任何对话框
                isProcessing = false
                bitmap.recycle()
                pendingBitmap = null
            } catch (e: Exception) {
                Log.e(TAG, "敏感信息检测失败", e)
                // 失败≠未命中：弹独立错误弹窗，避免用户误以为图片里没有敏感信息
                isProcessing = false
                bitmap.recycle()
                pendingBitmap = null
                showErrorDialog = true
            }
        }
    }

    when (val m = mode) {
        UiMode.Empty -> EmptyState(
            onBack = onBack,
            onTakePhoto = { mode = UiMode.Camera },
            onPickPhoto = { photoPicker.launch() }
        )

        UiMode.Camera -> CameraScreen(
            onBack = { mode = UiMode.Empty },
            onPhotoCaptured = { bmp ->
                pendingBitmap = bmp
                mode = UiMode.Preview
            },
            onGalleryFallback = {
                mode = UiMode.Empty
                photoPicker.launch()
            },
            hintTopTextRes = R.string.sensitive_camera_hint,
            hintBottomTextRes = R.string.sensitive_camera_subhint
        )

        is UiMode.Preview -> {
            val bmp = pendingBitmap
            if (bmp != null) {
                PreviewConfirmOverlay(
                    bitmap = bmp,
                    onConfirm = {
                        mode = UiMode.Empty
                        runDetection(bmp)
                    },
                    onDiscard = {
                        bmp.recycle()
                        pendingBitmap = null
                        mode = UiMode.Empty
                    }
                )
                if (isProcessing) {
                    DetectionLoadingOverlay(message = stringResource(R.string.sensitive_detecting))
                }
            } else {
                mode = UiMode.Empty
            }
        }
    }

    // 未命中弹窗
    if (showNoMatchDialog) {
        AlertDialog(
            onDismissRequest = { showNoMatchDialog = false },
            title = { Text(stringResource(R.string.sensitive_no_match_title)) },
            text = { Text(stringResource(R.string.sensitive_no_match_message)) },
            confirmButton = {
                TextButton(onClick = { showNoMatchDialog = false }) {
                    Text(stringResource(R.string.result_dialog_confirm))
                }
            }
        )
    }

    // 检测失败弹窗（区别于未命中：模型缺失/解码异常等，避免误导用户）
    if (showErrorDialog) {
        AlertDialog(
            onDismissRequest = { showErrorDialog = false },
            title = { Text(stringResource(R.string.sensitive_detect_failed_title)) },
            text = { Text(stringResource(R.string.sensitive_detect_failed_message)) },
            confirmButton = {
                TextButton(onClick = { showErrorDialog = false }) {
                    Text(stringResource(R.string.result_dialog_confirm))
                }
            }
        )
    }
}

/** 页面 UI 模式 */
private sealed class UiMode {
    /** 空态：展示拍照/相册入口 */
    object Empty : UiMode()
    /** 相机态：调用通用 CameraScreen */
    object Camera : UiMode()
    /** 预览态：PreviewConfirmOverlay 确认图片 */
    object Preview : UiMode()
}

@Composable
private fun EmptyState(
    onBack: () -> Unit,
    onTakePhoto: () -> Unit,
    onPickPhoto: () -> Unit
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { DamaTopBar(title = stringResource(R.string.sensitive_title), onBack = onBack) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.size(100.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        painter = painterResource(R.drawable.ic_photo_library),
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            Text(
                text = stringResource(R.string.sensitive_empty_prompt),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface
            )

            Spacer(Modifier.height(36.dp))

            // 拍照入口
            Button(
                onClick = onTakePhoto,
                modifier = Modifier
                    .bounceClick()
                    .fillMaxWidth()
                    .height(50.dp),
                shape = MaterialTheme.shapes.medium
            ) {
                Icon(painterResource(R.drawable.ic_camera), null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.sensitive_take_photo), style = MaterialTheme.typography.labelLarge)
            }

            Spacer(Modifier.height(16.dp))

            // 相册入口
            OutlinedButton(
                onClick = onPickPhoto,
                modifier = Modifier
                    .bounceClick()
                    .fillMaxWidth()
                    .height(50.dp),
                shape = MaterialTheme.shapes.medium
            ) {
                Icon(painterResource(R.drawable.ic_add_photo), null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.sensitive_pick_from_gallery), style = MaterialTheme.typography.labelLarge)
            }

            Spacer(Modifier.height(32.dp))

            // 支持类型由启用中的规则动态生成，避免与 SensitivePattern 列表脱节
            val supportedTypes = remember {
                defaultSensitivePatterns()
                    .filter { it.enabled }
                    .joinToString(" · ") { it.name }
            }
            Text(
                text = "支持：$supportedTypes",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun LocalContextSafe() = androidx.compose.ui.platform.LocalContext.current
