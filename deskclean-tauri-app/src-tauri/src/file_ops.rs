// 文件操作：扫描桌面、打开文件、抽屉分组

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::lnk_parse::resolve_lnk_target;
use crate::rules::{classify_with_rules, load_rules_from_store, FileInfo, Rule};

const STORE_PATH: &str = "settings.json";
const SNAPSHOT_KEY: &str = "drawer_snapshot";
const SCAN_TIMESTAMP_KEY: &str = "scan_timestamp";

// --- 对外输出结构 ---

#[derive(Clone, Serialize, Deserialize)]
pub struct Drawer {
    pub drawer_id: String,       // 英文分类 key: "folder", "image" ...
    pub icons: Vec<IconEntry>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct IconEntry {
    #[serde(default)]
    pub icon_id: String,         // 唯一标识 = path
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_lnk: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lnk_target: Option<String>,
}

// 内部临时结构（扫描时使用）
struct RawEntry {
    name: String,
    path: String,
    category: String,
    is_dir: bool,
    is_lnk: bool,
    lnk_target: Option<String>,
}

/// 扫描单个桌面路径，返回 RawEntry 列表（不排序、不分组）
fn scan_desktop_entries(desktop_path: &std::path::Path, custom_rules: &[Rule]) -> Vec<RawEntry> {
    let mut raw: Vec<RawEntry> = Vec::new();

    let dir_entries = match fs::read_dir(desktop_path) {
        Ok(d) => d,
        Err(_) => return raw,
    };

    for entry in dir_entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if name.starts_with('.') || name == "desktop.ini" || name == "Thumbs.db" {
            continue;
        }

        if path.is_dir() {
            raw.push(RawEntry {
                name,
                path: path.to_string_lossy().to_string(),
                category: "folder".to_string(),
                is_dir: true,
                is_lnk: false,
                lnk_target: None,
            });
        } else if path.is_file() {
            let ext_lower = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();

            let is_lnk = ext_lower == "lnk";
            let lnk_target = if is_lnk {
                resolve_lnk_target(&path.to_string_lossy())
            } else {
                None
            };

            let lnk_target_name = lnk_target.as_ref().and_then(|p| {
                std::path::Path::new(p)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.to_lowercase())
            });

            let info = FileInfo {
                name: name.clone(),
                extension: ext_lower,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                is_lnk,
                lnk_target_path: lnk_target.clone(),
                lnk_target_name,
            };

            let category = classify_with_rules(&info, custom_rules);

            raw.push(RawEntry {
                name,
                path: path.to_string_lossy().to_string(),
                category,
                is_dir: false,
                is_lnk,
                lnk_target,
            });
        }
    }

    raw
}

// --- 扫描桌面 + 分组 ---

#[tauri::command]
pub async fn scan_desktop(app: AppHandle) -> Result<Vec<Drawer>, String> {
    let user_desktop = dirs::desktop_dir().ok_or("无法获取桌面路径")?;
    let custom_rules = load_rules_from_store(&app).await.unwrap_or_default();

    let mut raw = scan_desktop_entries(&user_desktop, &custom_rules);

    // 同时扫描公共桌面（全体用户的快捷方式）
    if let Some(public_desktop) = dirs::public_dir().map(|p| p.join("Desktop")) {
        if public_desktop.exists() && public_desktop != user_desktop {
            let public_entries = scan_desktop_entries(&public_desktop, &custom_rules);
            let seen: std::collections::HashSet<String> =
                raw.iter().map(|r| r.path.clone()).collect();
            for entry in public_entries {
                if !seen.contains(&entry.path) {
                    raw.push(entry);
                }
            }
        }
    }

    // 排序：按分类 → 目录优先 → 名称
    raw.sort_by(|a, b| {
        a.category
            .cmp(&b.category)
            .then_with(|| b.is_dir.cmp(&a.is_dir))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    // 按 category 分组为抽屉
    let mut groups: BTreeMap<String, Vec<IconEntry>> = BTreeMap::new();

    for r in raw {
        let icon = IconEntry {
            icon_id: r.path.clone(),
            name: r.name,
            path: r.path,
            is_dir: r.is_dir,
            is_lnk: r.is_lnk,
            lnk_target: r.lnk_target,
        };
        groups.entry(r.category).or_default().push(icon);
    }

    let drawers: Vec<Drawer> = groups
        .into_iter()
        .map(|(drawer_id, icons)| Drawer { drawer_id, icons })
        .collect();

    Ok(drawers)
}

// --- 打开文件 ---

#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("打开文件失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&path).spawn()
            .map_err(|e| format!("打开文件失败: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(&path).spawn()
            .map_err(|e| format!("打开文件失败: {e}"))?;
    }
    Ok(())
}

// --- 持久化抽屉快照 ---

#[tauri::command]
pub async fn save_drawer_snapshot(app: AppHandle, drawers: Vec<Drawer>) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(&drawers).map_err(|e| e.to_string())?;
    store.set(SNAPSHOT_KEY, value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_drawer_snapshot(app: AppHandle) -> Result<Vec<Drawer>, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    if let Some(value) = store.get(SNAPSHOT_KEY) {
        serde_json::from_value(value).map_err(|e| format!("解析快照失败: {e}"))
    } else {
        Ok(Vec::new())
    }
}

/// 启动时后台扫描桌面并持久化快照（阻塞操作，应在独立线程中调用）
pub fn startup_scan_and_persist_blocking(app: AppHandle) {
    // 保留旧快照不动，扫描完成后直接覆盖更新；
    // is_scan_ready 始终为 true（首次启动除外），用户点击秒开
    let user_desktop = match dirs::desktop_dir() {
        Some(d) => d,
        None => {
            eprintln!("[startup_scan] 无法获取桌面路径");
            return;
        }
    };

    // 同步加载自定义规则（在阻塞上下文中，使用 tauri::Manager 方式）
    let custom_rules: Vec<Rule> = {
        let store = app.store(STORE_PATH);
        match store {
            Ok(store) => {
                store
                    .get("custom_rules")
                    .and_then(|v| serde_json::from_value(v).ok())
                    .unwrap_or_default()
            }
            Err(_) => Vec::new(),
        }
    };

    let mut raw = scan_desktop_entries(&user_desktop, &custom_rules);

    // 同时扫描公共桌面
    if let Some(public_desktop) = dirs::public_dir().map(|p| p.join("Desktop")) {
        if public_desktop.exists() && public_desktop != user_desktop {
            let public_entries = scan_desktop_entries(&public_desktop, &custom_rules);
            let seen: std::collections::HashSet<String> =
                raw.iter().map(|r| r.path.clone()).collect();
            for entry in public_entries {
                if !seen.contains(&entry.path) {
                    raw.push(entry);
                }
            }
        }
    }

    // 排序
    raw.sort_by(|a, b| {
        a.category
            .cmp(&b.category)
            .then_with(|| b.is_dir.cmp(&a.is_dir))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    // 分组
    let mut groups: BTreeMap<String, Vec<IconEntry>> = BTreeMap::new();
    for r in raw {
        let icon = IconEntry {
            icon_id: r.path.clone(),
            name: r.name,
            path: r.path,
            is_dir: r.is_dir,
            is_lnk: r.is_lnk,
            lnk_target: r.lnk_target,
        };
        groups.entry(r.category).or_default().push(icon);
    }

    let drawers: Vec<Drawer> = groups
        .into_iter()
        .map(|(drawer_id, icons)| Drawer { drawer_id, icons })
        .collect();

    // 持久化
    let store = match app.store(STORE_PATH) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[startup_scan] 打开 store 失败: {e}");
            return;
        }
    };

    let value = match serde_json::to_value(&drawers) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[startup_scan] 序列化失败: {e}");
            return;
        }
    };

    store.set(SNAPSHOT_KEY, value);

    // 写入时间戳
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    store.set(SCAN_TIMESTAMP_KEY, serde_json::Value::Number(ts.into()));

    if let Err(e) = store.save() {
        eprintln!("[startup_scan] 保存快照失败: {e}");
    }
}

/// 检查启动扫描是否已完成（快照是否存在）
#[tauri::command]
pub async fn is_scan_ready(app: AppHandle) -> Result<bool, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let has_snapshot = store.get(SNAPSHOT_KEY).is_some();
    Ok(has_snapshot)
}
