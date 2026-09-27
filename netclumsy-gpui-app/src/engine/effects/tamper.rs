use std::collections::VecDeque;
use std::ffi::c_void;
use std::ptr::null_mut;
use std::sync::atomic::Ordering;

use windivert_sys::{ChecksumFlags, WinDivertHelperCalcChecksums, WinDivertHelperParsePacket};

use crate::engine::config::TamperParams;
use crate::engine::effects::{calc_chance, check_direction};
use crate::engine::packet::Packet;

/// 覆盖所有 bit 的 8 字节 XOR 模式（C 原版 patterns）
const PATTERNS: [u8; 8] = [0x64, 0x13, 0x88, 0x40, 0x1F, 0xA0, 0xAA, 0x55];

#[derive(Default)]
pub struct State {
    /// 跨包持续的 XOR 模式下标（C 原版 patIx，给出更随机的结果）
    pat_ix: usize,
    pub last_enabled: bool,
}

impl State {
    pub fn startup(&mut self) {
        self.pat_ix = 0;
    }

    pub fn close_down(&mut self, _queue: &mut VecDeque<Packet>) {}

    /// 按概率 XOR 破坏 payload（C 原版 tamperProcess）
    pub fn process(
        &mut self,
        queue: &mut VecDeque<Packet>,
        params: &TamperParams,
        _now: u64,
    ) -> bool {
        let inbound = params.base.inbound.load(Ordering::Relaxed);
        let outbound = params.base.outbound.load(Ordering::Relaxed);
        let chance = params.chance.load(Ordering::Relaxed);
        let do_checksum = params.redo_checksum.load(Ordering::Relaxed);

        let mut triggered = false;
        for p in queue.iter_mut() {
            if !(check_direction(p, inbound, outbound) && calc_chance(chance)) {
                continue;
            }
            // 解析失败（非 TCP/UDP 等）直接跳过，对齐 C 原版
            if let Some((off, len)) = payload_range(p) {
                if len <= 4 {
                    // 短包整个 payload 都改
                    tamper_buf(&mut p.data[off..off + len], &mut self.pat_ix);
                } else {
                    // 长包改中间约 1/4
                    let len_d4 = len / 4;
                    let start = len / 2 - len_d4 / 2 + 1;
                    tamper_buf(&mut p.data[off + start..off + start + len_d4], &mut self.pat_ix);
                }
                if do_checksum {
                    unsafe {
                        WinDivertHelperCalcChecksums(
                            p.data.as_mut_ptr().cast::<c_void>(),
                            p.data.len() as u32,
                            null_mut(),
                            ChecksumFlags::new(),
                        );
                    }
                }
                triggered = true;
            }
        }
        triggered
    }
}

fn tamper_buf(buf: &mut [u8], pat_ix: &mut usize) {
    for b in buf.iter_mut() {
        *b ^= PATTERNS[*pat_ix & 0x7];
        *pat_ix += 1;
    }
}

/// 解析 payload 的位置与长度（C 原版用 WinDivertHelperParsePacket 取 payload）
fn payload_range(p: &Packet) -> Option<(usize, usize)> {
    unsafe {
        let mut data: *mut u8 = null_mut();
        let mut data_len: u32 = 0;
        let ok = WinDivertHelperParsePacket(
            p.data.as_ptr().cast::<c_void>(),
            p.data.len() as u32,
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            null_mut(),
            (&mut data as *mut *mut u8).cast::<c_void>(),
            &mut data_len,
            null_mut(),
            null_mut(),
        );
        if ok.as_bool() && !data.is_null() && data_len > 0 {
            Some((data as usize - p.data.as_ptr() as usize, data_len as usize))
        } else {
            None
        }
    }
}
