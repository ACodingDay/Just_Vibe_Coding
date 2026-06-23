use crate::rules::{self, BaseRule, ScanResult, CleanResult, ScanFileItem};
use walkdir::WalkDir;
use globset::{Glob, GlobSetBuilder};
use serde::Serialize;
use tauri::Emitter;
use tauri_plugin_store::StoreExt;

/// ─── 流式扫描 ────────────────────────────────────────

#[derive(Clone, Serialize)]
struct ScanProgressPayload {
    rule_id: String,
    rule_name: String,
    files: Vec<ScanFileItem>,
}

#[derive(Clone, Serialize)]
struct ScanCompletePayload {
    total_files: usize,
    total_size: u64,
}

/// 按规则分组扫描，每完成一组就通过事件发送给前端
pub fn scan_rules_streaming(
    app: &tauri::AppHandle,
    base_rules: &[BaseRule],
    enabled_ids: &[String],
) {
    let prefs = rules::get_user_rule_prefs(app);
    let merged = rules::merge_rules(base_rules.to_vec(), prefs.custom_rules);
    let rules = merged.as_slice();
    let mut total_files: usize = 0;
    let mut total_size: u64 = 0;

    for rule in rules {
        if !enabled_ids.contains(&rule.id) {
            continue;
        }

        let files = match rule.clean_type {
            rules::CleanType::DeleteFiles | rules::CleanType::EmptyDirectory | rules::CleanType::SendToTrash => {
                scan_file_rule_to_items(rule)
            }
            rules::CleanType::CleanOrphanedOpenWith => {
                scan_registry_open_with(rule)
            }
            _ => vec![],
        };

        let count = files.len();
        let size: u64 = files.iter().map(|f| f.size).sum();
        total_files += count;
        total_size += size;

        let _ = app.emit("cleanup-scan-progress", ScanProgressPayload {
            rule_id: rule.id.clone(),
            rule_name: rule.name.clone(),
            files,
        });
    }

    let _ = app.emit("cleanup-scan-complete", ScanCompletePayload {
        total_files,
        total_size,
    });
}

/// 扫描单个规则，返回文件级列表
fn scan_file_rule_to_items(rule: &BaseRule) -> Vec<ScanFileItem> {
    let mut items = Vec::new();
    let glob_set = build_globset_engine(&rule.patterns);

    for path_str in &rule.paths {
        for base_path in rules::expand_paths_multi(path_str) {
        if !base_path.exists() {
            continue;
        }

        let walker = if rule.patterns.iter().any(|p| p.contains("**")) {
            WalkDir::new(&base_path).into_iter()
        } else {
            WalkDir::new(&base_path).max_depth(1).into_iter()
        };

        for entry in walker.filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let rel = entry.path().strip_prefix(&base_path).unwrap_or(entry.path());
            let matches = match &glob_set {
                Some(gs) => gs.is_match(rel),
                None => true,
            };
            if matches {
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                items.push(ScanFileItem {
                    rule_id: rule.id.clone(),
                    rule_name: rule.name.clone(),
                    path: entry.path().to_string_lossy().to_string(),
                    size,
                });
            }
        }
    }
    }
    items
}

/// ─── 流式清理 ────────────────────────────────────────

#[derive(Clone, Serialize)]
struct CleanProgressPayload {
    rule_id: String,
    path: String,
    size: u64,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
struct CleanCompletePayload {
    total_cleaned: usize,
    total_freed: u64,
}

/// 按文件逐个清理，每清理一个就发送事件
pub fn clean_rules_streaming(
    app: &tauri::AppHandle,
    rules: &[BaseRule],
    enabled_ids: &[String],
    selected_paths: &[String],
    active_rule_ids: &[String],
) {
    use std::collections::HashSet;
    let selected: HashSet<String> = selected_paths.iter().cloned().collect();
    let active: HashSet<String> = active_rule_ids.iter().cloned().collect();
    let mut total_cleaned: usize = 0;
    let mut total_freed: u64 = 0;

    for rule in rules {
        if !enabled_ids.contains(&rule.id) {
            continue;
        }
        if !active.contains(&rule.id) {
            continue;
        }

        match rule.clean_type {
            rules::CleanType::DeleteFiles | rules::CleanType::EmptyDirectory => {
                total_cleaned += clean_file_rule_streaming(app, rule, &selected, &mut total_freed);
            }
            rules::CleanType::SendToTrash => {
                total_cleaned += clean_file_rule_trash_streaming(app, rule, &selected, &mut total_freed);
            }
            rules::CleanType::RunCommand => {
                let r = clean_command_rule_engine(rule, &selected);
                let _ = app.emit("cleanup-clean-progress", CleanProgressPayload {
                    rule_id: rule.id.clone(),
                    path: String::new(),
                    size: 0,
                    error: if r.errors.is_empty() { None } else { Some(r.errors.join("; ")) },
                });
            }
            rules::CleanType::EmptyRecycleBin => {
                let r = clean_recycle_bin_engine(rule);
                let _ = app.emit("cleanup-clean-progress", CleanProgressPayload {
                    rule_id: rule.id.clone(),
                    path: String::new(),
                    size: 0,
                    error: if r.errors.is_empty() { None } else { Some(r.errors.join("; ")) },
                });
            }
            rules::CleanType::CleanOrphanedOpenWith => {
                total_cleaned += clean_registry_open_with_streaming(app, rule, &selected);
            }
        }
    }

    let _ = app.emit("cleanup-clean-complete", CleanCompletePayload {
        total_cleaned,
        total_freed,
    });

    // persist stats
    if let Ok(store) = app.store("settings.json") {
        let prev_count: u64 = store.get("cleanup_total_count").and_then(|v| v.as_u64()).unwrap_or(0);
        let prev_bytes: u64 = store.get("cleanup_total_bytes").and_then(|v| v.as_u64()).unwrap_or(0);
        store.set("cleanup_total_count", serde_json::Value::from(prev_count + 1));
        store.set("cleanup_total_bytes", serde_json::Value::from(prev_bytes + total_freed));
        let _ = store.save();
    }
}

fn clean_file_rule_streaming(
    app: &tauri::AppHandle,
    rule: &BaseRule,
    selected: &std::collections::HashSet<String>,
    total_freed: &mut u64,
) -> usize {
    let mut cleaned = 0;
    let glob_set = build_globset_engine(&rule.patterns);

    for path_str in &rule.paths {
        for base_path in rules::expand_paths_multi(path_str) {
        if !base_path.exists() {
            continue;
        }

        let walker = if rule.patterns.iter().any(|p| p.contains("**")) {
            WalkDir::new(&base_path).into_iter()
        } else {
            WalkDir::new(&base_path).max_depth(1).into_iter()
        };

        let files: Vec<_> = walker
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter(|e| {
                let rel = e.path().strip_prefix(&base_path).unwrap_or(e.path());
                match &glob_set {
                    Some(gs) => gs.is_match(rel),
                    None => true,
                }
            })
            .collect();

        for entry in files {
            let file_path = entry.path().to_string_lossy().to_string();
            if !selected.contains(&file_path) {
                continue;
            }
            let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let error = match std::fs::remove_file(entry.path()) {
                Ok(_) => {
                    cleaned += 1;
                    *total_freed += file_size;
                    None
                }
                Err(e) => {
                    let locked = e.raw_os_error().map_or(false, |c| c == 32 || c == 33);
                    Some(if locked {
                        format!("文件被占用: {}", e)
                    } else {
                        format!("{}", e)
                    })
                },
            };
            let _ = app.emit("cleanup-clean-progress", CleanProgressPayload {
                rule_id: rule.id.clone(),
                path: file_path,
                size: file_size,
                error,
            });
        }
    }
    }
    cleaned
}

/// 以下为 engine 内部共享工具
fn build_globset_engine(patterns: &[String]) -> Option<globset::GlobSet> {
    if patterns.is_empty() { return None; }
    let mut builder = GlobSetBuilder::new();
    for p in patterns {
        if let Ok(glob) = Glob::new(p) {
            builder.add(glob);
        }
    }
    builder.build().ok()
}

fn clean_command_rule_engine(rule: &BaseRule, _selected: &std::collections::HashSet<String>) -> CleanResult {
    let mut errors = Vec::new();
    if let Some(cmd) = &rule.clean_command {
        match std::process::Command::new("cmd").args(["/C", cmd]).output() {
            Ok(o) if !o.status.success() => {
                errors.push(String::from_utf8_lossy(&o.stderr).to_string());
            }
            Err(e) => errors.push(format!("{}", e)),
            _ => {}
        }
    }
    CleanResult { rule_id: rule.id.clone(), files_cleaned: 0, bytes_freed: 0, errors }
}

/// ─── 注册表"打开方式"残留项扫描/清理 ────────────────────

/// 从命令行字符串中解析出可执行文件路径
/// 处理: "C:\path\app.exe" "%1"  /  C:\path\app.exe %1  /  app.exe
fn parse_exe_path(cmd: &str) -> Option<String> {
    let cmd = cmd.trim();
    if cmd.is_empty() {
        return None;
    }
    let exe = if cmd.starts_with('"') {
        // 引号包裹: "C:\path\app.exe" args...
        cmd[1..].split('"').next()?.to_string()
    } else {
        // 无引号: C:\path\app.exe args...
        cmd.split_whitespace().next()?.to_string()
    };
    if exe.is_empty() { None } else { Some(exe) }
}

/// 注册表 Applications 路径常量
const REG_APPS_PATHS: &[(&str, &str)] = &[
    ("HKCU:", r"SOFTWARE\Classes\Applications"),
    ("HKLM:", r"SOFTWARE\Classes\Applications"),
];

/// 扫描注册表中"打开方式"的孤立条目（可执行文件已不存在）
fn scan_registry_open_with(rule: &BaseRule) -> Vec<ScanFileItem> {
    use winreg::RegKey;
    use winreg::enums::*;

    let mut items = Vec::new();

    for (hive_label, base_path) in REG_APPS_PATHS {
        let hive = if *hive_label == "HKCU:" { HKEY_CURRENT_USER } else { HKEY_LOCAL_MACHINE };
        let Ok(root) = RegKey::predef(hive).open_subkey(base_path) else { continue; };

        for app_name in root.enum_keys().filter_map(|k| k.ok()) {
            // 读取 shell\open\command 默认值
            let cmd_path = format!("{}\\shell\\open\\command", app_name);
            let Ok(cmd_key) = root.open_subkey(&cmd_path) else { continue; };
            let Ok(command) = cmd_key.get_value::<String, _>("") else { continue; };

            if let Some(exe) = parse_exe_path(&command) {
                if !std::path::PathBuf::from(&exe).exists() {
                    items.push(ScanFileItem {
                        rule_id: rule.id.clone(),
                        rule_name: rule.name.clone(),
                        path: format!("{}\\{}\\{}", hive_label, base_path, app_name),
                        size: 0,
                    });
                }
            }
        }
    }
    items
}

/// 流式清理注册表"打开方式"孤立条目
fn clean_registry_open_with_streaming(
    app: &tauri::AppHandle,
    rule: &BaseRule,
    selected: &std::collections::HashSet<String>,
) -> usize {
    use winreg::RegKey;
    use winreg::enums::*;

    let mut cleaned = 0;

    for (hive_label, base_path) in REG_APPS_PATHS {
        let hive = if *hive_label == "HKCU:" { HKEY_CURRENT_USER } else { HKEY_LOCAL_MACHINE };
        let Ok(root) = RegKey::predef(hive).open_subkey_with_flags(base_path, KEY_ALL_ACCESS) else { continue; };

        let app_names: Vec<String> = root.enum_keys().filter_map(|k| k.ok()).collect();
        for app_name in app_names {
            let reg_path = format!("{}\\{}\\{}", hive_label, base_path, app_name);
            if !selected.contains(&reg_path) {
                continue;
            }
            let error = match root.delete_subkey_all(&app_name) {
                Ok(_) => {
                    cleaned += 1;
                    None
                }
                Err(e) => Some(format!("{}: {}", reg_path, e)),
            };
            let _ = app.emit("cleanup-clean-progress", CleanProgressPayload {
                rule_id: rule.id.clone(),
                path: reg_path,
                size: 0,
                error,
            });
        }
    }
    cleaned
}

/// 同步清理注册表"打开方式"孤立条目（给 ScanPage 使用）
/// 注意：此规则类型需要逐条选择清理，同步路径不支持文件级筛选，返回空结果
fn clean_registry_open_with_sync(_rule: &BaseRule) -> CleanResult {
    CleanResult {
        rule_id: _rule.id.clone(),
        files_cleaned: 0,
        bytes_freed: 0,
        errors: vec![],
    }
}

fn clean_recycle_bin_engine(rule: &BaseRule) -> CleanResult {
    let errors = match std::process::Command::new("cmd")
        .args(["/C", "rd /s /q %systemdrive%\\$Recycle.Bin"]).output()
    {
        Err(e) => vec![format!("{}", e)],
        _ => vec![],
    };
    CleanResult { rule_id: rule.id.clone(), files_cleaned: 0, bytes_freed: 0, errors }
}

// ── 以下是旧的同步版本（保留给 ScanPage 使用）──


/// 扫描启用的规则，返回每条规则的文件数和总大小
pub fn scan_rules(rules: &[BaseRule], enabled_ids: &[String]) -> Vec<ScanResult> {
    let mut results = Vec::new();

    for rule in rules {
        if !enabled_ids.contains(&rule.id) {
            continue;
        }

        match rule.clean_type {
            rules::CleanType::DeleteFiles | rules::CleanType::SendToTrash => {
                let (count, size) = scan_file_rule(rule);
                results.push(ScanResult {
                    rule_id: rule.id.clone(),
                    file_count: count,
                    total_size: size,
                });
            }
            rules::CleanType::EmptyDirectory => {
                let (count, size) = scan_file_rule(rule);
                results.push(ScanResult {
                    rule_id: rule.id.clone(),
                    file_count: count,
                    total_size: size,
                });
            }
            rules::CleanType::RunCommand | rules::CleanType::EmptyRecycleBin => {
                // 命令类型和回收站类型无法预估大小
                results.push(ScanResult {
                    rule_id: rule.id.clone(),
                    file_count: 0,
                    total_size: 0,
                });
            }
            rules::CleanType::CleanOrphanedOpenWith => {
                let items = scan_registry_open_with(rule);
                results.push(ScanResult {
                    rule_id: rule.id.clone(),
                    file_count: items.len() as u64,
                    total_size: 0,
                });
            }
        }
    }

    results
}

/// 扫描文件类型规则
fn scan_file_rule(rule: &BaseRule) -> (u64, u64) {
    let mut file_count: u64 = 0;
    let mut total_size: u64 = 0;

    // 构建 globset
    let glob_set = build_globset(&rule.patterns);

    for path_str in &rule.paths {
        for base_path in rules::expand_paths_multi(path_str) {
        if !base_path.exists() {
            continue;
        }

        let walker = if rule.patterns.iter().any(|p| p.contains("**")) {
            WalkDir::new(&base_path).into_iter()
        } else {
            WalkDir::new(&base_path).max_depth(1).into_iter()
        };

        for entry in walker.filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }

            let rel_path = entry.path().strip_prefix(&base_path).unwrap_or(entry.path());
            let matches = match &glob_set {
                Some(gs) => gs.is_match(rel_path),
                None => true,
            };

            if matches {
                file_count += 1;
                if let Ok(meta) = entry.metadata() {
                    total_size += meta.len();
                }
            }
        }
    }
    }

    (file_count, total_size)
}

/// 构建 GlobSet
fn build_globset(patterns: &[String]) -> Option<globset::GlobSet> {
    if patterns.is_empty() {
        return None;
    }
    let mut builder = GlobSetBuilder::new();
    for p in patterns {
        if let Ok(glob) = Glob::new(p) {
            builder.add(glob);
        }
    }
    builder.build().ok()
}

/// 执行清理
pub fn clean_rules(rules: &[BaseRule], enabled_ids: &[String]) -> Vec<CleanResult> {
    let mut results = Vec::new();

    for rule in rules {
        if !enabled_ids.contains(&rule.id) {
            continue;
        }

        let result = match rule.clean_type {
            rules::CleanType::DeleteFiles | rules::CleanType::EmptyDirectory => {
                clean_file_rule(rule)
            }
            rules::CleanType::SendToTrash => clean_file_rule_trash(rule),
            rules::CleanType::RunCommand => clean_command_rule(rule),
            rules::CleanType::EmptyRecycleBin => clean_recycle_bin(rule),
            rules::CleanType::CleanOrphanedOpenWith => clean_registry_open_with_sync(rule),
        };

        results.push(result);
    }

    results
}

/// 清理文件类型规则
fn clean_file_rule(rule: &BaseRule) -> CleanResult {
    let mut files_cleaned: u64 = 0;
    let mut bytes_freed: u64 = 0;
    let mut errors: Vec<String> = Vec::new();

    let glob_set = build_globset(&rule.patterns);

    for path_str in &rule.paths {
        for base_path in rules::expand_paths_multi(path_str) {
        if !base_path.exists() {
            continue;
        }

        let walker = if rule.patterns.iter().any(|p| p.contains("**")) {
            WalkDir::new(&base_path).into_iter()
        } else {
            WalkDir::new(&base_path).max_depth(1).into_iter()
        };

        // 收集文件路径，避免在迭代中删除导致问题
        let files: Vec<_> = walker
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter(|e| {
                let rel = e.path().strip_prefix(&base_path).unwrap_or(e.path());
                match &glob_set {
                    Some(gs) => gs.is_match(rel),
                    None => true,
                }
            })
            .collect();

        for entry in files {
            let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            match std::fs::remove_file(entry.path()) {
                Ok(_) => {
                    files_cleaned += 1;
                    bytes_freed += file_size;
                }
                Err(e) => {
                    // 文件可能被占用，记录错误但不中断
                    errors.push(format!("{}: {}", entry.path().display(), e));
                }
            }
        }
    }
    }

    CleanResult {
        rule_id: rule.id.clone(),
        files_cleaned,
        bytes_freed,
        errors,
    }
}

/// 执行命令类型规则
fn clean_command_rule(rule: &BaseRule) -> CleanResult {
    let mut errors = Vec::new();

    if let Some(cmd) = &rule.clean_command {
        let result = std::process::Command::new("cmd")
            .args(["/C", cmd])
            .output();

        match result {
            Ok(output) if output.status.success() => {}
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if !stderr.is_empty() {
                    errors.push(stderr);
                }
            }
            Err(e) => {
                errors.push(format!("执行命令失败: {}", e));
            }
        }
    }

    CleanResult {
        rule_id: rule.id.clone(),
        files_cleaned: 0,
        bytes_freed: 0,
        errors,
    }
}

/// 清空回收站
fn clean_recycle_bin(rule: &BaseRule) -> CleanResult {
    let mut errors = Vec::new();

    // 使用 Windows 命令清空回收站
    let result = std::process::Command::new("cmd")
        .args(["/C", "rd /s /q %systemdrive%\\$Recycle.Bin"])
        .output();

    if let Err(e) = result {
        errors.push(format!("清空回收站失败: {}", e));
    }

    CleanResult {
        rule_id: rule.id.clone(),
        files_cleaned: 0,
        bytes_freed: 0,
        errors,
    }
}

/// SendToTrash: move files to recycle bin (batch)
fn clean_file_rule_trash(rule: &BaseRule) -> CleanResult {
    let mut files_cleaned: u64 = 0;
    let mut bytes_freed: u64 = 0;
    let mut errors: Vec<String> = Vec::new();
    let glob_set = build_globset(&rule.patterns);
    for path_str in &rule.paths {
        for base_path in rules::expand_paths_multi(path_str) {
        if !base_path.exists() { continue; }
        let walker = if rule.patterns.iter().any(|p| p.contains("**")) {
            WalkDir::new(&base_path).into_iter()
        } else { WalkDir::new(&base_path).max_depth(1).into_iter() };
        let files: Vec<_> = walker.filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).filter(|e| {
            let rel = e.path().strip_prefix(&base_path).unwrap_or(e.path());
            match &glob_set { Some(gs) => gs.is_match(rel), None => true }
        }).collect();
        for entry in files {
            let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            match trash::delete(entry.path()) {
                Ok(_) => { files_cleaned += 1; bytes_freed += file_size; }
                Err(e) => { errors.push(format!("{}: {}", entry.path().display(), e)); }
            }
        }
    }
    }
    CleanResult { rule_id: rule.id.clone(), files_cleaned, bytes_freed, errors }
}

/// SendToTrash: move files to recycle bin (streaming)
fn clean_file_rule_trash_streaming(app: &tauri::AppHandle, rule: &BaseRule, _selected: &std::collections::HashSet<String>, total_freed: &mut u64) -> usize {
    let mut cleaned: usize = 0;
    let glob_set = build_globset_engine(&rule.patterns);
    for path_str in &rule.paths {
        for base_path in rules::expand_paths_multi(path_str) {
        if !base_path.exists() { continue; }
        let walker = if rule.patterns.iter().any(|p| p.contains("**")) {
            WalkDir::new(&base_path).into_iter()
        } else { WalkDir::new(&base_path).max_depth(1).into_iter() };
        let files: Vec<_> = walker.filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).filter(|e| {
            let rel = e.path().strip_prefix(&base_path).unwrap_or(e.path());
            match &glob_set { Some(gs) => gs.is_match(rel), None => true }
        }).collect();
        for entry in files {
            let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            match trash::delete(entry.path()) {
                Ok(_) => { cleaned += 1; *total_freed += file_size;
                    let _ = app.emit("cleanup-clean-progress", CleanProgressPayload { rule_id: rule.id.clone(), path: entry.path().to_string_lossy().to_string(), size: file_size, error: None });
                }
                Err(e) => {
                    let msg = format!("移入回收站失败: {}", e);
                    let _ = app.emit("cleanup-clean-progress", CleanProgressPayload { rule_id: rule.id.clone(), path: entry.path().to_string_lossy().to_string(), size: file_size, error: Some(msg) });
                }
            }
        }
    }
    }
    cleaned
}

