use tauri::Manager;
use tauri_plugin_store::StoreExt;
use chrono::Local;

mod rules;
mod scanner;

#[tauri::command]
fn get_protection_days(app: tauri::AppHandle) -> u32 {
    let store = app.store("settings.json").expect("failed to load store");
    let key = "first_launch_time";

    if !store.has(key) {
        let today = Local::now().date_naive();
        store.set(key, today.format("%Y-%m-%d").to_string());
        let _ = store.save();
    }
    let first_launch = store.get(key)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .and_then(|s| chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| Local::now().date_naive());

    let today = Local::now().date_naive();
    let diff = (today - first_launch).num_days();
    if diff < 0 { 1 } else { diff as u32 + 1 }
}

#[tauri::command]
fn get_user_rule_prefs(app: tauri::AppHandle) -> rules::UserRulePrefs {
    rules::get_user_rule_prefs(&app)
}

#[tauri::command]
fn save_enabled_ids(app: tauri::AppHandle, ids: Vec<String>) {
    rules::save_enabled_ids(&app, ids)
}

#[tauri::command]
async fn scan_rules(
    base_rules: Vec<rules::BaseRule>,
    enabled_ids: Vec<String>,
) -> Result<Vec<rules::ScanResult>, String> {
    Ok(scanner::scan_rules(&base_rules, &enabled_ids))
}

/// 添加自定义规则
#[tauri::command]
fn add_custom_rule(app: tauri::AppHandle, rule: rules::BaseRule) {
    let mut prefs = rules::get_user_rule_prefs(&app);
    if let Some(pos) = prefs.custom_rules.iter().position(|r| r.id == rule.id) {
        prefs.custom_rules[pos] = rule;
    } else {
        prefs.custom_rules.push(rule);
    }
    rules::save_custom_rules(&app, prefs.custom_rules);
}

/// 删除自定义规则
#[tauri::command]
fn remove_custom_rule(app: tauri::AppHandle, id: String) {
    let mut prefs = rules::get_user_rule_prefs(&app);
    prefs.custom_rules.retain(|r| r.id != id);
    rules::save_custom_rules(&app, prefs.custom_rules);
}

#[tauri::command]
async fn clean_rules(
    base_rules: Vec<rules::BaseRule>,
    enabled_ids: Vec<String>,
) -> Result<Vec<rules::CleanResult>, String> {
    Ok(scanner::clean_rules(&base_rules, &enabled_ids))
}

/// 获取累计清理统计
#[tauri::command]
fn get_cleanup_stats(app: tauri::AppHandle) -> rules::CleanupStats {
    rules::get_cleanup_stats(&app)
}

/// 流式扫描 - 分组发送
#[tauri::command]
async fn start_cleanup_scan(
    app: tauri::AppHandle,
    base_rules: Vec<rules::BaseRule>,
    enabled_ids: Vec<String>,
) -> Result<(), String> {
    scanner::scan_rules_streaming(&app, &base_rules, &enabled_ids);
    Ok(())
}

/// 流式清理 - 逐文件发送
#[tauri::command]
async fn start_cleanup_clean(
    app: tauri::AppHandle,
    base_rules: Vec<rules::BaseRule>,
    enabled_ids: Vec<String>,
    selected_paths: Vec<String>,
) -> Result<(), String> {
    scanner::clean_rules_streaming(&app, &base_rules, &enabled_ids, &selected_paths);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_protection_days,
            get_user_rule_prefs,
            save_enabled_ids,
            add_custom_rule,
            remove_custom_rule,
            scan_rules,
            clean_rules,
            get_cleanup_stats,
            start_cleanup_scan,
            start_cleanup_clean,
        ])
        .setup(|app| {
            // 在 dev/build 模式下均设置窗口图标
            let icon_bytes = include_bytes!("../icons/icon.png");
            let decoder = png::Decoder::new(std::io::Cursor::new(icon_bytes));
            if let Ok(mut reader) = decoder.read_info() {
                let mut buf = vec![0u8; reader.output_buffer_size()];
                if let Ok(info) = reader.next_frame(&mut buf) {
                    let image = tauri::image::Image::new_owned(buf, info.width, info.height);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_icon(image);
                    }
                }
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
