// 隐藏/显示桌面图标（Win32 FFI）

#[cfg(target_os = "windows")]
mod imp {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    extern "system" {
        fn FindWindowW(class: *const u16, window: *const u16) -> isize;
        fn FindWindowExW(parent: isize, child: isize, class: *const u16, window: *const u16) -> isize;
        fn ShowWindow(hwnd: isize, cmd: i32) -> i32;
        fn SendMessageW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> isize;
    }

    const SW_HIDE: i32 = 0;
    const SW_SHOW: i32 = 5;

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    pub fn hide() -> Result<(), String> { toggle(false) }
    pub fn show() -> Result<(), String> { toggle(true) }

    fn toggle(visible: bool) -> Result<(), String> {
        unsafe {
            let progman = FindWindowW(to_wide("Progman").as_ptr(), std::ptr::null());
            if progman == 0 {
                return Err("未找到 Progman 窗口".into());
            }
            SendMessageW(progman, 0x052C, 0, 0);

            let cmd = if visible { SW_SHOW } else { SW_HIDE };

            let def_view = FindWindowExW(progman, 0, to_wide("SHELLDLL_DefView").as_ptr(), std::ptr::null());
            if def_view != 0 {
                let list_view = FindWindowExW(def_view, 0, to_wide("SysListView32").as_ptr(), std::ptr::null());
                if list_view != 0 {
                    ShowWindow(list_view, cmd);
                    return Ok(());
                }
            }

            let mut worker_w = FindWindowExW(0, 0, to_wide("WorkerW").as_ptr(), std::ptr::null());
            while worker_w != 0 {
                let dv = FindWindowExW(worker_w, 0, to_wide("SHELLDLL_DefView").as_ptr(), std::ptr::null());
                if dv != 0 {
                    let lv = FindWindowExW(dv, 0, to_wide("SysListView32").as_ptr(), std::ptr::null());
                    if lv != 0 {
                        ShowWindow(lv, cmd);
                        return Ok(());
                    }
                }
                worker_w = FindWindowExW(0, worker_w, to_wide("WorkerW").as_ptr(), std::ptr::null());
            }

            Err("未找到桌面图标窗口".into())
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    pub fn hide() -> Result<(), String> { Ok(()) }
    pub fn show() -> Result<(), String> { Ok(()) }
}

pub use imp::{hide, show};

#[tauri::command]
pub async fn hide_desktop_icons() -> Result<(), String> {
    hide()
}

#[tauri::command]
pub async fn show_desktop_icons() -> Result<(), String> {
    show()
}
