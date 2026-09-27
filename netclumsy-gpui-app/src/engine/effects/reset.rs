use std::collections::VecDeque;
use std::ffi::c_void;
use std::ptr::null_mut;
use std::sync::atomic::Ordering;

use windivert_sys::header::WINDIVERT_TCPHDR;
use windivert_sys::{ChecksumFlags, WinDivertHelperCalcChecksums, WinDivertHelperParsePacket};

use crate::engine::config::ResetParams;
use crate::engine::effects::{calc_chance, check_direction};
use crate::engine::packet::Packet;

/// sizeof(WINDIVERT_IPHDR) + sizeof(WINDIVERT_TCPHDR)（C 原版 TCP_MIN_SIZE）
const TCP_MIN_SIZE: usize = 40;

#[derive(Default)]
pub struct State {
    pub last_enabled: bool,
}

impl State {
    pub fn startup(&mut self) {
        // C 原版 resetStartUp：清零 RST 下一包计数
        // （由引擎调用方在 startup 时清零，见 engine/mod.rs）
    }

    pub fn close_down(&mut self, _queue: &mut VecDeque<Packet>) {}

    /// 对匹配 TCP 包强制置 RST 标志（C 原版 resetProcess）
    pub fn process(
        &mut self,
        queue: &mut VecDeque<Packet>,
        params: &ResetParams,
        _now: u64,
    ) -> bool {
        let inbound = params.base.inbound.load(Ordering::Relaxed);
        let outbound = params.base.outbound.load(Ordering::Relaxed);
        let chance = params.chance.load(Ordering::Relaxed);

        let mut triggered = false;
        for p in queue.iter_mut() {
            let next_cnt = params.set_next_count.load(Ordering::Relaxed);
            if !(check_direction(p, inbound, outbound)
                && p.data.len() > TCP_MIN_SIZE
                && (next_cnt > 0 || calc_chance(chance)))
            {
                continue;
            }
            // 解析失败（非 TCP）直接跳过
            if let Some(off) = tcp_header_offset(p) {
                p.data[off + 13] |= 0x04; // TCP flags 字节的 RST 位
                unsafe {
                    WinDivertHelperCalcChecksums(
                        p.data.as_mut_ptr().cast::<c_void>(),
                        p.data.len() as u32,
                        null_mut(),
                        ChecksumFlags::new(),
                    );
                }
                triggered = true;
                if next_cnt > 0 {
                    let _ = params.set_next_count.fetch_update(
                        Ordering::SeqCst,
                        Ordering::SeqCst,
                        |v| v.checked_sub(1),
                    );
                }
            }
        }
        triggered
    }
}

/// TCP 头在包内的偏移（无则返回 None）
fn tcp_header_offset(p: &Packet) -> Option<usize> {
    unsafe {
        let mut tcp: *mut WINDIVERT_TCPHDR = null_mut();
        let ok = WinDivertHelperParsePacket(
            p.data.as_ptr().cast::<c_void>(),
            p.data.len() as u32,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            &mut tcp,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
        );
        if ok.as_bool() && !tcp.is_null() {
            Some(tcp as usize - p.data.as_ptr() as usize)
        } else {
            None
        }
    }
}
