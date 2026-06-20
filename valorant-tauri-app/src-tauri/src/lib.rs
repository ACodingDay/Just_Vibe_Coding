mod process;
mod monitor;

use tauri::Manager;

// ═══ 工具命令 ═══

// 检测是否为开发模式（编译期确定，零运行时开销）
#[tauri::command]
fn is_dev() -> bool {
    cfg!(debug_assertions)
}

// 返回应用版本号（来自 Cargo.toml）
#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// ═══ 应用入口 ═══

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 启动时清理可能残留的 ETW 会话
    monitor::stop_all_monitors();

    // 在主线程初始化设备路径映射表（QueryDosDeviceW 必须在主线程调用）
    monitor::init_device_path_map();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Debug)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .build(),
        );

    builder
        .invoke_handler(tauri::generate_handler![
            process::is_elevated,
            process::is_process_running,
            process::fix_process_cpu_and_affinity,
            process::restore_process,
            monitor::start_monitoring,
            monitor::stop_monitoring,
            monitor::get_monitor_log,
            monitor::drain_notifications,
            monitor::export_monitor_log,
            is_dev,
            app_version,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                monitor::stop_all_monitors();
            }
        });
}
