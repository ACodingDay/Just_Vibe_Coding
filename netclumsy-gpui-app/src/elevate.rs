use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, PSID};
use windows::Win32::Security::{
    AllocateAndInitializeSid, CheckTokenMembership, FreeSid, SECURITY_NT_AUTHORITY,
};
use windows::Win32::System::Environment::GetCommandLineW;
use windows::Win32::System::SystemServices::{
    DOMAIN_ALIAS_RID_ADMINS, SECURITY_BUILTIN_DOMAIN_RID,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

pub fn is_run_as_admin() -> bool {
    unsafe {
        let mut administrators_group = PSID(std::ptr::null_mut());
        let ok = AllocateAndInitializeSid(
            &SECURITY_NT_AUTHORITY,
            2,
            SECURITY_BUILTIN_DOMAIN_RID as u32,
            DOMAIN_ALIAS_RID_ADMINS as u32,
            0,
            0,
            0,
            0,
            0,
            0,
            &mut administrators_group,
        );
        if ok == BOOL(0) {
            return false;
        }

        let mut is_member = BOOL(0);
        let result = CheckTokenMembership(None, administrators_group, &mut is_member);

        FreeSid(administrators_group);
        result != BOOL(0) && is_member != BOOL(0)
    }
}

/// 界面层的管理员判定：NETCLUMSY_FORCE_NOT_ADMIN=1 时强制按非管理员处理，
/// 用于开发期验证提权提示对话框。配套行为见 main.rs：该开关同时会跳过自动
/// 提权（UAC 提权子进程不继承环境变量，不走提权开关才能传进 GUI 进程）。
pub fn is_admin_for_ui() -> bool {
    !matches!(std::env::var("NETCLUMSY_FORCE_NOT_ADMIN").as_deref(), Ok("1"))
        && is_run_as_admin()
}

/// 以管理员身份重启自身，并透传命令行参数。
///
/// 改进自 C 原版 elevate.c：原版 ShellExecuteEx 不带 lpParameters，提权重启后
/// 参数化启动（--lag on 等）静默失效；这里取 GetCommandLineW 在 argv[0] 之后的
/// 原始尾部（保留引号语义）原样传入，保证参数不丢。
pub fn elevate_self() -> bool {
    let exe = std::env::current_exe().ok();
    let Some(exe) = exe else {
        return false;
    };
    let exe_str = exe.to_string_lossy();

    let params = command_line_tail();

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(wide_str("runas").as_ptr()),
            PCWSTR(wide_str(&exe_str).as_ptr()),
            params
                .as_ref()
                .map_or(PCWSTR::null(), |p| PCWSTR(p.as_ptr())),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };

    result.0 as isize > 32
}

/// 当前进程命令行在 argv[0] 之后的部分（原样，含引号），无参数时返回 None
fn command_line_tail() -> Option<Vec<u16>> {
    unsafe {
        let raw = GetCommandLineW();
        let s = raw.to_string().ok()?;
        let s = s.trim_start();
        let rest = if let Some(after_quote) = s.strip_prefix('"') {
            // 引号包裹的 argv[0]：跳到闭合引号之后
            match after_quote.find('"') {
                Some(i) => &s[1 + i + 1..],
                None => "",
            }
        } else {
            // 无引号 argv[0]：跳到第一个空白之后
            match s.find(char::is_whitespace) {
                Some(i) => &s[i..],
                None => "",
            }
        };
        let rest = rest.trim_start();
        if rest.is_empty() {
            None
        } else {
            Some(rest.encode_utf16().chain(Some(0)).collect())
        }
    }
}

fn wide_str(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

#[cfg(test)]
mod tests {
    fn tail(cmdline: &str) -> Option<String> {
        // 走一遍与 command_line_tail 相同的提取逻辑（纯字符串版，避免 FFI）
        let s = cmdline.trim_start();
        let rest = if let Some(after_quote) = s.strip_prefix('"') {
            match after_quote.find('"') {
                Some(i) => &s[1 + i + 1..],
                None => "",
            }
        } else {
            match s.find(char::is_whitespace) {
                Some(i) => &s[i..],
                None => "",
            }
        };
        let rest = rest.trim_start();
        if rest.is_empty() {
            None
        } else {
            Some(rest.to_string())
        }
    }

    #[test]
    fn quoted_exe_with_args() {
        assert_eq!(
            tail("\"C:\\app\\netclumsy.exe\" --lag on --lag-time 50"),
            Some("--lag on --lag-time 50".into())
        );
    }

    #[test]
    fn unquoted_exe_with_args() {
        assert_eq!(
            tail("C:\\app\\netclumsy.exe --filter \"udp\""),
            Some("--filter \"udp\"".into())
        );
    }

    #[test]
    fn no_args() {
        assert_eq!(tail("C:\\app\\netclumsy.exe"), None);
        assert_eq!(tail("\"C:\\app\\netclumsy.exe\""), None);
    }

    #[test]
    fn force_not_admin_flag_only_accepts_1() {
        // 与 is_admin_for_ui 同一套判断（纯字符串版，避免依赖进程环境变量）
        fn forced(raw: Result<String, std::env::VarError>) -> bool {
            matches!(raw.as_deref(), Ok("1"))
        }
        assert!(forced(Ok("1".into())));
        assert!(!forced(Ok("0".into())));
        assert!(!forced(Ok("".into())));
        assert!(!forced(Ok("true".into())));
        assert!(!forced(Err(std::env::VarError::NotPresent)));
    }
}
