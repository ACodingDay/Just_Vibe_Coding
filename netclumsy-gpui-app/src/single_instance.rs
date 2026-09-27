//! 单实例互斥（C 原版 main.c `checkIsRunning` 的移植）。
//!
//! 原版用命名事件 `Global\CLUMSY_IS_RUNNING_EVENT_NAME`：仅凭「同名内核对象
//! 是否已存在」判断是否有实例在跑，句柄从不显式关闭，进程退出时由系统回收。
//! 本移植改用命名互斥体（语义等价，是单实例场景的惯用原语）。
//!
//! 必须拦截第二个实例的原因：WinDivert 会把每个匹配的包投递给且仅投递给一个
//! 句柄，两个实例同时运行会把流量劈成两半，两边的效果都形同虚设——所以判断
//! 必须发生在打开驱动之前，且对象创建失败时按「拒绝启动」处理（fail-closed，
//! 与原版 hStartEvent == NULL 时返回 TRUE 的行为一致）。

use rust_i18n::t;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{GetLastError, BOOL, ERROR_ALREADY_EXISTS};
use windows::Win32::System::Threading::CreateMutexW;
use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONWARNING, MB_OK};

/// 内核对象名。`Global\` 前缀覆盖所有会话：多用户快速切换时第二个登录会话
/// 里启动的实例同样会被拦住（流量是整机级别的，单实例也必须是）。
///
/// 【与原版 clumsy 并存】刻意**没有**沿用原版的
/// `Global\CLUMSY_IS_RUNNING_EVENT_NAME`——若同名，原版 clumsy 开着时本程序
/// 会被连带拦下（反之亦然）。当前名字只在本程序的多个实例之间互斥，因此
/// netclumsy 与原版 clumsy 可以同时启动。注意：WinDivert 会把每个匹配的包
/// 只投递给一个句柄，两者同时运行会把流量劈成两半，两边的效果都失真，仅
/// 适合行为对比观察，不能同时做劣化测试。如需跨软件互斥，把本常量改成
/// 原版的事件名即可。
const MUTEX_NAME: &str = "Global\\NETCLUMSY_IS_RUNNING_MUTEX";

/// 尝试成为唯一实例。
///
/// 返回 true 表示拿到了互斥体（首次实例，正常继续启动）；返回 false 表示
/// 已有实例在运行，或内核对象创建失败（同样拒绝启动）。
pub fn try_acquire() -> bool {
    try_acquire_named(MUTEX_NAME)
}

fn try_acquire_named(name: &str) -> bool {
    // 名字只在创建那一刻有意义，宽串的内存活过调用即可
    let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    let result = unsafe { CreateMutexW(None, BOOL(0), PCWSTR(wide.as_ptr())) };

    let handle = match result {
        Ok(h) => h,
        Err(e) => {
            // fail-closed：创建失败（如组策略限制 Global\ 命名空间）时拒绝启动，
            // 宁可不放第二个实例进来，也不冒双实例劈裂流量的风险
            crate::debug_log(&format!(
                "single instance: CreateMutexW({name}) failed: {e}"
            ));
            return false;
        }
    };

    // CreateMutexW 在同名对象已存在时依然成功返回句柄，只把 last error 置为
    // ERROR_ALREADY_EXISTS——包装层失败分支之外不会再碰 last error，紧接着
    // 读一次即可区分「首次创建」与「连接到已有对象」
    let already_exists = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
    if already_exists {
        crate::debug_log("single instance: mutex already exists, another instance is running");
        return false;
    }

    // 句柄刻意不关闭：持有到进程退出（原版注释同款语义），由 OS 回收
    let _ = handle;
    true
}

/// 已有实例运行时的提示：原生 MessageBox（与原版 MessageBox 一致），
/// 双击图标再次启动时没有控制台可见，弹窗是唯一能看到的反馈。
pub fn alert_already_running() {
    let text = t!("netclumsy.single_instance.already_running").into_owned();
    let title = t!("netclumsy.app.title").into_owned();
    let text_wide: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
    let title_wide: Vec<u16> = title.encode_utf16().chain(Some(0)).collect();
    unsafe {
        MessageBoxW(
            None,
            PCWSTR(text_wide.as_ptr()),
            PCWSTR(title_wide.as_ptr()),
            MB_OK | MB_ICONWARNING,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::try_acquire_named;

    /// 用测试专用名字验证「首次成功 / 二次识别已存在」，
    /// 避免与正在运行的真实 netclumsy 实例互相干扰测试结果。
    #[test]
    fn second_acquire_reports_already_running() {
        let name = "Global\\NETCLUMSY_SINGLE_INSTANCE_TEST_MUTEX";
        assert!(try_acquire_named(name), "首次创建互斥体应成功");
        assert!(!try_acquire_named(name), "同名对象已存在时应返回 false");
    }
}
