use chrono::{FixedOffset, TimeZone, Utc};
use log::{info, warn};
use serde::Serialize;
use std::cell::Cell;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use std::thread::JoinHandle;
use sysinfo::System;
use windows::Win32::System::Diagnostics::Etw::{
    ControlTraceW, EnableTraceEx2, OpenTraceW, ProcessTrace, StartTraceW, CONTROLTRACE_HANDLE,
    PROCESSTRACE_HANDLE, EVENT_CONTROL_CODE_DISABLE_PROVIDER, EVENT_CONTROL_CODE_ENABLE_PROVIDER,
    EVENT_TRACE_CONTROL_STOP, EVENT_TRACE_LOGFILEW, EVENT_TRACE_PROPERTIES,
    EVENT_TRACE_REAL_TIME_MODE, PROCESS_TRACE_MODE_EVENT_RECORD, PROCESS_TRACE_MODE_REAL_TIME,
    WNODE_FLAG_TRACED_GUID,
};

use crate::process;

// ═══ 常量与结构 ═══

// Microsoft-Windows-Kernel-FileIO Provider GUID
const FILEIO_GUID: windows::core::GUID =
    windows::core::GUID::from_u128(0xEDD08927_9CC4_4E65_B970_C2560FB5C289);

const MAX_LOG_ENTRIES: usize = 1000;
const ETW_SESSION_NAME: &str = "ValorantAppFileMonitor";

// ═══ 设备路径 → 盘符映射 ═══

/// 缓存 \Device\HarddiskVolumeN → C: 等映射
static DEVICE_PATH_MAP: LazyLock<Mutex<Vec<(String, String)>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

/// 构建/刷新设备路径映射表（QueryDosDeviceW 枚举 A-Z 盘符）
fn refresh_device_path_map() {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::QueryDosDeviceW;

    let mut mappings: Vec<(String, String)> = Vec::new();

    for letter in b'A'..=b'Z' {
        let drive = format!("{}:", letter as char);
        let drive_wide: Vec<u16> = drive.encode_utf16().chain(std::iter::once(0)).collect();
        let mut buf = vec![0u16; 260];

        let len = unsafe { QueryDosDeviceW(PCWSTR(drive_wide.as_ptr()), Some(&mut buf)) };
        if len > 0 {
            // FIX: QueryDosDeviceW 返回长度不含 \0，trim 掉可能的尾部 null 字符
            let device_path = String::from_utf16_lossy(&buf[..len as usize])
                .trim_end_matches('\0')
                .to_string();
            // 按设备路径长度降序排列，确保最长前缀优先匹配
            mappings.push((device_path, drive));
        }
    }
    // info!("refresh_device_path_map: 枚举到 {} 个盘符映射", mappings.len());
    // 长路径优先匹配（\Device\HarddiskVolume10 优先于 \Device\HarddiskVolume1）
    mappings.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

    if let Ok(mut map) = DEVICE_PATH_MAP.lock() {
        *map = mappings;
    }
}

/// 公开初始化函数，由主线程在应用启动时调用
/// FIX: QueryDosDeviceW 必须在主线程中执行，ETW 回调线程中会失败
pub(crate) fn init_device_path_map() {
    // info!("开始初始化设备路径映射表 (主线程)...");
    refresh_device_path_map();
    // let count = DEVICE_PATH_MAP.lock().map(|m| m.len()).unwrap_or(0);
    // info!("设备路径映射表初始化完成，共 {} 条映射", count);
}

/// 将内核设备路径转换为用户态路径
/// 支持: \Device\HarddiskVolume3\... → C:\...  以及  \??\C:\... → C:\...
fn convert_device_path(device_path: &str) -> String {
    // FIX: 处理 \??\ NT 命名空间 DOS 设备前缀（ETW 事件常见格式）
    if device_path.starts_with("\\??\\") {
        return device_path[4..].to_string();
    }

    // 系统占位符：ETW 中无名文件对象（管道等）的标记，无需转换
    if device_path == "\\FI_UNKNOWN" {
        return device_path.to_string();
    }

    // 映射表已在应用启动时由主线程初始化（init_device_path_map），
    // 若为空说明初始化失败，跳过转换避免在 ETW 回调线程中调用 QueryDosDeviceW
    if let Ok(map) = DEVICE_PATH_MAP.lock() {
        if map.is_empty() {
            // warn!("[路径转换] 映射表为空，无法转换路径 (init_device_path_map 可能未执行或失败)");
            return device_path.to_string();
        }
        for (device_prefix, drive_letter) in map.iter() {
            if device_path.starts_with(device_prefix.as_str()) {
                let remainder = &device_path[device_prefix.len()..];
                return format!("{}{}", drive_letter, remainder);
            }
        }
    }
    // 无法转换，原样返回
    // warn!("[路径转换] 无法识别的路径格式: {}", device_path);
    device_path.to_string()
}

/// 活跃的监听会话信息
struct MonitorSession {
    pids: Vec<u32>,
}

/// 监听日志条目（序列化为 JSON 传给前端）
#[derive(Clone, Serialize)]
pub(crate) struct MonitorLogEntry {
    id: u64,
    count: u32,
    process_name: String,
    operation: String,
    file_path: String,
    timestamp: f64,
}

// ═══ 全局静态变量 ═══

/// ETW 追踪句柄（INVALID_PROCESSTRACE_HANDLE = u64::MAX）
static TRACE_HANDLE: LazyLock<Mutex<PROCESSTRACE_HANDLE>> =
    LazyLock::new(|| Mutex::new(PROCESSTRACE_HANDLE { Value: u64::MAX }));
/// ETW 会话控制句柄
static SESSION_HANDLE: LazyLock<Mutex<CONTROLTRACE_HANDLE>> =
    LazyLock::new(|| Mutex::new(CONTROLTRACE_HANDLE { Value: 0 }));
/// 当前活跃的监听会话（进程名 → 会话信息）
static ACTIVE_MONITORS: LazyLock<Mutex<HashMap<String, MonitorSession>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
/// 全局监听事件日志
// FIX (Bug #2): 使用 VecDeque 替代 Vec，pop_front O(1) 替代 remove(0) O(n)
static MONITOR_LOG: LazyLock<Mutex<VecDeque<MonitorLogEntry>>> =
    LazyLock::new(|| Mutex::new(VecDeque::new()));
/// ETW 后台处理线程
static ETW_THREAD: LazyLock<Mutex<Option<JoinHandle<()>>>> =
    LazyLock::new(|| Mutex::new(None));
/// FileObject → 文件路径缓存（由 NameCreate 事件填充，NameDelete 时清除）
static FILE_OBJECT_CACHE: LazyLock<Mutex<HashMap<u64, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
/// 日志 ID 自增计数器（应用启动后从 1 开始）
// FIX (Bug #3): 用 AtomicU64 替代 Mutex<u64>，避免 ETW 高频回调中不必要锁争用
static NEXT_LOG_ID: AtomicU64 = AtomicU64::new(1);
/// PID 轮询线程运行标志
static POLLING_RUNNING: LazyLock<AtomicBool> = LazyLock::new(|| AtomicBool::new(false));
/// 待推送给前端的通知队列（进程启动检测后写入）
static PENDING_NOTIFICATIONS: LazyLock<Mutex<Vec<String>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));
/// ETW 初始化互斥锁（防止并发创建会话）
static ETW_INIT_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
/// 会话启动中标志（防止重复触发冷启动）
static ETW_STARTING: AtomicBool = AtomicBool::new(false);

// ═══ 工具函数 ═══

/// 将 Manifest Provider EventId（Task 值）映射为操作名称
/// 基于 wevtutil gp Microsoft-Windows-Kernel-File 输出
fn eventid_to_operation(event_id: u16) -> Option<&'static str> {
    match event_id {
        10 => Some("NameCreate"),    // 文件名创建（用于缓存路径）
        11 => Some("NameDelete"),    // 文件名删除（清除缓存）
        12 => Some("Create"),        // 文件创建/打开
        // 13 => Cleanup, 14 => Close — 太频繁，跳过
        15 => Some("Read"),          // 读取
        16 => Some("Write"),         // 写入
        17 => Some("SetInfo"),       // 设置文件信息
        18 => Some("SetDelete"),     // 标记删除
        19 => Some("Rename"),        // 重命名
        // 20 => DirEnum, 21 => Flush, 22 => QueryInfo, 23 => FSCTL — 跳过
        // 24 => OperationEnd — 太频繁，跳过
        // 25 => DirNotify — 跳过
        26 => Some("DeletePath"),    // 删除路径
        27 => Some("RenamePath"),    // 重命名路径
        28 => Some("SetLinkPath"),   // 设置链接路径
        29 => Some("SetLink"),       // 设置链接
        30 => Some("CreateNewFile"), // 新建文件
        _ => None,                   // 未知/不需要的事件
    }
}

/// 从 ETW 事件载荷中解析 UTF-16LE 宽字符串（以 null 结尾）
fn parse_wide_string(data: &[u8]) -> String {
    // FIX (Bug #4): 检测并警告奇数长度尾字节（chunks_exact 会静默丢弃）
    if data.len() % 2 != 0 {
        // warn!("[ETW] parse_wide_string 载荷长度为奇数 ({} bytes)，末尾 1 字节将丢失", data.len());
    }
    let u16_slice: Vec<u16> = data
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    let end = u16_slice.iter().position(|&c| c == 0).unwrap_or(u16_slice.len());
    String::from_utf16_lossy(&u16_slice[..end])
}

// ═══ Payload 布局 ═══

/// 根据 manifest 返回 FileObject 在 payload 中的偏移（用于缓存键）
fn get_file_object_offset(event_id: u16, version: u8) -> Option<usize> {
    match event_id {
        12 | 30 if version == 1 => Some(8),   // Create / CreateNewFile v1
        12 | 30 => Some(16),                   // Create / CreateNewFile v0
        15 | 16 if version == 1 => Some(16),   // Read / Write v1
        15 | 16 => Some(24),                   // Read / Write v0
        17 | 18 | 19 | 29 if version == 1 => Some(8),   // SetInfo / SetDelete / Rename / SetLink v1
        17 | 18 | 19 | 29 => Some(16),                  // SetInfo / SetDelete / Rename / SetLink v0
        26 | 27 | 28 if version == 1 => Some(8),   // DeletePath / RenamePath / SetLinkPath v1
        26 | 27 | 28 => Some(16),                   // DeletePath / RenamePath / SetLinkPath v0
        _ => None,
    }
}

/// 根据 manifest (Microsoft-Windows-Kernel-File.xml) 返回 FileKey 在 payload 中的偏移
fn get_file_key_offset(event_id: u16, version: u8) -> Option<usize> {
    match event_id {
        10 | 11 => Some(0),  // NameCreate / NameDelete
        15 | 16 if version == 1 => Some(24), // Read / Write v1
        15 | 16 => Some(32), // Read / Write v0
        17 | 18 | 19 | 29 if version == 1 => Some(16), // SetInfo / SetDelete / Rename / SetLink v1
        17 | 18 | 19 | 29 => Some(24), // SetInfo / SetDelete / Rename / SetLink v0
        26 | 27 | 28 if version == 1 => Some(16), // DeletePath / RenamePath / SetLinkPath v1
        26 | 27 | 28 => Some(24), // DeletePath / RenamePath / SetLinkPath v0
        _ => None,
    }
}

// ═══ 日志去重 ═══

/// FIX: 去重合并工具函数 —— 同进程、同操作、同文件路径、5 秒内的重复事件合并为一条
fn try_merge_or_push(
    log: &mut VecDeque<MonitorLogEntry>,
    process_name: &str,
    operation: &str,
    file_path: &str,
    timestamp: f64,
) {
    const MERGE_WINDOW_MS: f64 = 5000.0;

    let can_merge = log.back().map_or(false, |last| {
        last.process_name == process_name
            && last.operation == operation
            && last.file_path == file_path
            && (timestamp - last.timestamp) < MERGE_WINDOW_MS
    });

    if can_merge {
        // 合并：增量计数 + 更新时间戳
        if let Some(last) = log.back_mut() {
            last.count += 1;
            last.timestamp = timestamp;
        }
    } else {
        // 新条目
        let id = NEXT_LOG_ID.fetch_add(1, Ordering::Relaxed);
        log.push_back(MonitorLogEntry {
            id,
            count: 1,
            process_name: process_name.to_string(),
            operation: operation.to_string(),
            file_path: file_path.to_string(),
            timestamp,
        });
        // FIX (Bug #2): VecDeque::pop_front() O(1) 替代 Vec::remove(0) O(n)
        while log.len() > MAX_LOG_ENTRIES {
            log.pop_front();
        }
    }
}

// ═══ ETW 事件回调 ═══

/// ETW 事件回调函数（由 ProcessTrace 在后台线程中调用）
/// 适配 Microsoft-Windows-Kernel-File Manifest Provider（EventId = Task 值）
// FIX (Bug #6): 外层重入保护 — info!() 写日志文件可能触发 ETW 事件导致递归
unsafe extern "system" fn etw_event_callback(
    event_record: *mut windows::Win32::System::Diagnostics::Etw::EVENT_RECORD,
) {
    thread_local! {
        static ETW_GUARD: Cell<bool> = const { Cell::new(false) };
    }
    if ETW_GUARD.replace(true) {
        return;
    }
    etw_event_callback_impl(event_record);
    ETW_GUARD.set(false);
}

unsafe fn etw_event_callback_impl(
    event_record: *mut windows::Win32::System::Diagnostics::Etw::EVENT_RECORD,
) {
    if event_record.is_null() {
        return;
    }
    let record = &*event_record;
    let event_id = record.EventHeader.EventDescriptor.Id;
    let version = record.EventHeader.EventDescriptor.Version;
    let pid = record.EventHeader.ProcessId;

    // ═══ 第一层：EventId 快速过滤 ═══
    // NameCreate (10) / NameDelete (11) 不过滤 PID —— FileObject 路径映射是系统全局的，
    // 由 System 进程 (PID=4) 产生，必须无条件缓存
    if event_id == 10 || event_id == 11 {
        let payload: &[u8] = if record.UserDataLength > 0 && !record.UserData.is_null() {
            std::slice::from_raw_parts(record.UserData as *const u8, record.UserDataLength as usize)
        } else {
            return;
        };
        // FIX: NameCreate/NameDelete 模板不同于 Create/Read/Write ——
        // 无保留字段，FileKey 在 offset 0-7，FileName 在 offset 8+
        if payload.len() >= 10 {
            let file_key = u64::from_le_bytes(payload[0..8].try_into().unwrap_or([0; 8]));
            let name = parse_wide_string(&payload[8..]);

            if event_id == 10 {
                // NameCreate: 缓存 FileObject → 文件路径映射（全局，不过滤 PID）
                if !name.is_empty() {
                    let user_path = convert_device_path(&name);
                    if let Ok(mut cache) = FILE_OBJECT_CACHE.lock() {
                        cache.insert(file_key, user_path);
                    }
                }
            } else {
                // NameDelete: 清除缓存
                if let Ok(mut cache) = FILE_OBJECT_CACHE.lock() {
                    cache.remove(&file_key);
                }
            }
        }
        return;
    }

    // 其他事件：快速过滤不需要的 EventId
    let operation = match eventid_to_operation(event_id) {
        Some(op) => op,
        None => return,
    };

    // ═══ 第二层：PID 过滤（仅对文件操作事件）═══
    let process_name = {
        let monitors = match ACTIVE_MONITORS.lock() {
            Ok(m) => m,
            Err(_) => return,
        };
        let mut found = None;
        for (name, session) in monitors.iter() {
            if session.pids.contains(&pid) {
                found = Some(name.clone());
                break;
            }
        }
        match found {
            Some(name) => name,
            None => return,
        }
    };

    // ═══ 第三层：解析载荷 ═══
    let payload: &[u8] = if record.UserDataLength > 0 && !record.UserData.is_null() {
        std::slice::from_raw_parts(record.UserData as *const u8, record.UserDataLength as usize)
    } else {
        return;
    };

    // FIX: Create/CreateNewFile 直接携带 FileName，同时缓存 FileObject→路径供 Read/Write 查找
    if event_id == 12 || event_id == 30 {
        let name_offset: usize = if version == 1 { 32 } else { 36 };
        if payload.len() > name_offset + 2 {
            let name = parse_wide_string(&payload[name_offset..]);
            if !name.is_empty() {
                let user_path = convert_device_path(&name);
                // 缓存 FileObject → 路径，供后续 Read/Write 通过同一 FileObject 查找
                if let Some(fo_offset) = get_file_object_offset(event_id, version) {
                    if payload.len() > fo_offset + 8 {
                        let file_object = u64::from_le_bytes(payload[fo_offset..fo_offset+8].try_into().unwrap_or([0; 8]));
                        if let Ok(mut cache) = FILE_OBJECT_CACHE.lock() {
                            cache.insert(file_object, user_path.clone());
                        }
                    }
                }
                let timestamp = Utc::now().timestamp_millis() as f64;
                if let Ok(mut log) = MONITOR_LOG.lock() {
                    try_merge_or_push(&mut log, &process_name, operation, &user_path, timestamp);
                }
                // debug!("[ETW v{}] {} {} -> {}", version, process_name, operation, user_path);
                return;
            }
        }
    }

    // 其他事件：优先 FileObject 查缓存（Create 已写入），不命中再 FileKey（NameCreate 写入）
    let file_path = {
        let mut result: Option<String> = None;
        // 优先 FileObject（Create/CreateNewFile 写入的键）
        if let Some(fo_offset) = get_file_object_offset(event_id, version) {
            if payload.len() > fo_offset + 8 {
                let file_object = u64::from_le_bytes(payload[fo_offset..fo_offset+8].try_into().unwrap_or([0; 8]));
                if let Ok(cache) = FILE_OBJECT_CACHE.lock() {
                    result = cache.get(&file_object).cloned();
                }
                if result.is_none() {
                    result = Some(format!("[FileObject:0x{:X}]", file_object));
                }
            }
        }
        // Fallback: FileKey（NameCreate 写入的键）
        if result.as_ref().map_or(false, |s| s.starts_with("[FileObject:")) {
            if let Some(fk_offset) = get_file_key_offset(event_id, version) {
                if payload.len() > fk_offset + 8 {
                    let file_key = u64::from_le_bytes(payload[fk_offset..fk_offset+8].try_into().unwrap_or([0; 8]));
                    if let Ok(cache) = FILE_OBJECT_CACHE.lock() {
                        if let Some(path) = cache.get(&file_key).cloned() {
                            result = Some(path);
                        }
                    }
                }
            }
        }
        result.unwrap_or_else(|| String::from("[unknown event]"))
    };

    // FIX: chrono 替代 SystemTime，更简洁
    let timestamp = Utc::now().timestamp_millis() as f64;

    if let Ok(mut log) = MONITOR_LOG.lock() {
        try_merge_or_push(&mut log, &process_name, operation, &file_path, timestamp);
    }
    // debug!("[ETW v{}] {} {} -> {}", version, process_name, operation, file_path);
}

// ═══ ETW 会话管理 ═══

/// 确保 ETW 会话已创建，并注册指定进程的 PID 用于事件过滤
fn ensure_etw_session(process_names: &[&str]) -> Result<(), String> {
    // info!("ensure_etw_session called with: {:?}", process_names);
    // 获取初始化锁，防止并发调用重复创建会话
    let _init_guard = ETW_INIT_LOCK
        .lock()
        .map_err(|e| format!("ETW 初始化锁获取失败: {}", e))?;

    // 如果会话已存在，只注册新的监听条目
    let has_session = SESSION_HANDLE
        .lock()
        .map(|sh| sh.Value != 0)
        .unwrap_or(false);
    if has_session {
        // FIX (Bug #1 & #5): 每个进程独立收集 PID（不共享列表）；立即扫描而不等轮询线程
        let mut sys = System::new_all();
        sys.refresh_all();
        if let Ok(mut monitors) = ACTIVE_MONITORS.lock() {
            for &name in process_names {
                let pids: Vec<u32> = sys
                    .processes_by_exact_name(name.as_ref())
                    .map(|p| p.pid().as_u32())
                    .collect();
                monitors.insert(name.to_string(), MonitorSession { pids });
            }
        }
        return Ok(());
    }

    // 冷启动：清理可能残留的同名 ETW 会话（上次崩溃未释放）
    unsafe {
        let session_name_wide: Vec<u16> = ETW_SESSION_NAME
            .encode_utf16()
            .chain(std::iter::once(0u16))
            .collect();
        let session_name_pcwstr = windows::core::PCWSTR(session_name_wide.as_ptr());
        let mut cleanup_props = EVENT_TRACE_PROPERTIES::default();
        cleanup_props.Wnode.BufferSize = std::mem::size_of::<EVENT_TRACE_PROPERTIES>() as u32;
        let _ = ControlTraceW(
            CONTROLTRACE_HANDLE { Value: 0 },
            session_name_pcwstr,
            &mut cleanup_props,
            EVENT_TRACE_CONTROL_STOP,
        );
    }

    // 提升权限
    unsafe {
        if let Err(e) = process::enable_debug_privilege() {
            return Err(format!(
                "权限提升失败: {}。请确保以管理员身份运行。",
                e
            ));
        }
    }

    // FIX: 提前构建设备路径映射表，避免在 ETW 回调线程中调用 QueryDosDeviceW
    refresh_device_path_map();

    // FIX (Bug #1): 每个进程独立收集 PID，避免不同进程共享列表导致事件来源进程名错误
    let mut sys = System::new_all();
    sys.refresh_all();

    // 注册监听会话
    {
        let mut monitors = ACTIVE_MONITORS
            .lock()
            .map_err(|e| format!("内部锁错误: {}", e))?;
        for &name in process_names {
            let pids: Vec<u32> = sys
                .processes_by_exact_name(name.as_ref())
                .map(|p| p.pid().as_u32())
                .collect();
            monitors.insert(name.to_string(), MonitorSession { pids });
        }
    }

    unsafe {
        // 准备 ETW 会话名称（null 结尾的宽字符串）
        let session_name_wide: Vec<u16> = ETW_SESSION_NAME
            .encode_utf16()
            .chain(std::iter::once(0u16))
            .collect();

        // 计算 EVENT_TRACE_PROPERTIES 结构总大小
        let props_size = std::mem::size_of::<EVENT_TRACE_PROPERTIES>();
        let name_offset = props_size;
        let name_bytes = session_name_wide.len() * 2;
        let total_size = name_offset + name_bytes;

        // 分配零初始化缓冲区
        let mut props_buf: Vec<u8> = vec![0u8; total_size];
        let props = &mut *(props_buf.as_mut_ptr() as *mut EVENT_TRACE_PROPERTIES);

        // 填充 WNODE_HEADER
        props.Wnode.BufferSize = total_size as u32;
        props.Wnode.Flags = WNODE_FLAG_TRACED_GUID;
        props.Wnode.Guid =
            windows::core::GUID::from_u128(0x12345678_1234_1234_1234_123456789abc);
        props.BufferSize = 64; // 64 KB 缓冲区
        props.MinimumBuffers = 4;
        props.MaximumBuffers = 16;
        props.FlushTimer = 1; // 每秒刷新
        props.LogFileMode = EVENT_TRACE_REAL_TIME_MODE;
        props.LoggerNameOffset = name_offset as u32;

        // 复制会话名称到缓冲区
        std::ptr::copy_nonoverlapping(
            session_name_wide.as_ptr() as *const u8,
            props_buf.as_mut_ptr().add(name_offset),
            name_bytes,
        );

        // 启动 ETW 追踪会话
        // TOCTOU 保护：释放 ETW_INIT_LOCK 前再次检查，防止并发冷启动
        if SESSION_HANDLE.lock().map_or(false, |sh| sh.Value != 0) {
            if let Ok(mut monitors) = ACTIVE_MONITORS.lock() {
                for &name in process_names {
                    if !monitors.contains_key(name) {
                        let pids: Vec<u32> = sys
                            .processes_by_exact_name(name.as_ref())
                            .map(|p| p.pid().as_u32())
                            .collect();
                        monitors.insert(name.to_string(), MonitorSession { pids });
                    }
                }
            }
            return Ok(());
        }

        let mut session_handle = CONTROLTRACE_HANDLE { Value: 0 };
        let session_name_pcwstr = windows::core::PCWSTR(session_name_wide.as_ptr());

        let result = StartTraceW(&mut session_handle, session_name_pcwstr, props);
        if result.is_err() {
            let error_code = result.0;
            if error_code == 183 {
                // ERROR_ALREADY_EXISTS
                let _ = ControlTraceW(
                    CONTROLTRACE_HANDLE { Value: 0 },
                    session_name_pcwstr,
                    props,
                    EVENT_TRACE_CONTROL_STOP,
                );
                let retry = StartTraceW(&mut session_handle, session_name_pcwstr, props);
                if retry.is_err() {
                    return Err(format!("重新启动 ETW 会话失败: {}", retry.0));
                }
            } else {
                return Err(format!(
                    "启动 ETW 会话失败: error code {}",
                    error_code
                ));
            }
        }
        info!("ETW 会话已启动, handle={}", session_handle.Value);

        // ── 1. 先建消费者：OpenTraceW ──
        let mut logfile = EVENT_TRACE_LOGFILEW::default();
        logfile.Anonymous1.ProcessTraceMode =
            PROCESS_TRACE_MODE_REAL_TIME | PROCESS_TRACE_MODE_EVENT_RECORD;
        logfile.Anonymous2.EventRecordCallback = Some(etw_event_callback);
        logfile.Context = std::ptr::null_mut();
        // 实时消费: 通过 LoggerName 指定会话名称
        logfile.LoggerName = windows::core::PWSTR(session_name_wide.as_ptr() as *mut _);

        // info!("[诊断] OpenTraceW 参数: LoggerName={:?}, ProcessTraceMode=0x{:X}, EventRecordCallback={:?}", ...);

        let trace_handle = OpenTraceW(&mut logfile);
        let invalid = PROCESSTRACE_HANDLE { Value: u64::MAX };
        if trace_handle == invalid {
            let error_code = windows::Win32::Foundation::GetLastError();
            warn!("OpenTraceW 失败, GetLastError={:?}", error_code);
            let _ = ControlTraceW(
                session_handle,
                windows::core::PCWSTR::null(),
                props,
                EVENT_TRACE_CONTROL_STOP,
            );
            return Err(format!("OpenTraceW 失败 (error: {:?})", error_code));
        }
        if let Ok(mut th) = TRACE_HANDLE.lock() {
            *th = trace_handle;
        }
        info!("OpenTraceW 成功, trace_handle={}", trace_handle.Value);

        // ── 2. 启动 ProcessTrace 后台线程（消费者就绪）──
        let handle = std::thread::spawn(move || {
            info!("ETW ProcessTrace 线程启动");
            let result = ProcessTrace(std::slice::from_ref(&trace_handle), None, None);
            info!("ETW ProcessTrace 线程结束, result={:?}", result);
        });
        if let Ok(mut t) = ETW_THREAD.lock() {
            *t = Some(handle);
        }

        // ── 3. 消费者就绪后再启用 Provider，确保事件不丢失 ──
        let provider_guid = FILEIO_GUID;
        let result = EnableTraceEx2(
            session_handle,
            &provider_guid as *const _,
            EVENT_CONTROL_CODE_ENABLE_PROVIDER.0,
            5,     // Level: TRACE_LEVEL_VERBOSE
            0x1FF0, // MatchAnyKeyword: 精确文件 I/O 关键字（见 logman query providers）
                    // FILENAME(0x10)|FILEIO(0x20)|OP_END(0x40)|CREATE(0x80)
                    // |READ(0x100)|WRITE(0x200)|DELETE(0x400)|RENAME(0x800)|CREATE_NEW(0x1000)
            0,     // MatchAllKeyword: 不过滤
            0,     // EnableProperty
            None,  // FilterData
        );
        if result.is_err() {
            let _ = ControlTraceW(
                session_handle,
                windows::core::PCWSTR::null(),
                props,
                EVENT_TRACE_CONTROL_STOP,
            );
            return Err(format!(
                "启用 FileIO Provider 失败: error code {}",
                result.0
            ));
        }
        info!("FileIO Provider 已启用 (Level=VERBOSE)");

        // 保存 session handle
        if let Ok(mut sh) = SESSION_HANDLE.lock() {
            *sh = session_handle;
        }
    }

    // 启动 PID 轮询线程（定期扫描未运行的目标进程）
    start_pid_polling();

    Ok(())
}

/// 停止 ETW 追踪会话（禁用 Provider → 关闭追踪句柄 → 停止会话）
fn stop_etw_session() {
    // 幂等保护：会话已停止则直接返回
    if TRACE_HANDLE.lock().map_or(true, |th| th.Value == u64::MAX)
        && SESSION_HANDLE.lock().map_or(true, |sh| sh.Value == 0)
    {
        return;
    }

    let trace_handle = {
        let mut th = TRACE_HANDLE.lock().unwrap();
        let h = *th;
        *th = PROCESSTRACE_HANDLE { Value: u64::MAX };
        h
    };
    let session_control_handle = {
        let mut sh = SESSION_HANDLE.lock().unwrap();
        let h = *sh;
        *sh = CONTROLTRACE_HANDLE { Value: 0 };
        h
    };

    unsafe {
        // 禁用 FileIO Provider
        let invalid = PROCESSTRACE_HANDLE { Value: u64::MAX };
        if trace_handle != invalid && session_control_handle.Value != 0 {
            let provider_guid = FILEIO_GUID;
            let _ = EnableTraceEx2(
                session_control_handle,
                &provider_guid as *const _,
                EVENT_CONTROL_CODE_DISABLE_PROVIDER.0,
                0,
                0,
                0,
                0,
                None,
            );
        }

        // 停止并关闭 ETW 会话
        let mut props = EVENT_TRACE_PROPERTIES::default();
        props.Wnode.BufferSize = std::mem::size_of::<EVENT_TRACE_PROPERTIES>() as u32;

        if session_control_handle.Value != 0 {
            let _ = ControlTraceW(
                session_control_handle,
                windows::core::PCWSTR::null(),
                &mut props,
                EVENT_TRACE_CONTROL_STOP,
            );
        } else {
            // 尝试通过名称停止
            let session_name_wide: Vec<u16> = ETW_SESSION_NAME
                .encode_utf16()
                .chain(std::iter::once(0u16))
                .collect();
            let _ = ControlTraceW(
                CONTROLTRACE_HANDLE { Value: 0 },
                windows::core::PCWSTR(session_name_wide.as_ptr()),
                &mut props,
                EVENT_TRACE_CONTROL_STOP,
            );
        }
    }

    // 等待处理线程结束
    if let Ok(mut t) = ETW_THREAD.lock() {
        if let Some(handle) = t.take() {
            let _ = handle.join();
        }
    }

    // 清理缓存
    if let Ok(mut cache) = FILE_OBJECT_CACHE.lock() {
        cache.clear();
    }

    info!("ETW 会话已停止");
}

/// 停止所有监听（应用退出时调用）
pub(crate) fn stop_all_monitors() {
    if let Ok(mut monitors) = ACTIVE_MONITORS.lock() {
        monitors.clear();
    }
    stop_etw_session();
}

/// 启动 PID 轮询线程：每 3 秒扫描目标进程，发现新 PID 时更新监听集合并推送通知
fn start_pid_polling() {
    if POLLING_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return; // 轮询已在运行
    }

    std::thread::spawn(|| {
        info!("[PID 轮询] 线程启动");
        while POLLING_RUNNING.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_secs(3));

            // 收集当前所有监听目标
            let monitor_names: Vec<String> = {
                match ACTIVE_MONITORS.lock() {
                    Ok(m) => {
                        if m.is_empty() {
                            break; // 无活跃监听，退出线程
                        }
                        m.keys().cloned().collect()
                    }
                    Err(_) => break,
                }
            };

            let mut sys = System::new();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

            if let Ok(mut monitors) = ACTIVE_MONITORS.lock() {
                for name in &monitor_names {
                    if let Some(session) = monitors.get_mut(name) {
                        let current_pids: Vec<u32> = sys
                            .processes_by_exact_name(name.as_ref())
                            .map(|p| p.pid().as_u32())
                            .collect();

                        // 检测新启动的进程
                        let new_pids: Vec<u32> = current_pids
                            .iter()
                            .filter(|pid| !session.pids.contains(pid))
                            .copied()
                            .collect();

                        if !new_pids.is_empty() {
                            for pid in &new_pids {
                                info!(
                                    "[PID 轮询] 检测到进程: {} (PID {})",
                                    name, pid
                                );
                                if let Ok(mut queue) = PENDING_NOTIFICATIONS.lock() {
                                    queue.push(format!(
                                        "检测到进程启动: {} (PID {})",
                                        name, pid
                                    ));
                                }
                            }
                            session.pids.extend(new_pids);
                        }

                        // 检测已退出的进程并推送通知
                        let exited_pids: Vec<u32> = session
                            .pids
                            .iter()
                            .filter(|pid| !current_pids.contains(pid))
                            .copied()
                            .collect();

                        for pid in &exited_pids {
                            info!(
                                "[PID 轮询] 进程已退出: {} (PID {})",
                                name, pid
                            );
                            if let Ok(mut queue) = PENDING_NOTIFICATIONS.lock() {
                                queue.push(format!(
                                    "进程已退出: {} (PID {})",
                                    name, pid
                                ));
                            }
                        }

                        // 保留仍在运行的 PID
                        session.pids.retain(|pid| current_pids.contains(pid));
                    }
                }
            }
        }

        POLLING_RUNNING.store(false, Ordering::SeqCst);
        info!("[PID 轮询] 线程退出");
    });
}

// ═══ Tauri 命令 ═══

/// 启动指定进程的文件 I/O 监听
#[tauri::command]
pub fn start_monitoring(process_name: String) -> (bool, String) {
    if !process::is_allowed_process(&process_name) {
        return (
            false,
            format!("{} 不在允许列表中", process_name),
        );
    }

    // 幂等保护：已在监听则跳过
    if let Ok(monitors) = ACTIVE_MONITORS.lock() {
        if monitors.contains_key(&process_name) {
            return (true, format!("已在监听 {}", process_name));
        }
    }

    // 全局锁：防止重复触发冷启动（compare_exchange 确保只有第一个调用进入）
    if ETW_STARTING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return (false, "ETW 正在启动中，请稍后重试".to_string());
    }

    // 收集当前所有需要监听的进程名
    let mut name_strings: Vec<String> = vec![process_name.clone()];
    if let Ok(monitors) = ACTIVE_MONITORS.lock() {
        for key in monitors.keys() {
            if key != &process_name {
                name_strings.push(key.clone());
            }
        }
    }
    let names: Vec<&str> = name_strings.iter().map(|s| s.as_str()).collect();

    let result = match ensure_etw_session(&names) {
        Ok(()) => (true, format!("已开始监听 {}", process_name)),
        Err(e) => (false, e),
    };
    ETW_STARTING.store(false, Ordering::SeqCst);
    result
}

/// 停止指定进程的文件 I/O 监听
#[tauri::command]
pub fn stop_monitoring(process_name: String) -> (bool, String) {
    // 幂等保护：不在监听中则跳过
    if let Ok(mut monitors) = ACTIVE_MONITORS.lock() {
        if monitors.remove(&process_name).is_none() {
            return (true, format!("{} 未在监听中", process_name));
        }
        if monitors.is_empty() {
            drop(monitors);
            stop_etw_session();
            return (
                true,
                format!("已停止监听 {}（无其他活跃监听）", process_name),
            );
        }
    }
    (true, format!("已停止监听 {}", process_name))
}

/// 获取当前监听日志（JSON 数组，前端轮询调用）
#[tauri::command]
pub fn get_monitor_log() -> Vec<MonitorLogEntry> {
    // FIX (Bug #2): VecDeque → Vec 转换
    match MONITOR_LOG.lock() {
        Ok(log) => log.iter().cloned().collect(),
        Err(_) => Vec::new(),
    }
}

/// 取出并清空待推送的通知队列（前端轮询调用）
#[tauri::command]
pub fn drain_notifications() -> Vec<String> {
    match PENDING_NOTIFICATIONS.lock() {
        Ok(mut queue) => std::mem::take(&mut *queue),
        Err(_) => Vec::new(),
    }
}

// FIX: 将毫秒级 Unix 时间戳转换为 "年-月-日 时:分:秒" 格式（北京时间 UTC+8，用 chrono 库替代手写实现）
fn timestamp_to_string(ts_ms: f64) -> String {
    let secs = ts_ms / 1000.0;
    let nanos = ((ts_ms % 1000.0) * 1_000_000.0) as u32;
    let beijing = FixedOffset::east_opt(8 * 3600).unwrap();
    match Utc.timestamp_opt(secs as i64, nanos) {
        chrono::LocalResult::Single(dt) => {
            dt.with_timezone(&beijing).format("%Y-%m-%d %H:%M:%S").to_string()
        }
        _ => "时间解析失败".to_string(),
    }
}

/// 导出监听日志为 CSV 文件，返回文件路径
#[tauri::command]
pub fn export_monitor_log() -> (bool, String) {
    let log = match MONITOR_LOG.lock() {
        Ok(l) => l.clone(),
        Err(e) => return (false, format!("无法获取日志: {}", e)),
    };

    if log.is_empty() {
        return (false, "没有可导出的日志".to_string());
    }

    let downloads_dir = std::env::var("USERPROFILE")
        .map(|p| std::path::PathBuf::from(p).join("Downloads"))
        .unwrap_or_else(|_| std::env::temp_dir());
    let file_path = downloads_dir.join("monitor_log.csv");

    if let Err(e) = std::fs::create_dir_all(file_path.parent().unwrap()) {
        return (false, format!("创建目录失败: {}", e));
    }

    let mut csv = String::from("ID,ProcessName,Operation,FilePath,时间\n");
    for entry in &log {
        let escaped_path = entry.file_path.replace('"', "\"\"");
        // FIX: Timestamp 转换为 "年-月-日 时:分:秒" 格式（北京时间 UTC+8）
        let time_str = timestamp_to_string(entry.timestamp);
        csv.push_str(&format!(
            "{},\"{}\",\"{}\",\"{}\",\"{}\"\n",
            entry.id, entry.process_name, entry.operation, escaped_path, time_str
        ));
    }

    match std::fs::write(&file_path, csv) {
        Ok(()) => (true, file_path.to_string_lossy().to_string()),
        Err(e) => (false, format!("写入文件失败: {}", e)),
    }
}
