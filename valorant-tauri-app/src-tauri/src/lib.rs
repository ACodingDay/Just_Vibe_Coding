// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use log::{info, warn};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use sysinfo::System;
use tauri::Manager;
use tauri_plugin_log;
use windows::Win32::Foundation::{CloseHandle, GetLastError, HANDLE, LUID};
use windows::Win32::Security::{
    AdjustTokenPrivileges, GetTokenInformation, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES,
    SE_DEBUG_NAME, SE_PRIVILEGE_ENABLED, TOKEN_ADJUST_PRIVILEGES, TOKEN_ELEVATION,
    TOKEN_PRIVILEGES, TOKEN_QUERY, TokenElevation,
};
use windows::Win32::System::Threading::{
    GetCurrentProcess, GetPriorityClass, OpenProcess, OpenProcessToken, SetPriorityClass,
    SetProcessAffinityMask, GetProcessAffinityMask, IDLE_PRIORITY_CLASS,
    PROCESS_QUERY_INFORMATION, PROCESS_SET_INFORMATION,
};

// E2: 存储进程原始状态，用于 toggle 关闭时恢复
struct ProcessOriginalState {
    pid: u32,
    affinity_mask: usize,
    priority_class: u32,
}

static PROCESS_STATES: LazyLock<Mutex<HashMap<String, ProcessOriginalState>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// E1: 检测当前是否以管理员身份运行
#[tauri::command]
fn is_elevated() -> bool {
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut ret_len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        )
        .is_ok();
        let _ = CloseHandle(token);
        ok && elevation.TokenIsElevated != 0
    }
}

// 提升进程权限以获取 SeDebugPrivilege
unsafe fn enable_debug_privilege() -> Result<(), String> {
    let mut token_handle: HANDLE = HANDLE::default();

    // 打开当前进程的令牌
    if OpenProcessToken(
        GetCurrentProcess(),
        TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
        &mut token_handle,
    )
    .is_err()
    {
        return Err(format!("无法打开进程令牌，错误码: {:?}", GetLastError()));
    }

    // 查找 SeDebugPrivilege 的 LUID
    let mut luid = LUID::default();
    if LookupPrivilegeValueW(None, SE_DEBUG_NAME, &mut luid).is_err() {
        let _ = CloseHandle(token_handle);
        return Err(format!(
            "无法查找 SeDebugPrivilege，错误码: {:?}",
            GetLastError()
        ));
    }

    // 准备 TOKEN_PRIVILEGES 结构
    let token_privileges = TOKEN_PRIVILEGES {
        PrivilegeCount: 1,
        Privileges: [LUID_AND_ATTRIBUTES {
            Luid: luid,
            Attributes: SE_PRIVILEGE_ENABLED,
        }],
    };

    // 调整令牌权限
    if AdjustTokenPrivileges(token_handle, false, Some(&token_privileges), 0, None, None).is_err() {
        let _ = CloseHandle(token_handle);
        return Err(format!("无法调整令牌权限，错误码: {:?}", GetLastError()));
    }

    // 检查是否真的成功（GetLastError 返回 ERROR_SUCCESS (0) 表示成功）
    // 注意：ERROR_NOT_ALL_ASSIGNED (1300) 表示部分权限未授予
    let last_error = GetLastError();
    match last_error.0 {
        0 => {} // 成功
        1300 => {
            let _ = CloseHandle(token_handle);
            return Err("SeDebugPrivilege 未授予（可能被组策略禁用）".to_string());
        }
        _ => {
            let _ = CloseHandle(token_handle);
            return Err(format!(
                "AdjustTokenPrivileges 失败，错误码: {:?}",
                last_error
            ));
        }
    }

    let _ = CloseHandle(token_handle);
    Ok(())
}

// S3: 白名单——只允许操作这两个进程，其余一律拒绝
const ALLOWED_PROCESSES: &[&str] = &["SGuard64.exe", "SGuardSvc64.exe"];

fn is_allowed_process(process_name: &str) -> bool {
    ALLOWED_PROCESSES
        .iter()
        .any(|&p| p.eq_ignore_ascii_case(process_name))
}

// 检测某个进程是否正在运行
#[tauri::command]
fn is_process_running(process_name: &str) -> bool {
    // 初始化系统信息管理器
    let mut sys = System::new_all();
    // 刷新所有进程信息（必须调用，否则拿不到最新数据）
    sys.refresh_all();

    // 精确匹配
    for _process in sys.processes_by_exact_name(process_name.as_ref()) {
        return true;
    }
    false
}

// 修改某个进程的cpu和亲和性
#[tauri::command]
fn fix_process_cpu_and_affinity(process_name: &str) -> (bool, String) {
    // S3: 白名单检查——只允许操作指定进程
    if !is_allowed_process(process_name) {
        return (
            false,
            format!("{} 不在允许列表中，无法修改其属性", process_name),
        );
    }

    // 获取 CPU 总数
    let mut sys = System::new_all();
    sys.refresh_all();
    let cpu_cnt: usize = sys.cpus().len();

    // 检查 CPU 数量是否有效
    if cpu_cnt == 0 {
        return (false, "无法获取 CPU 信息".to_string());
    }

    // 尝试提升权限以访问受保护的进程
    unsafe {
        if let Err(e) = enable_debug_privilege() {
            warn!("提升权限失败（可能影响对系统进程的访问）: {}", e);
            return (
                false,
                format!("权限提升失败: {}。请确保以管理员身份运行此程序。", e),
            );
        }
        info!("SeDebugPrivilege 权限提升成功");
    }

    let mut last_error = String::from("未找到进程或所有进程操作失败");
    let mut found_process = false;

    info!("开始查找进程: {}", process_name);
    for process in sys.processes_by_exact_name(process_name.as_ref()) {
        found_process = true;
        let pid = process.pid();
        info!(
            "找到进程 {} (PID: {}), 尝试打开进程句柄",
            process_name,
            pid.as_u32()
        );

        unsafe {
            // 打开进程句柄，需要设置信息和查询信息的权限
            match OpenProcess(
                PROCESS_SET_INFORMATION | PROCESS_QUERY_INFORMATION,
                false,
                pid.as_u32(),
            ) {
                Ok(handle) => {
                    info!(
                        "成功打开进程 {} (PID: {}) 的句柄",
                        process_name,
                        pid.as_u32()
                    );

                    // E2: 读取并保存原始亲和性和优先级（用于 toggle 关闭时恢复）
                    let mut original_affinity: usize = 0;
                    let mut _system_affinity: usize = 0;
                    if GetProcessAffinityMask(
                        handle,
                        &mut original_affinity,
                        &mut _system_affinity,
                    )
                    .is_err()
                    {
                        let error_msg = format!(
                            "读取进程 {} (PID: {}) 原始亲和性失败",
                            process_name,
                            pid.as_u32(),
                        );
                        warn!("{}", error_msg);
                        let _ = CloseHandle(handle);
                        last_error = error_msg;
                        continue;
                    }
                    let original_priority = GetPriorityClass(handle);
                    info!(
                        "进程 {} (PID: {}) 原始亲和性: 0x{:X}, 原始优先级: {}",
                        process_name,
                        pid.as_u32(),
                        original_affinity,
                        original_priority
                    );

                    // 计算亲和性掩码：只绑定到最后一个 CPU（例如 16 个 CPU 则绑定到 CPU15）
                    // 掩码 = 2^(cpu_cnt-1)，例如 16 个 CPU 时掩码为 0x8000
                    let affinity_mask: usize = 1 << (cpu_cnt - 1);
                    info!("CPU总数: {}, 亲和性掩码: 0x{:X}", cpu_cnt, affinity_mask);

                    // 设置进程亲和性
                    if let Err(e) = SetProcessAffinityMask(handle, affinity_mask) {
                        let error_code = GetLastError();
                        let error_msg = format!(
                            "设置进程 {} (PID: {}) 亲和性失败: {:?}, Windows错误码: {:?}。可能原因：进程已终止、权限不足或进程受保护。",
                            process_name, pid.as_u32(), e, error_code
                        );
                        warn!("{}", error_msg);
                        let _ = CloseHandle(handle);
                        last_error = error_msg;
                        continue;
                    }
                    info!(
                        "成功设置进程 {} (PID: {}) 的亲和性为 0x{:X}",
                        process_name,
                        pid.as_u32(),
                        affinity_mask
                    );

                    // 设置进程优先级为 Idle（空闲优先级）
                    if let Err(e) = SetPriorityClass(handle, IDLE_PRIORITY_CLASS) {
                        let error_code = GetLastError();
                        let error_msg = format!(
                            "设置进程 {} (PID: {}) 优先级失败: {:?}, Windows错误码: {:?}。可能原因：进程已终止、权限不足或进程受保护。",
                            process_name, pid.as_u32(), e, error_code
                        );
                        warn!("{}", error_msg);
                        let _ = CloseHandle(handle);
                        last_error = error_msg;
                        continue;
                    }
                    info!(
                        "成功设置进程 {} (PID: {}) 的优先级为 Idle",
                        process_name,
                        pid.as_u32()
                    );

                    // E2: 保存原始状态到全局 HashMap
                    if let Ok(mut states) = PROCESS_STATES.lock() {
                        states.insert(
                            process_name.to_string(),
                            ProcessOriginalState {
                                pid: pid.as_u32(),
                                affinity_mask: original_affinity,
                                priority_class: original_priority,
                            },
                        );
                    }

                    // 所有操作成功，关闭句柄并返回 true
                    let _ = CloseHandle(handle);
                    info!(
                        "所有操作成功完成，进程 {} (PID: {})",
                        process_name,
                        pid.as_u32()
                    );
                    return (
                        true,
                        format!(
                            "成功设置进程 {} (PID: {}) 的亲和性和优先级",
                            process_name,
                            pid.as_u32()
                        ),
                    );
                }
                Err(e) => {
                    let error_code = GetLastError();
                    let error_msg = match error_code.0 {
                        5 => format!(
                            "无法打开进程 {} (PID: {}): 访问被拒绝 (错误码 5)。请确保以管理员身份运行此程序。",
                            process_name, pid.as_u32()
                        ),
                        87 => format!(
                            "无法打开进程 {} (PID: {}): 参数无效 (错误码 87)。进程可能已终止。",
                            process_name, pid.as_u32()
                        ),
                        _ => format!(
                            "无法打开进程 {} (PID: {}): {:?}, Windows错误码: {:?}。",
                            process_name, pid.as_u32(), e, error_code
                        ),
                    };
                    warn!("{}", error_msg);
                    last_error = error_msg;
                    continue;
                }
            }
        }
    }

    if !found_process {
        last_error = format!("未找到进程 {}", process_name);
        warn!("{}", last_error);
    } else {
        warn!("所有进程操作失败，最后错误: {}", last_error);
    }

    (false, last_error)
}

// E2: 恢复进程的原始亲和性和优先级
#[tauri::command]
fn restore_process(process_name: &str) -> (bool, String) {
    // 从存储中取出原始状态（同时移除条目）
    let state = {
        let mut states = match PROCESS_STATES.lock() {
            Ok(s) => s,
            Err(e) => return (false, format!("内部锁错误: {}", e)),
        };
        match states.remove(process_name) {
            Some(s) => s,
            None => {
                info!("未找到进程 {} 的保存状态，可能未曾优化或已恢复", process_name);
                return (true, format!("{} 无需恢复（未找到保存的原始状态）", process_name));
            }
        }
    };

    // 验证进程仍在运行且 PID 未变（防止 PID 被复用）
    let mut sys = System::new_all();
    sys.refresh_all();

    let pid_valid = sys
        .processes_by_exact_name(process_name.as_ref())
        .any(|p| p.pid().as_u32() == state.pid);

    if !pid_valid {
        info!(
            "进程 {} (PID: {}) 已不存在或 PID 已变，跳过恢复",
            process_name, state.pid
        );
        return (
            true,
            format!(
                "{} 进程已不存在 (原PID: {})，无需恢复",
                process_name, state.pid
            ),
        );
    }

    unsafe {
        if let Err(e) = enable_debug_privilege() {
            return (false, format!("权限提升失败: {}", e));
        }

        match OpenProcess(
            PROCESS_SET_INFORMATION | PROCESS_QUERY_INFORMATION,
            false,
            state.pid,
        ) {
            Ok(handle) => {
                // 恢复亲和性
                if let Err(e) = SetProcessAffinityMask(handle, state.affinity_mask) {
                    let _ = CloseHandle(handle);
                    return (
                        false,
                        format!(
                            "恢复进程 {} (PID: {}) 亲和性失败: {:?}",
                            process_name, state.pid, e
                        ),
                    );
                }

                // 恢复优先级
                use windows::Win32::System::Threading::PROCESS_CREATION_FLAGS;
                if let Err(e) = SetPriorityClass(handle, PROCESS_CREATION_FLAGS(state.priority_class)) {
                    let _ = CloseHandle(handle);
                    return (
                        false,
                        format!(
                            "恢复进程 {} (PID: {}) 优先级失败: {:?}",
                            process_name, state.pid, e
                        ),
                    );
                }

                let _ = CloseHandle(handle);
                info!(
                    "成功恢复进程 {} (PID: {}) 的原始状态: 亲和性=0x{:X}, 优先级={}",
                    process_name, state.pid, state.affinity_mask, state.priority_class
                );
                (
                    true,
                    format!(
                        "成功恢复进程 {} (PID: {}) 的原始亲和性和优先级",
                        process_name, state.pid
                    ),
                )
            }
            Err(e) => {
                let error_code = GetLastError();
                (
                    false,
                    format!(
                        "无法打开进程 {} (PID: {}): {:?}, 错误码: {:?}",
                        process_name, state.pid, e, error_code
                    ),
                )
            }
        }
    }
}

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Dev 模式：输出到终端；Build 模式：输出到文件
    #[cfg(debug_assertions)]
    let log_plugin = tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Debug)
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Stdout,
        ))
        .build();

    #[cfg(not(debug_assertions))]
    let log_plugin = tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Folder {
                path: std::env::temp_dir().join("valorant-app-logs"),
                file_name: Some("app".to_string()),
            },
        ))
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
        .build();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(log_plugin);

    builder
        .invoke_handler(tauri::generate_handler![
            is_process_running,
            fix_process_cpu_and_affinity,
            restore_process,
            is_elevated,
            is_dev,
            app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
