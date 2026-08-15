//! 包回注：把引擎队列中的包送回网络栈。
//!
//! 职责边界：只负责"发送"——队列清空顺序、发送状态灯、入站 ICMP 回注失败
//! workaround（C 原版 divert.c 的 sendAllListPackets + workaround 逻辑）。

use std::collections::VecDeque;
use std::ffi::c_void;
use std::ptr::null_mut;
use std::sync::atomic::Ordering;

use windivert_sys::header::{WINDIVERT_ICMPHDR, WINDIVERT_ICMPV6HDR};
use windivert_sys::WinDivertHelperParsePacket;

use super::config::{EngineConfig, SEND_STATUS_FAIL, SEND_STATUS_SEND};
use super::ffi::DivertHandle;
use super::packet::Packet;

/// 回注队列所有剩余包（C 原版 sendAllListPackets）
pub(crate) fn send_all(handle: &DivertHandle, queue: &mut VecDeque<Packet>, config: &EngineConfig) {
    while let Some(p) = queue.pop_back() {
        match handle.send(&p.data, &p.addr) {
            Ok(len) => {
                if len as usize >= p.data.len() {
                    config.send_state.store(SEND_STATUS_SEND, Ordering::Relaxed);
                } else {
                    config.send_state.store(SEND_STATUS_FAIL, Ordering::Relaxed);
                }
            }
            Err(_) => {
                // C 原版：入站 ICMP 回注失败率高，改为出站方向重发（交换 src/dst）
                match try_resend_inbound_icmp_as_outbound(p) {
                    Some(resend) => match handle.send(&resend.data, &resend.addr) {
                        Ok(_) => config.send_state.store(SEND_STATUS_SEND, Ordering::Relaxed),
                        Err(_) => config.send_state.store(SEND_STATUS_FAIL, Ordering::Relaxed),
                    },
                    None => config.send_state.store(SEND_STATUS_FAIL, Ordering::Relaxed),
                }
            }
        }
    }
}

/// 入站 ICMP 回注失败时：置出站标志并交换 IP src/dst 后重发（C 原版 workaround）
fn try_resend_inbound_icmp_as_outbound(mut p: Packet) -> Option<Packet> {
    if p.is_outbound() {
        return None;
    }

    let mut icmp: *mut WINDIVERT_ICMPHDR = null_mut();
    let mut icmpv6: *mut WINDIVERT_ICMPV6HDR = null_mut();
    let ok = unsafe {
        WinDivertHelperParsePacket(
            p.data.as_ptr().cast::<c_void>(),
            p.data.len() as u32,
            null_mut(),
            null_mut(),
            null_mut(),
            &mut icmp,
            &mut icmpv6,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
        )
    };
    if !ok.as_bool() || (icmp.is_null() && icmpv6.is_null()) {
        return None;
    }

    let version = p.data.first().map_or(0, |b| b >> 4);
    if version == 4 {
        let ihl = ((p.data[0] & 0x0F) as usize) * 4;
        if p.data.len() < ihl + 20 {
            return None;
        }
        let (a, b) = p.data.split_at_mut(ihl + 16);
        a[ihl + 12..ihl + 16].swap_with_slice(&mut b[0..4]);
    } else if version == 6 && p.data.len() >= 40 {
        let (a, b) = p.data.split_at_mut(24);
        a[8..24].swap_with_slice(&mut b[0..16]);
    } else {
        return None;
    }

    p.addr.set_outbound(true);
    Some(p)
}
