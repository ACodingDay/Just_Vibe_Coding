mod config;
mod ffi;
mod packet;
mod send;
mod stats;
pub mod effects;

pub use config::*;
pub use packet::Packet;

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, TryLockError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use rust_i18n::t;
use windows::Win32::Foundation::{ERROR_INVALID_HANDLE, ERROR_INVALID_PARAMETER, ERROR_OPERATION_ABORTED};

use effects::{bandwidth, drop, duplicate, lag, ood, reset, tamper, throttle};

/// 时钟线程周期（ms），与 C 原版 CLOCK_WAITMS 一致
pub const CLOCK_WAIT_MS: u64 = 40;
/// 最大包长（C 原版 MAX_PACKETSIZE）
pub const MAX_PACKET_SIZE: usize = 0xFFFF;
/// recv 线程可容忍的连续"非停止类"错误次数，超过即放弃并转入正常停止收尾。
/// 修复：原先对这些错误码直接 `continue`，驱动异常时会退化成 100% 单核忙等。
const RECV_ERROR_GIVE_UP: u32 = 50;

/// 模块触发位掩码（与 C 原版 modules 数组顺序一致）
pub const BIT_LAG: u32 = 1 << 0;
pub const BIT_DROP: u32 = 1 << 1;
pub const BIT_THROTTLE: u32 = 1 << 2;
pub const BIT_DUPLICATE: u32 = 1 << 3;
pub const BIT_OOD: u32 = 1 << 4;
pub const BIT_TAMPER: u32 = 1 << 5;
pub const BIT_RESET: u32 = 1 << 6;
pub const BIT_BANDWIDTH: u32 = 1 << 7;

/*
 * ── 包队列方向约定（全模块统一，修复回注顺序时确立）────────────────────
 * EngineState.queue 这个 VecDeque：**队首 = 下一个回注的包，队尾 = 最后回注**，
 * 对应 C 原版"单条链表 + appendNode 入尾 + sendAllListPackets 从 head 遍历"。
 *
 *   - recv_loop 收到新包 → push_back（新到的排到最后发）
 *   - send_all          → pop_front 取包回注
 *   - 效果要把"更早、应优先发出"的包放回队首：lag 超时放行、ood 暂存释放
 *   - 效果要整组按时间顺序放回：lag / throttle 的 close_down 用尾插
 *
 * 任何一处把两端用反，都会造成 TCP 乱序（表现为工具自身引入的 reordering）。
 * ────────────────────────────────────────────────────────────────────────
 */

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
                } else if e.kind() == std::io::ErrorKind::InvalidInput {
                    t!("netclumsy.status.filter_invalid").to_string()
                } else {
                    let code = e.raw_os_error().unwrap_or(-1);
                    t!("netclumsy.status.open_device_failed.format", code = code)
                        .to_string()
                }
            })?,
        );

        // 统计与状态位随引擎生命周期重置：跨启动全部清零，避免 UI 从 0 跳回旧值
        // （修复：原先只清 matched_count / rate_pps，send_state 与 triggered_mask
        // 会带上上一轮运行的残留 —— 新一轮 Start 后先发一片触发灯、甚至残留的
        // 红色发送失败灯，直到 UI 下一次 200ms 轮询才纠正）
        config.matched_count.store(0, Ordering::Relaxed);
        config.rate_pps.store(0, Ordering::Relaxed);
        config.send_state.store(SEND_STATUS_NONE, Ordering::Relaxed);
        config.triggered_mask.store(0, Ordering::Relaxed);
        config.engine_exited.store(false, Ordering::Relaxed);

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
                .map_err(|e| t!("netclumsy.status.thread_failed.format", error = e.to_string()))?
        };
        let clock_handle = handle.clone();
        let clock_state = state.clone();
        let clock_stop = stop.clone();
        let clock_config = config.clone();
        // 修复：clock 线程负责收尾（close_down + send_all + 关句柄）。它起不来的话
        // 没人关句柄，recv 线程会永久阻塞在 WinDivertRecv，已劫持的包也就永不回注。
        // 所以失败路径必须自己把 recv 线程放出来并等它退出，再返回错误。
        let clock_thread = match thread::Builder::new()
            .name("netclumsy-clock".into())
            .spawn(move || {
                clock_loop(
                    &clock_handle,
                    &clock_state,
                    &clock_stop,
                    &clock_config,
                    mode,
                )
            }) {
            Ok(t) => t,
            Err(e) => {
                stop.store(true, Ordering::SeqCst);
                handle.close();
                let _ = recv_thread.join();
                return Err(t!(
                    "netclumsy.status.thread_failed.format",
                    error = e.to_string()
                )
                .to_string());
            }
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
    let mut consec_errs: u32 = 0;
    loop {
        let (len, addr) = match handle.recv(&mut buf) {
            Ok(v) => {
                consec_errs = 0;
                v
            }
            Err(e) => {
                if stop.load(Ordering::SeqCst) {
                    break;
                }
                let code = e.raw_os_error().unwrap_or(-1);
                if code == ERROR_INVALID_HANDLE.0 as i32
                    || code == ERROR_OPERATION_ABORTED.0 as i32
                {
                    // 句柄被关闭（停止流程），退出
                    break;
                }
                // 修复：原实现是裸 `continue`，遇到持续性错误（驱动异常、句柄被
                // 外部失效等）会退化成 100% 单核忙等。改为退避 + 计数；超过阈值
                // 就置停止标志，交给 clock 线程走正常收尾（close_down + send_all +
                // 关句柄），而不是让已劫持的包烂在驱动队列里；同时把发送灯转红。
                consec_errs += 1;
                if consec_errs >= RECV_ERROR_GIVE_UP {
                    config.send_state.store(SEND_STATUS_FAIL, Ordering::Relaxed);
                    stop.store(true, Ordering::SeqCst);
                    break;
                }
                thread::sleep(Duration::from_millis(CLOCK_WAIT_MS));
                continue;
            }
        };

        config.matched_count.fetch_add(1, Ordering::Relaxed);

        // 修复：原先 `.unwrap()` 会在 Mutex 被 poison（某个效果线程内 panic）时
        // 让 recv 线程连带 panic，收尾路径全断、队列里的包永不回注。
        // poison 不该放弃处理，取 into_inner 继续跑。
        let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
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
            // 修复：与 recv_loop 同样兜住 poison —— 收尾比"谁弄坏了锁"重要得多，
            // 走到这里就必须把包放回网络栈。
            let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
            close_down_all(&mut guard, config);
            // 修复：capture 模式（SNIFF）下队列里的是流量**副本**，回注等于把同一
            // 个包重复注入网络栈，且嗅探句柄本就不该 send。此前不出事只是因为每步
            // 都 clear 了队列，属于巧合成立。
            if mode == EngineMode::Start {
                send::send_all(handle, &mut guard.queue, config);
            }
            guard.queue.clear();
            // 修复：停机即归零，否则 UI 下一次轮询会从原子里读回最后的速率
            config.rate_pps.store(0, Ordering::Relaxed);
            handle.close();
            // 停止标志区分不了「用户点停止」还是「recv 自行放弃」，统一置位；
            // UI 只在引擎仍在手上时消费（用户主动停止时引擎已被 take，天然跳过）
            config.engine_exited.store(true, Ordering::Relaxed);
            return;
        }

        // try_lock 对应 C 的 WaitForSingleObject(mutex, 40ms)：锁忙则跳过本轮
        // 修复："锁被 poison" 和 "锁忙" 是两回事。原实现把 Poisoned 也当成跳过，
        // 于是任一效果线程 panic 之后，clock 线程就永久静默空转，lag/throttle
        // 缓冲里的包再也发不出去。poison 时取 into_inner 继续收尾式处理。
        let mut guard = match state.try_lock() {
            Ok(g) => g,
            Err(TryLockError::Poisoned(e)) => e.into_inner(),
            // 锁忙（recv 线程正持有）→ 与 C 的 WaitForSingleObject 超时同样跳过本轮
            Err(TryLockError::WouldBlock) => {
                thread::sleep(Duration::from_millis(CLOCK_WAIT_MS));
                continue;
            }
        };
        consume_step(handle, &mut guard, config, mode);
        // 发布当前包速率（窗口未满为 -1 → 显示 0）；流量停止时窗口滑空自然衰减为 0
        let now = now_ms();
        let pps = guard.rate.calculate(now).max(0) as u32;
        config.rate_pps.store(pps, Ordering::Relaxed);
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

    send::send_all(handle, &mut s.queue, config);
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


