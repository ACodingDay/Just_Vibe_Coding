//! 旧版本数据迁移模块
//!
//! 当应用更改 `identifier`（如从 `com.yyt0111.cleanmywin` 改为新 ID）时，
//! Windows 会将其视为不同应用，导致旧的持久化数据（累计统计、用户设置、
//! 自定义规则等）无法被新版本读取。
//!
//! 本模块在应用启动时自动检测旧 identifier 的数据目录，
//! 将其 `settings.json` 内容合并到当前应用的 store 中，并清除旧数据目录，
//! 实现无缝升级体验。

use tauri_plugin_store::StoreExt;

/// 旧版本应用的 bundle identifier
///
/// 修改 `tauri.conf.json` 中的 `identifier` 后，将旧值填入此处。
/// 首次启动时模块会自动检测并迁移旧数据。
pub const OLD_IDENTIFIER: &str = "com.yyt0111.cleanmywin";

/// 迁移结果
#[derive(Debug)]
pub struct MigrationResult {
    /// 是否检测到（且成功读取）旧数据文件
    pub found: bool,
    /// 从旧数据迁移的键数量
    pub keys_migrated: usize,
    /// 失败原因（None 表示一切正常）
    pub error: Option<String>,
}

/// 构造旧 identifier 对应的数据目录路径
///
/// tauri-plugin-store 在 Windows 上的默认存储路径为
/// `%APPDATA%/<identifier>/<filename>`。本函数返回该目录。
fn old_data_dir(old_identifier: &str) -> Option<std::path::PathBuf> {
    let base = dirs::config_dir()?;
    Some(base.join(old_identifier))
}

/// 从旧 identifier 迁移数据到当前应用
///
/// # 工作机制
///
/// 1. 根据旧 `identifier` 构造数据目录路径
/// 2. 检测 `settings.json` 是否存在
/// 3. 若存在，读取并解析 JSON
/// 4. 将所有键值对写入当前应用的 store（旧数据优先级高于默认值）
/// 5. 删除旧数据目录（清理残留）
///
/// # 参数
///
/// * `app` - 当前 Tauri 应用句柄
/// * `old_identifier` - 旧版本应用的 bundle identifier（如 `"com.yyt0111.cleanmywin"`）
pub fn migrate_from(app: &tauri::AppHandle, old_identifier: &str) -> MigrationResult {
    // 0. 如果旧 identifier 与当前相同，跳过（防止误删自身数据）
    if old_identifier == app.config().identifier.as_str() {
        return MigrationResult {
            found: false,
            keys_migrated: 0,
            error: None,
        };
    }

    // 1. 构造旧数据路径
    let old_dir = match old_data_dir(old_identifier) {
        Some(d) => d,
        None => {
            return MigrationResult {
                found: false,
                keys_migrated: 0,
                error: Some("无法确定应用数据目录".into()),
            };
        }
    };

    let old_settings = old_dir.join("settings.json");

    // 2. 检测旧数据文件是否存在
    if !old_settings.exists() {
        return MigrationResult {
            found: false,
            keys_migrated: 0,
            error: None,
        };
    }

    // 3. 读取旧数据
    let content = match std::fs::read_to_string(&old_settings) {
        Ok(c) => c,
        Err(e) => {
            return MigrationResult {
                found: true,
                keys_migrated: 0,
                error: Some(format!("读取旧数据文件失败: {e}")),
            };
        }
    };

    // 4. 解析 JSON
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            return MigrationResult {
                found: true,
                keys_migrated: 0,
                error: Some(format!("解析旧数据 JSON 失败: {e}")),
            };
        }
    };

    // 5. 打开当前应用的 store
    let store = match app.store("settings.json") {
        Ok(s) => s,
        Err(e) => {
            return MigrationResult {
                found: true,
                keys_migrated: 0,
                error: Some(format!("打开 store 失败: {e}")),
            };
        }
    };

    // 6. 逐键迁移（旧数据覆盖新 store，确保累计统计等不丢失）
    let mut keys_migrated = 0;
    if let Some(obj) = json.as_object() {
        for (key, value) in obj {
            store.set(key, value.clone());
            keys_migrated += 1;
        }
    }

    // 7. 持久化迁移数据
    if let Err(e) = store.save() {
        return MigrationResult {
            found: true,
            keys_migrated,
            error: Some(format!("保存迁移数据失败: {e}")),
        };
    }

    // 8. 删除旧数据目录（彻底清理残留）
    if let Err(e) = std::fs::remove_dir_all(&old_dir) {
        log::warn!("删除旧数据目录失败（不影响功能）: {e}");
    }

    MigrationResult {
        found: true,
        keys_migrated,
        error: None,
    }
}
