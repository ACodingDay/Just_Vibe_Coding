package com.yyt.dama.feature.settings

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.yyt.dama.R
import com.yyt.dama.ui.components.DamaTopBar
import org.json.JSONArray

/** 第三方开源库信息 */
private data class OpenSourceLibrary(
    val name: String,
    val author: String,
    val license: String,
    val url: String
)

/** assets 中的开源许可清单文件名 */
private const val LICENSES_ASSET = "oss_licenses.json"

/**
 * 从 assets 读取 [LICENSES_ASSET] 并解析 JSON 数组。
 *
 * 每个元素四个字段：name / author / license / url。
 * 解析失败（文件缺失、格式错误）返回空列表。
 */
private fun parseLicenses(context: Context): List<OpenSourceLibrary> =
    runCatching {
        val json = context.assets.open(LICENSES_ASSET).bufferedReader().use { it.readText() }
        val array = JSONArray(json)
        (0 until array.length()).map { i ->
            val obj = array.getJSONObject(i)
            OpenSourceLibrary(
                name = obj.getString("name"),
                author = obj.getString("author"),
                license = obj.getString("license"),
                url = obj.getString("url")
            )
        }
    }.getOrDefault(emptyList())

/**
 * 开源许可页 — 列出 app 使用的第三方开源库及其许可证。
 *
 * 从设置页「关于 → 开源许可」进入；点击条目跳转库的项目主页。
 * 清单数据来自 assets/oss_licenses.json（JSON 数组，开发者直接编辑）。
 */
@Composable
fun LicensesScreen(
    onBack: () -> Unit
) {
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    val libraries = remember { parseLicenses(context) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            DamaTopBar(
                title = stringResource(R.string.settings_oss_licenses),
                onBack = onBack
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
        ) {
            Spacer(Modifier.height(16.dp))

            Surface(
                shape = MaterialTheme.shapes.large,
                color = MaterialTheme.colorScheme.surface
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    libraries.forEachIndexed { index, lib ->
                        LicenseRow(
                            library = lib,
                            onClick = { uriHandler.openUri(lib.url) }
                        )
                        if (index < libraries.lastIndex) {
                            HorizontalDivider(
                                modifier = Modifier.padding(horizontal = 16.dp),
                                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

/** 单个开源库条目：库名 + 「作者 • 许可证」+ 外链指示图标 */
@Composable
private fun LicenseRow(
    library: OpenSourceLibrary,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 14.dp, horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = library.name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "${library.author} • ${library.license}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.width(12.dp))
            Icon(
                painter = painterResource(R.drawable.ic_open_in_new),
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
