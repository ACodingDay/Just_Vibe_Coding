package com.yyt.dama.feature.idcard

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.ScreenRotation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.drawText
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.yyt.dama.R
import com.yyt.dama.engine.runDetection
import com.yyt.dama.ui.animation.bounceClick
import com.yyt.dama.ui.components.DamaTopBar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

@Composable
fun IdCardEditScreen(
    onBack: () -> Unit,
    onDetectionDone: (originalBitmap: Bitmap, detectedRegions: List<android.graphics.Rect>) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var selectedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isRunning by remember { mutableStateOf(false) }
    var cardOffsetY by remember { mutableFloatStateOf(0f) }
    var orientation by remember { mutableStateOf(CardOrientation.LANDSCAPE) }

    val dens = LocalDensity.current
    var screenW by remember { mutableFloatStateOf(0f) }
    var cardH by remember { mutableFloatStateOf(0f) }

    // PhotoPicker
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        uri?.let {
            scope.launch {
                val bmp = withContext(Dispatchers.IO) {
                    val bytes = context.contentResolver.openInputStream(it)?.use { s ->
                        s.readBytes()
                    } ?: return@withContext null

                    // 两遍解码：先取尺寸，再用 inSampleSize 高效加载
                    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                    val m = max(opts.outWidth, opts.outHeight)
                    opts.inSampleSize = if (m > 2048) {
                        var s = 1; while (s * 2048 < m) s *= 2; s
                    } else 1
                    opts.inJustDecodeBounds = false
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                }
                // 回收旧图再赋新值，避免内存泄漏
                val old = selectedBitmap
                selectedBitmap = bmp
                old?.recycle()
                cardOffsetY = 0f
            }
        }
    }

    Scaffold(
        topBar = { DamaTopBar(title = stringResource(R.string.id_card_edit_title), onBack = onBack) }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (selectedBitmap == null) {
                // -- Empty State: Polished photo selection prompt --
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    // Large icon in tinted circle
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.size(100.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.AddPhotoAlternate,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }

                    Spacer(Modifier.height(28.dp))

                    Text(
                        text = stringResource(R.string.id_card_select_prompt),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    Spacer(Modifier.height(8.dp))

                    Text(
                        text = stringResource(R.string.home_id_card_desc),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(Modifier.height(36.dp))

                    Button(
                        onClick = {
                            photoPickerLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                            )
                        },
                        modifier = Modifier
                            .bounceClick()
                            .height(50.dp)
                            .padding(horizontal = 8.dp),
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Icon(
                            Icons.Default.PhotoLibrary,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            stringResource(R.string.id_card_select_image),
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
            } else {
                // -- Image editing state --
                val bmp = selectedBitmap!!
                BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                    val pixDensity = dens.density
                    screenW = with(dens) { maxWidth.toPx() }
                    val imgW = bmp.width.toFloat()
                    val imgH = bmp.height.toFloat()
                    val displayScale = screenW / imgW
                    val displayImgH = imgH * displayScale
                    cardH = min(screenW / aspectFor(orientation), displayImgH)

                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height((displayImgH / pixDensity).dp)
                            ) {
                                Image(
                                    bitmap = bmp.asImageBitmap(),
                                    contentDescription = null,
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.FillWidth
                                )

                                // -- Draggable card overlay (Material You) --
                                // Capture theme values in Composable scope
                                // (drawWithContent lambda is DrawScope, NOT @Composable)
                                val surfaceTint = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.52f)
                                val accentColor = MaterialTheme.colorScheme.primary
                                val accentSoft = accentColor.copy(alpha = 0.7f)
                                val cardOutline = accentColor.copy(alpha = 0.3f)
                                val labelStyle = TextStyle(
                                    color = ComposeColor.White,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Medium
                                )
                                val textMeasurer = rememberTextMeasurer()
                                val currentTemplate = templateFor(orientation)
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height((cardH / pixDensity).dp)
                                        .offset { IntOffset(0, cardOffsetY.roundToInt()) }
                                        .pointerInput(orientation) {
                                            detectVerticalDragGestures { _, dragAmount ->
                                                cardOffsetY = max(
                                                    0f,
                                                    min(cardOffsetY + dragAmount, displayImgH - cardH)
                                                )
                                            }
                                        }
                                        .drawWithContent {
                                            // 1. Draw underlying image
                                            drawContent()

                                            // 2. Frosted mask with rounded-rect cutouts (EvenOdd)
                                            val maskPath = Path().apply {
                                                addRoundRect(
                                                    RoundRect(
                                                        Rect(Offset.Zero, size),
                                                        CornerRadius(16.dp.toPx())
                                                    )
                                                )
                                                for (f in currentTemplate) {
                                                    addRoundRect(
                                                        RoundRect(
                                                            Rect(
                                                                f.xPct * size.width, f.yPct * size.height,
                                                                (f.xPct + f.wPct) * size.width,
                                                                (f.yPct + f.hPct) * size.height
                                                            ),
                                                            CornerRadius(8.dp.toPx())
                                                        )
                                                    )
                                                }
                                            }
                                            maskPath.fillType = PathFillType.EvenOdd
                                            drawPath(maskPath, surfaceTint)

                                            // 3. Field accent borders + labels
                                            val solidStroke = Stroke(width = 1.5.dp.toPx())
                                            val dashedStroke = Stroke(
                                                width = 1.5.dp.toPx(),
                                                pathEffect = PathEffect.dashPathEffect(
                                                    floatArrayOf(10f, 7f), 0f
                                                )
                                            )
                                            for (f in currentTemplate) {
                                                val fieldRect = Rect(
                                                    f.xPct * size.width, f.yPct * size.height,
                                                    (f.xPct + f.wPct) * size.width,
                                                    (f.yPct + f.hPct) * size.height
                                                )
                                                // Border
                                                drawRoundRect(
                                                    color = if (f.isDashed) accentSoft else accentColor,
                                                    topLeft = fieldRect.topLeft,
                                                    size = fieldRect.size,
                                                    cornerRadius = CornerRadius(8.dp.toPx()),
                                                    style = if (f.isDashed) dashedStroke else solidStroke
                                                )
                                                // Label (above field, inside card)
                                                val labelResult = textMeasurer.measure(f.label, labelStyle)
                                                val labelX = fieldRect.left + 4.dp.toPx()
                                                val labelY = fieldRect.top - labelResult.size.height - 2.dp.toPx()
                                                if (labelY > 0f) {
                                                    drawText(
                                                        textMeasurer = textMeasurer,
                                                        text = f.label,
                                                        topLeft = Offset(labelX, labelY),
                                                        style = labelStyle
                                                    )
                                                }
                                            }

                                            // 4. Card outline
                                            drawRoundRect(
                                                color = cardOutline,
                                                cornerRadius = CornerRadius(16.dp.toPx()),
                                                style = Stroke(width = 1.dp.toPx())
                                            )

                                            // 5. 照片区域锚点图标（定位提示）
                                            val photoField = currentTemplate.find { it.isDashed }
                                            if (photoField != null) {
                                                val pRect = Rect(
                                                    photoField.xPct * size.width,
                                                    photoField.yPct * size.height,
                                                    (photoField.xPct + photoField.wPct) * size.width,
                                                    (photoField.yPct + photoField.hPct) * size.height
                                                )
                                                // 在照片区域中心画一个淡色 Face 图标
                                                val iconSize = min(pRect.width, pRect.height) * 0.45f
                                                val cx = pRect.center.x - iconSize / 2f
                                                val cy = pRect.center.y - iconSize / 2f
                                                drawRoundRect(
                                                    color = accentColor.copy(alpha = 0.12f),
                                                    topLeft = Offset(cx, cy),
                                                    size = Size(iconSize, iconSize),
                                                    cornerRadius = CornerRadius(iconSize * 0.5f)
                                                )
                                                // 简易人形轮廓（圆形头 + 弧形身体）
                                                val headR = iconSize * 0.16f
                                                val headCx = pRect.center.x
                                                val headCy = cy + iconSize * 0.32f
                                                drawCircle(
                                                    color = accentColor.copy(alpha = 0.25f),
                                                    radius = headR,
                                                    center = Offset(headCx, headCy)
                                                )
                                                val bodyTop = headCy + headR + iconSize * 0.06f
                                                val bodyW = iconSize * 0.5f
                                                drawArc(
                                                    color = accentColor.copy(alpha = 0.20f),
                                                    startAngle = 180f,
                                                    sweepAngle = 180f,
                                                    useCenter = false,
                                                    topLeft = Offset(headCx - bodyW / 2f, bodyTop),
                                                    size = Size(bodyW, bodyW * 0.6f),
                                                    style = Stroke(width = iconSize * 0.04f)
                                                )
                                            }
                                        }
                                )

                                // -- Rotation toggle FAB --
                                Surface(
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .padding(8.dp)
                                        .size(36.dp),
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                    shadowElevation = 4.dp
                                ) {
                                    IconButton(
                                        onClick = {
                                            orientation = if (orientation == CardOrientation.LANDSCAPE)
                                                CardOrientation.PORTRAIT
                                            else
                                                CardOrientation.LANDSCAPE
                                            cardOffsetY = 0f
                                        }
                                    ) {
                                        Icon(
                                            Icons.Default.ScreenRotation,
                                            contentDescription = stringResource(R.string.id_card_toggle_orientation),
                                            modifier = Modifier.size(18.dp),
                                            tint = MaterialTheme.colorScheme.onPrimaryContainer
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // -- Bottom action bar --
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                selectedBitmap?.recycle()
                                selectedBitmap = null
                                cardOffsetY = 0f
                            },
                            modifier = Modifier
                                .bounceClick()
                                .weight(1f)
                                .height(48.dp),
                            shape = MaterialTheme.shapes.medium
                        ) {
                            Text(
                                stringResource(R.string.id_card_reselect),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                        Button(
                            onClick = {
                                if (isRunning) return@Button
                                isRunning = true
                                scope.launch {
                                    try {
                                        val (cropped, regions) = withContext(Dispatchers.IO) {
                                            runDetection(context, bmp, cardOffsetY, screenW, cardH, orientation)
                                        }
                                        isRunning = false
                                        onDetectionDone(cropped, regions)
                                    } catch (e: Exception) {
                                        Log.e("Dama", "Detection failed", e)
                                        isRunning = false
                                    }
                                }
                            },
                            modifier = Modifier
                                .bounceClick()
                                .weight(1f)
                                .height(48.dp),
                            enabled = !isRunning,
                            shape = MaterialTheme.shapes.medium
                        ) {
                            if (isRunning) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary
                                )
                                Spacer(Modifier.width(8.dp))
                            }
                            Text(
                                stringResource(R.string.id_card_start_detect),
                                style = MaterialTheme.typography.labelLarge
                            )
                        }
                    }
                }
            }
        }
    }
}
