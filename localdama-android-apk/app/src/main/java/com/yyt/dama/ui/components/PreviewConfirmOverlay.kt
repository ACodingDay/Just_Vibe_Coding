package com.yyt.dama.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.yyt.dama.R

/**
 * 拍照预览确认界面 — 通用可复用组件。
 *
 * 从 `IdCardCameraScreen.PreviewConfirmOverlay` 提取，
 * 业务方拍完照后展示裁剪/原始图片，让用户决定「确认」还是「重拍」。
 *
 * @param bitmap 待确认的图片（调用方负责生命周期）
 * @param onConfirm 用户点击 ✓
 * @param onDiscard 用户点击 ✕
 */
@Composable
fun PreviewConfirmOverlay(
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
        Card(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth(0.85f)
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = Color.Transparent),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Image(
                bitmap = img,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(bitmap.width.toFloat() / bitmap.height)
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(64.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                ConfirmActionButton(
                    icon = painterResource(R.drawable.ic_close),
                    contentDescription = "放弃",
                    containerColor = Color(0xFFE53935).copy(alpha = 0.15f),
                    iconTint = Color(0xFFE53935),
                    onClick = onDiscard
                )
                ConfirmActionButton(
                    icon = painterResource(R.drawable.ic_check),
                    contentDescription = "确认",
                    containerColor = Color(0xFF2196F3).copy(alpha = 0.15f),
                    iconTint = Color(0xFF2196F3),
                    onClick = onConfirm
                )
            }
        }
    }
}

@Composable
private fun ConfirmActionButton(
    icon: Painter,
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
            painter = icon,
            contentDescription = contentDescription,
            tint = iconTint,
            modifier = Modifier.size(36.dp)
        )
    }
}

/**
 * 识别中遮罩 — 通用可复用组件。
 *
 * 展示半透明黑色遮罩 + 居中 CircularProgressIndicator + 文案，
 * 业务方在 OCR / 处理过程中覆盖整个屏幕防止误触。
 */
@Composable
fun DetectionLoadingOverlay(
    message: String,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .clickable(
                indication = null,
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
            ) { },
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            CircularProgressIndicator(color = Color.White)
            Text(
                text = message,
                color = Color.White,
                style = MaterialTheme.typography.bodyLarge
            )
        }
    }
}
