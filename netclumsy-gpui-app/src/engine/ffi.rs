use std::ffi::CString;

use windows::Win32::Foundation::HANDLE;
use windivert_sys::{
    address::WINDIVERT_ADDRESS, WinDivertClose, WinDivertFlags, WinDivertLayer, WinDivertOpen,
    WinDivertParam, WinDivertRecv, WinDivertSend, WinDivertSetParam,
};

/// WinDivert 原始句柄封装。
///
/// 与 C 原版一致：HANDLE 可跨线程共享（Copy），停止引擎时由时钟线程调用
/// [`WinDivertClose`] 中断 recv 线程的阻塞 [`WinDivertRecv`]。
pub struct DivertHandle(HANDLE);

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
        Ok(Self(handle))
    }

    /// 阻塞接收一个包，返回 (长度, 地址)。
    pub fn recv(&self, buf: &mut [u8]) -> Result<(usize, WINDIVERT_ADDRESS), std::io::Error> {
        let mut len: u32 = 0;
        let mut addr = WINDIVERT_ADDRESS::default();
        let ok = unsafe {
            WinDivertRecv(
                self.0,
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
        let mut len: u32 = 0;
        let ok = unsafe {
            WinDivertSend(
                self.0,
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
    pub fn close(&self) -> bool {
        unsafe { WinDivertClose(self.0) }.as_bool()
    }
}
