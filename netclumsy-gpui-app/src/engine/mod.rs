mod config;
mod ffi;
mod packet;
mod stats;
pub mod effects;

pub use config::*;
pub use packet::Packet;

use std::collections::VecDeque;
use std::ffi::c_void;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use rust_i18n::t;
use windivert_sys::header::{WINDIVERT_ICMPHDR, WINDIVERT_ICMPV6HDR};
use windivert_sys::WinDivertHelperParsePacket;
use windows::Win32::Foundation::{ERROR_INVALID_HANDLE, ERROR_INVALID_PARAMETER, ERROR_OPERATION_ABORTED};

use effects::{bandwidth, drop, duplicate, lag, ood, reset, tamper, throttle};

/// 时钟线程周期（ms），与 C 原版 CLOCK_WAITMS 一致
pub const CLOCK_WAIT_MS: u64 = 40;
/// 最大包长（C 原版 MAX_PACKETSIZE）
pub const MAX_PACKET_SIZE: usize = 0xFFFF;

/// 模块触发位掩码（与 C 原版 modules 数组顺序一致）
pub const BIT_LAG: u32 = 1 << 0;
pub const BIT_DROP: u32 = 1 << 1;
pub const BIT_THROTTLE: u32 = 1 << 2;
pub const BIT_DUPLICATE: u32 = 1 << 3;
pub const BIT_OOD: u32 = 1 << 4;
pub const BIT_TAMPER: u32 = 1 << 5;
pub const BIT_RESET: u32 = 1 << 6;
pub const BIT_BANDWIDTH: u32 = 1 << 7;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineMode {
    /// 嗅探模式：只收副本、统计匹配数，不回注、不处理效果
    Capture,
    /// 正常模式：divert + 效果处理 + 回注
    Start,
}

/// 包处理引擎：复刻 C 原版双线程模型
/// - recv 线程：WinDivertRecv → 加锁入队 → consume step
/// - clock 线程：每 40ms 尝试加锁 → consume step（保证 lag/throttle 缓冲按时放行）；
///   停止时负责 closeDown 所有效果 + 回注剩余包 + WinDivertClose（中断 recv）
pub struct Engine {
    stop: Arc<AtomicBool>,
    recv_thread: Option<JoinHandle<()>>,
    clock_thread: Option<JoinHandle<()>>,
}

struct EngineState {
    queue: VecDeque<Packet>,
    /// 匹配包速率统计（1000ms 滑动窗口，包/秒）
    rate: stats::RateStats,
    lag: lag::State,
    drop: drop::State,
    throttle: throttle::State,
    duplicate: duplicate::State,
    ood: ood::State,
    tamper: tamper::State,
    reset: reset::State,
    bandwidth: bandwidth::State,
}

impl Default for EngineState {
    fn default() -> Self {
        Self {
            queue: VecDeque::new(),
            rate: stats::RateStats::default(),
            lag: lag::State::default(),
            drop: drop::State::default(),
            throttle: throttle::State::default(),
            duplicate: duplicate::State::default(),
            ood: ood::State::default(),
            tamper: tamper::State::default(),
            reset: reset::State::default(),
            bandwidth: bandwidth::State::default(),
        }
    }
}

impl Engine {
    /// 打开句柄并启动双线程
    pub fn new(
        filter: &str,
        mode: EngineMode,
        config: Arc<EngineConfig>,
    ) -> Result<Self, String> {
        let handle = Arc::new(
            ffi::DivertHandle::open(filter, mode == EngineMode::Capture).map_err(|e| {
                if e.raw_os_error() == Some(ERROR_INVALID_PARAMETER.0 as i32) {
                    t!("netclumsy.status.filter_syntax_error").to_string()
                } else {
                    format!("{} (code: {e})", t!("netclumsy.status.open_device_failed"))
                }
            })?,
        );

        // 统计随引擎生命周期重置（matched_count 跨启动清零，避免 UI 从 0 跳回旧累计值）
        config.matched_count.store(0, Ordering::Relaxed);
        config.rate_pps.store(0, Ordering::Relaxed);

        let state = Arc::new(Mutex::new(EngineState::default()));
        let stop = Arc::new(AtomicBool::new(false));

        let recv_thread = {
            let handle = handle.clone();
            let state = state.clone();
            let stop = stop.clone();
            let config = config.clone();
            thread::Builder::new()
                .name("netclumsy-recv".into())
                .spawn(move || recv_loop(&handle, &state, &stop, &config, mode))
                .map_err(|e| format!("{}: {e}", t!("netclumsy.status.thread_failed")))?
        };
        let clock_thread = {
            let handle = handle.clone();
            let state = state.clone();
            let stop = stop.clone();
            let config = config.clone();
            thread::Builder::new()
                .name("netclumsy-clock".into())
                .spawn(move || clock_loop(&handle, &state, &stop, &config, mode))
                .map_err(|e| format!("{}: {e}", t!("netclumsy.status.thread_failed")))?
        };

        Ok(Self {
            stop,
            recv_thread: Some(recv_thread),
            clock_thread: Some(clock_thread),
        })
    }

    /// 停止引擎：置停止标志，等待 recv / clock 线程退出
    pub fn stop(&mut self) {
        if self.stop.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Some(t) = self.recv_thread.take() {
            let _ = t.join();
        }
        if let Some(t) = self.clock_thread.take() {
            let _ = t.join();
        }
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.stop();
    }
}

/// 进程内单调毫秒时钟（替代 C 的 timeGetTime + timeBeginPeriod）
pub(crate) fn now_ms() -> u64 {
    static EPOCH: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    EPOCH.get_or_init(Instant::now).elapsed().as_millis() as u64
}

/// recv 线程：阻塞接收 → 加锁入队 → consume step（C 原版 divertReadLoop）
fn recv_loop(
    handle: &ffi::DivertHandle,
    state: &Mutex<EngineState>,
    stop: &AtomicBool,
    config: &EngineConfig,
    mode: EngineMode,
) {
    let mut buf = vec![0u8; MAX_PACKET_SIZE];
    loop {
        let (len, addr) = match handle.recv(&mut buf) {
            Ok(v) => v,
            Err(e) => {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                match e.raw_os_error() {
                    Some(code)
                        if code == ERROR_INVALID_HANDLE.0 as i32
                            || code == ERROR_OPERATION_ABORTED.0 as i32 =>
                    {
                        // 句柄被关闭（停止流程），退出
                        break;
                    }
                    _ => continue,
                }
            }
        };

        config.matched_count.fetch_add(1, Ordering::Relaxed);

        let mut guard = state.lock().unwrap();
        if stop.load(Ordering::SeqCst) {
            // C 原版："Lost last recved packet but user stopped."
            break;
        }
        let now = now_ms();
        guard
            .queue
            .push_back(Packet::new(buf[..len].to_vec(), addr));
        guard.rate.update(1, now);
        consume_step(handle, &mut guard, config, mode);
    }
}

/// clock 线程：周期 consume；停止时收尾（C 原版 divertClockLoop）
fn clock_loop(
    handle: &ffi::DivertHandle,
    state: &Mutex<EngineState>,
    stop: &AtomicBool,
    config: &EngineConfig,
    mode: EngineMode,
) {
    loop {
        if stop.load(Ordering::SeqCst) {
            // 收尾：关闭所有已启用效果 → 回注剩余包 → 关闭句柄中断 recv
            let mut guard = state.lock().unwrap();
            close_down_all(&mut guard, config);
            send_all(handle, &mut guard.queue, config);
            handle.close();
            return;
        }

        // try_lock 对应 C 的 WaitForSingleObject(mutex, 40ms)：锁忙则跳过本轮
        if let Ok(mut guard) = state.try_lock() {
            consume_step(handle, &mut guard, config, mode);
            // 发布当前包速率（窗口未满为 -1 → 显示 0）；流量停止时窗口滑空自然衰减为 0
            let now = now_ms();
            let pps = guard.rate.calculate(now).max(0) as u32;
            config.rate_pps.store(pps, Ordering::Relaxed);
        }
        thread::sleep(Duration::from_millis(CLOCK_WAIT_MS));
    }
}

/// 单步处理：按固定顺序跑 8 个效果 → 回注队列剩余包（C 原版 divertConsumeStep）
fn consume_step(
    handle: &ffi::DivertHandle,
    s: &mut EngineState,
    config: &EngineConfig,
    mode: EngineMode,
) {
    if mode != EngineMode::Start {
        // capture 模式：嗅探不回注，直接清空
        s.queue.clear();
        return;
    }

    let now = now_ms();
    let mut triggered: u32 = 0;

    if config.lag.base.enabled.load(Ordering::Relaxed) {
        if !s.lag.last_enabled {
            s.lag.startup();
            s.lag.last_enabled = true;
        }
        if s.lag.process(&mut s.queue, &config.lag, now) {
            triggered |= BIT_LAG;
        }
    } else if s.lag.last_enabled {
        s.lag.close_down(&mut s.queue);
        s.lag.last_enabled = false;
    }

    if config.drop.base.enabled.load(Ordering::Relaxed) {
        if !s.drop.last_enabled {
            s.drop.startup();
            s.drop.last_enabled = true;
        }
        if s.drop.process(&mut s.queue, &config.drop, now) {
            triggered |= BIT_DROP;
        }
    } else if s.drop.last_enabled {
        s.drop.close_down(&mut s.queue);
        s.drop.last_enabled = false;
    }

    if config.throttle.base.enabled.load(Ordering::Relaxed) {
        if !s.throttle.last_enabled {
            s.throttle.startup();
            s.throttle.last_enabled = true;
        }
        if s.throttle.process(&mut s.queue, &config.throttle, now) {
            triggered |= BIT_THROTTLE;
        }
    } else if s.throttle.last_enabled {
        s.throttle.close_down(&mut s.queue);
        s.throttle.last_enabled = false;
    }

    if config.duplicate.base.enabled.load(Ordering::Relaxed) {
        if !s.duplicate.last_enabled {
            s.duplicate.startup();
            s.duplicate.last_enabled = true;
        }
        if s.duplicate.process(&mut s.queue, &config.duplicate, now) {
            triggered |= BIT_DUPLICATE;
        }
    } else if s.duplicate.last_enabled {
        s.duplicate.close_down(&mut s.queue);
        s.duplicate.last_enabled = false;
    }

    if config.ood.base.enabled.load(Ordering::Relaxed) {
        if !s.ood.last_enabled {
            s.ood.startup();
            s.ood.last_enabled = true;
        }
        if s.ood.process(&mut s.queue, &config.ood, now) {
            triggered |= BIT_OOD;
        }
    } else if s.ood.last_enabled {
        s.ood.close_down(&mut s.queue);
        s.ood.last_enabled = false;
    }

    if config.tamper.base.enabled.load(Ordering::Relaxed) {
        if !s.tamper.last_enabled {
            s.tamper.startup();
            s.tamper.last_enabled = true;
        }
        if s.tamper.process(&mut s.queue, &config.tamper, now) {
            triggered |= BIT_TAMPER;
        }
    } else if s.tamper.last_enabled {
        s.tamper.close_down(&mut s.queue);
        s.tamper.last_enabled = false;
    }

    if config.reset.base.enabled.load(Ordering::Relaxed) {
        if !s.reset.last_enabled {
            s.reset.startup();
            s.reset.last_enabled = true;
            // C 原版 resetStartUp：清零 RST 下一包计数
            config.reset.set_next_count.store(0, Ordering::SeqCst);
        }
        if s.reset.process(&mut s.queue, &config.reset, now) {
            triggered |= BIT_RESET;
        }
    } else if s.reset.last_enabled {
        s.reset.close_down(&mut s.queue);
        s.reset.last_enabled = false;
        config.reset.set_next_count.store(0, Ordering::SeqCst);
    }

    if config.bandwidth.base.enabled.load(Ordering::Relaxed) {
        if !s.bandwidth.last_enabled {
            s.bandwidth.startup();
            s.bandwidth.last_enabled = true;
        }
        if s.bandwidth.process(&mut s.queue, &config.bandwidth, now) {
            triggered |= BIT_BANDWIDTH;
        }
    } else if s.bandwidth.last_enabled {
        s.bandwidth.close_down(&mut s.queue);
        s.bandwidth.last_enabled = false;
    }

    if triggered != 0 {
        config.triggered_mask.fetch_or(triggered, Ordering::Relaxed);
    }

    send_all(handle, &mut s.queue, config);
}

/// 停止时关闭所有已启用效果（C 原版 clock 线程退出路径）
fn close_down_all(s: &mut EngineState, config: &EngineConfig) {
    if config.lag.base.enabled.load(Ordering::Relaxed) {
        s.lag.close_down(&mut s.queue);
    }
    if config.throttle.base.enabled.load(Ordering::Relaxed) {
        s.throttle.close_down(&mut s.queue);
    }
    if config.ood.base.enabled.load(Ordering::Relaxed) {
        s.ood.close_down(&mut s.queue);
    }
    if config.reset.base.enabled.load(Ordering::Relaxed) {
        config.reset.set_next_count.store(0, Ordering::SeqCst);
    }
}

/// 回注队列所有剩余包（C 原版 sendAllListPackets）
fn send_all(handle: &ffi::DivertHandle, queue: &mut VecDeque<Packet>, config: &EngineConfig) {
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
