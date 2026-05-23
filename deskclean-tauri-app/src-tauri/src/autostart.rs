// 开机启动管理

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "settings.json";

#[tauri::command]
pub async fn enable_autostart(app: AppHandle) -> Result<(), String> {
    let manager = app.autolaunch();
    manager.enable().map_err(|e| e.to_string())?;
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set("autostart", true);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn disable_autostart(app: AppHandle) -> Result<(), String> {
    let manager = app.autolaunch();
    manager.disable().map_err(|e| e.to_string())?;
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set("autostart", false);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    if let Some(saved) = store.get("autostart") {
        if let Some(enabled) = saved.as_bool() {
            return Ok(enabled);
        }
    }
    let manager = app.autolaunch();
    manager.is_enabled().map_err(|e| e.to_string())
}
