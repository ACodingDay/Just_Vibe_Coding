mod autostart;
mod desktop_icons;
mod file_ops;
mod icon_extract;
mod lnk_parse;
mod rules;

use autostart::{disable_autostart, enable_autostart, is_autostart_enabled};
use desktop_icons::{hide_desktop_icons, show_desktop_icons};
use file_ops::{get_drawer_snapshot, is_scan_ready, open_file, save_drawer_snapshot, scan_desktop, startup_scan_and_persist_blocking};
use icon_extract::get_file_icon;
use rules::{get_rules, reset_rules, save_rules};
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "settings.json";
const LANGUAGE_KEY: &str = "language";

#[tauri::command]
async fn get_language(app: AppHandle) -> Result<String, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    if let Some(serde_json::Value::String(lang)) = store.get(LANGUAGE_KEY) {
        Ok(lang)
    } else {
        Ok("zh-CN".to_string())
    }
}

#[tauri::command]
async fn set_language(app: AppHandle, language: String) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(LANGUAGE_KEY, serde_json::Value::String(language));
    store.save().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::MacosLauncher;
                let _ = app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    None::<Vec<&str>>,
                ));
            }

            // 启动时后台扫描桌面并持久化快照，减少用户点击后的等待时间
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    startup_scan_and_persist_blocking(handle);
                });
            }

            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        let _ = desktop_icons::show();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            enable_autostart,
            disable_autostart,
            is_autostart_enabled,
            scan_desktop,
            open_file,
            get_file_icon,
            hide_desktop_icons,
            show_desktop_icons,
            get_rules,
            save_rules,
            reset_rules,
            save_drawer_snapshot,
            get_drawer_snapshot,
            is_scan_ready,
            get_language,
            set_language
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
