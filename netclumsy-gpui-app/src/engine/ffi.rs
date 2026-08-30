use std::ffi::CString;
use std::sync::atomic::{AtomicBool, Ordering};

use windows::Win32::Foundation::{HANDLE, ERROR_INVALID_HANDLE};
use windivert_sys::{
    address::WINDIVERT_ADDRESS, WinDivertClose, WinDivertFlags, WinDivertLayer, WinDivertOpen,
    WinDivertParam, WinDivertRecv, WinDivertSend, WinDivertSetParam,
};

/// WinDivert 原始句柄封装。
///
/// 与 C 原版一致：HANDLE 可跨线程共享（Copy），停止引擎时由时钟线程调用
/// [`WinDivertClose`] 中断 recv 线程的阻塞 [`WinDivertRecv`]。
///
/// 修复：原先只有一个裸 HANDLE 字段、既没有 `Drop` 也没有"是否已关闭"的记录，
/// 关闭动作完全依赖 clock_loop 的 stop 分支走到那一行。任何提前退出（线程
/// spawn 失败、效果 panic 导致 clock 线程死亡）都会让句柄永不关闭：recv 线程
/// 永久阻塞在 `WinDivertRecv`，`Engine::stop()` 的 `join()` 随之挂死，队列里
/// 已被劫持的包也再也不会回注 —— 表现为网络流量被黑洞。
pub struct DivertHandle {
    raw: HANDLE,
    closed: AtomicBool,
}

// HANDLE 底层是 isize，跨线程共享安全
unsafe impl Send for DivertHandle {}
unsafe impl Sync for DivertHandle {}

const QUEUE_LEN: u64 = 2 << 10;
const QUEUE_TIME: u64 = 2 << 9;

impl DivertHandle {
    /// 打开 WinDivert 句柄。`sniff` 为 true 时以嗅探模式打开（capture 用）。
    pub fn open(filter: &str, sniff: bool) -> Result<Self, std::io::Error> {
        let filter = CString::new(filter)
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "filter contains NUL"))?;
        let flags = if sniff {
            WinDivertFlags::new().set_sniff()
        } else {
            WinDivertFlags::new()
        };
        let handle = unsafe { WinDivertOpen(filter.as_ptr(), WinDivertLayer::Network, 0, flags) };
        if handle.is_invalid() {
            return Err(std::io::Error::last_os_error());
        }
        unsafe {
            WinDivertSetParam(handle, WinDivertParam::QueueLength, QUEUE_LEN);
            WinDivertSetParam(handle, WinDivertParam::QueueTime, QUEUE_TIME);
        }
        Ok(Self {
            raw: handle,
            closed: AtomicBool::new(false),
        })
    }

    /// 阻塞接收一个包，返回 (长度, 地址)。
    pub fn recv(&self, buf: &mut [u8]) -> Result<(usize, WINDIVERT_ADDRESS), std::io::Error> {
        // 修复：句柄已关闭时不再进 FFI。原实现会在 close 之后被 recv_loop 的
        // 最后一轮用到悬空 HANDLE（Windows 可能把该值复用给别的对象）。
        // 返回 ERROR_INVALID_HANDLE 让 recv_loop 走既有的 break 分支干净退出。
        if self.closed.load(Ordering::Acquire) {
            return Err(std::io::Error::from_raw_os_error(ERROR_INVALID_HANDLE.0 as i32));
        }
        let mut len: u32 = 0;
        let mut addr = WINDIVERT_ADDRESS::default();
        let ok = unsafe {
            WinDivertRecv(
                self.raw,
                buf.as_mut_ptr().cast(),
                buf.len() as u32,
                &mut len,
                &mut addr,
            )
        };
        if ok.as_bool() {
            Ok((len as usize, addr))
        } else {
            Err(std::io::Error::last_os_error())
        }
    }

    /// 回注一个包，返回实际写入长度。
    pub fn send(&self, data: &[u8], addr: &WINDIVERT_ADDRESS) -> Result<u32, std::io::Error> {
        // 修复：同 recv，关闭后的回注只会把包投给一个已失效的句柄
        if self.closed.load(Ordering::Acquire) {
            return Err(std::io::Error::from_raw_os_error(ERROR_INVALID_HANDLE.0 as i32));
        }
        let mut len: u32 = 0;
        let ok = unsafe {
            WinDivertSend(
                self.raw,
                data.as_ptr().cast(),
                data.len() as u32,
                &mut len,
                addr,
            )
        };
        if ok.as_bool() {
            Ok(len)
        } else {
            Err(std::io::Error::last_os_error())
        }
    }

    /// 关闭句柄，会中断其它线程阻塞中的 recv。
    ///
    /// 修复：幂等。只有第一次调用会真正执行 `WinDivertClose`，重复调用
    /// （clock 线程显式 close + [`Drop`] 兜底）直接返回，避免关掉已被系统复用
    /// 的句柄值。
    pub fn close(&self) -> bool {
        if self.closed.swap(true, Ordering::AcqRel) {
            return true;
        }
        unsafe { WinDivertClose(self.raw) }.as_bool()
    }
}

/// 修复：Drop 兜底。持有该 Arc 的线程若因 panic / 提前 return 没走到显式
/// `close()`，最后一个引用释放时仍会关闭句柄，从而解除 recv 线程的阻塞。
impl Drop for DivertHandle {
    fn drop(&mut self) {
        self.close();
    }
}
