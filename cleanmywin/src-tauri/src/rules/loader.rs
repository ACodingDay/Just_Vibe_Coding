use super::types::BaseRule;
use tauri_plugin_store::StoreExt;

const KEY_ENABLED_IDS: &str = "enabled_rule_ids";
const KEY_CUSTOM_RULES: &str = "custom_rules";

/// 用户规则偏好（持久化在 settings.json）
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct UserRulePrefs {
    pub enabled_ids: Vec<String>,
    pub custom_rules: Vec<BaseRule>,
}

impl Default for UserRulePrefs {
    fn default() -> Self {
        Self {
            enabled_ids: vec![],
            custom_rules: vec![],
        }
    }
}

/// 从 settings.json 读取用户规则偏好
pub fn get_user_rule_prefs(app: &tauri::AppHandle) -> UserRulePrefs {
    let store = match app.store("settings.json") {
        Ok(s) => s,
        Err(_) => return UserRulePrefs::default(),
    };

    let enabled_ids: Vec<String> = store
        .get(KEY_ENABLED_IDS)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // 鑷畾涔夎鍒欎粠独立的 custom_rules.json 璇诲彇
    let custom_rules: Vec<BaseRule> = store
        .get(KEY_CUSTOM_RULES)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    UserRulePrefs {
        enabled_ids,
        custom_rules,
    }
}

/// 保存启用的规则 ID 到 settings.json
pub fn save_enabled_ids(app: &tauri::AppHandle, ids: Vec<String>) {
    if let Ok(store) = app.store("settings.json") {
        store.set(KEY_ENABLED_IDS, serde_json::to_value(&ids).unwrap_or_default());
        let _ = store.save();
    }
}

/// 保存自定义规则到 settings.json
pub fn save_custom_rules(app: &tauri::AppHandle, rules: Vec<BaseRule>) {
    if let Ok(store) = app.store("settings.json") {
        store.set(KEY_CUSTOM_RULES, serde_json::to_value(&rules).unwrap_or_default());
        let _ = store.save();
    }
}

/// 合并基础规则 + 用户自定义规则
/// base_rules: 前端传入的 base_rules.json 内容
pub fn merge_rules(base_rules: Vec<BaseRule>, custom_rules: Vec<BaseRule>) -> Vec<BaseRule> {
    let mut rules = base_rules;

    for custom in custom_rules {
        if let Some(pos) = rules.iter().position(|r| r.id == custom.id) {
            rules[pos] = custom;
        } else {
            rules.push(custom);
        }
    }

    rules
}

/// 获取累计清理统计
pub fn get_cleanup_stats(app: &tauri::AppHandle) -> super::CleanupStats {
    let store = match app.store("settings.json") {
        Ok(s) => s,
        Err(_) => return super::CleanupStats { total_count: 0, total_bytes: 0 },
    };
    super::CleanupStats {
        total_count: store.get("cleanup_total_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        total_bytes: store.get("cleanup_total_bytes")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
    }
}

