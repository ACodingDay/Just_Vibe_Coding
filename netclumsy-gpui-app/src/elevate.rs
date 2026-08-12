use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, PSID};
use windows::Win32::Security::{
    AllocateAndInitializeSid, CheckTokenMembership, FreeSid, SECURITY_NT_AUTHORITY,
};
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

pub fn elevate_self() -> bool {
    let exe = std::env::current_exe().ok();
    let Some(exe) = exe else {
        return false;
    };
    let exe_str = exe.to_string_lossy();

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(wide_str("runas").as_ptr()),
            PCWSTR(wide_str(&exe_str).as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };

    result.0 as isize > 32
}

fn wide_str(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
