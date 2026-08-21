//! 参数输入同步与命令行参数应用（从 main_window 拆出）。
//!
//! 语义对齐 C 原版：空/非法输入按 0（下限）处理且不回写文本；越界输入钳位后回写文本。

use std::sync::atomic::{AtomicU32, Ordering};

use gpui::{App, AppContext as _, Entity, Window};
use gpui_component::input::InputState;

use crate::args::ParsedArgs;
use crate::engine::EngineConfig;

/// 创建带默认值的参数输入框
pub fn make_input(window: &mut Window, cx: &mut App, default: &'static str) -> Entity<InputState> {
    cx.new(|cx| InputState::new(window, cx).default_value(default))
}

/// 整数输入同步：解析 → 限幅 → 写原子 → 越界回写文本（空输入按 C 原版存下限值）
pub fn sync_int(
    text: &str,
    min: u32,
    max: u32,
    target: &AtomicU32,
    state: &Entity<InputState>,
    window: &mut Window,
    cx: &mut App,
) {
    match text.trim().parse::<u32>() {
        Ok(v) => {
            let clamped = v.clamp(min, max);
            target.store(clamped, Ordering::Relaxed);
            if clamped != v {
                state.update(cx, |s, cx| s.set_value(clamped.to_string(), window, cx));
            }
        }
        Err(_) => {
            target.store(min, Ordering::Relaxed);
        }
    }
}

/// 概率输入同步（% × 100 存入 0..=10000）
pub fn sync_chance(
    text: &str,
    target: &AtomicU32,
    state: &Entity<InputState>,
    window: &mut Window,
    cx: &mut App,
) {
    match text.trim().parse::<f64>() {
        Ok(v) => {
            let clamped = v.clamp(0.0, 100.0);
            target.store((clamped * 100.0).round() as u32, Ordering::Relaxed);
            if (clamped - v).abs() > 1e-9 {
                state.update(cx, |s, cx| s.set_value(format!("{clamped:.1}"), window, cx));
            }
        }
        Err(_) => {
            target.store(0, Ordering::Relaxed);
        }
    }
}

/// 命令行参数引用到的输入框集合
pub struct EffectInputs<'a> {
    pub lag_time: &'a Entity<InputState>,
    pub drop_chance: &'a Entity<InputState>,
    pub throttle_chance: &'a Entity<InputState>,
    pub throttle_frame: &'a Entity<InputState>,
    pub duplicate_count: &'a Entity<InputState>,
    pub duplicate_chance: &'a Entity<InputState>,
    pub ood_chance: &'a Entity<InputState>,
    pub tamper_chance: &'a Entity<InputState>,
    pub reset_chance: &'a Entity<InputState>,
    pub bandwidth_limit: &'a Entity<InputState>,
}

/// 把命令行参数写进共享配置与输入框。
///
/// 复用 UI 输入订阅用的 sync_int/sync_chance 钳位+回写逻辑，保证 CLI 与
/// 界面输入语义完全一致（原版 parseArgs 也是写 IUP 控件 VALUE，同一路径）。
pub fn apply_cli_args(
    config: &EngineConfig,
    parsed: &ParsedArgs,
    inputs: &EffectInputs<'_>,
    window: &mut Window,
    cx: &mut App,
) {
    // lag
    if let Some(b) = parsed.lag.enabled {
        config.lag.base.enabled.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.lag.inbound {
        config.lag.base.inbound.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.lag.outbound {
        config.lag.base.outbound.store(b, Ordering::Relaxed);
    }
    if let Some(v) = parsed.lag.values.get("time") {
        sync_int(v, 0, 15000, &config.lag.time, inputs.lag_time, window, cx);
    }

    // drop
    if let Some(b) = parsed.drop.enabled {
        config.drop.base.enabled.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.drop.inbound {
        config.drop.base.inbound.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.drop.outbound {
        config.drop.base.outbound.store(b, Ordering::Relaxed);
    }
    if let Some(v) = parsed.drop.values.get("chance") {
        sync_chance(v, &config.drop.chance, inputs.drop_chance, window, cx);
    }

    // throttle
    if let Some(b) = parsed.throttle.enabled {
        config.throttle.base.enabled.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.throttle.inbound {
        config.throttle.base.inbound.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.throttle.outbound {
        config.throttle.base.outbound.store(b, Ordering::Relaxed);
    }
    if let Some(v) = parsed.throttle.values.get("chance") {
        sync_chance(v, &config.throttle.chance, inputs.throttle_chance, window, cx);
    }
    if let Some(v) = parsed.throttle.values.get("frame") {
        sync_int(v, 0, 1000, &config.throttle.frame, inputs.throttle_frame, window, cx);
    }

    // duplicate
    if let Some(b) = parsed.duplicate.enabled {
        config.duplicate.base.enabled.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.duplicate.inbound {
        config.duplicate.base.inbound.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.duplicate.outbound {
        config.duplicate.base.outbound.store(b, Ordering::Relaxed);
    }
    if let Some(v) = parsed.duplicate.values.get("chance") {
        sync_chance(v, &config.duplicate.chance, inputs.duplicate_chance, window, cx);
    }
    if let Some(v) = parsed.duplicate.values.get("count") {
        sync_int(v, 2, 50, &config.duplicate.count, inputs.duplicate_count, window, cx);
    }

    // ood
    if let Some(b) = parsed.ood.enabled {
        config.ood.base.enabled.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.ood.inbound {
        config.ood.base.inbound.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.ood.outbound {
        config.ood.base.outbound.store(b, Ordering::Relaxed);
    }
    if let Some(v) = parsed.ood.values.get("chance") {
        sync_chance(v, &config.ood.chance, inputs.ood_chance, window, cx);
    }

    // tamper
    if let Some(b) = parsed.tamper.enabled {
        config.tamper.base.enabled.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.tamper.inbound {
        config.tamper.base.inbound.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.tamper.outbound {
        config.tamper.base.outbound.store(b, Ordering::Relaxed);
    }
    if let Some(v) = parsed.tamper.values.get("chance") {
        sync_chance(v, &config.tamper.chance, inputs.tamper_chance, window, cx);
    }
    if let Some(v) = parsed.tamper.values.get("checksum") {
        config
            .tamper
            .redo_checksum
            .store(v.eq_ignore_ascii_case("on"), Ordering::Relaxed);
    }

    // reset
    if let Some(b) = parsed.reset.enabled {
        config.reset.base.enabled.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.reset.inbound {
        config.reset.base.inbound.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.reset.outbound {
        config.reset.base.outbound.store(b, Ordering::Relaxed);
    }
    if let Some(v) = parsed.reset.values.get("chance") {
        sync_chance(v, &config.reset.chance, inputs.reset_chance, window, cx);
    }

    // bandwidth
    if let Some(b) = parsed.bandwidth.enabled {
        config.bandwidth.base.enabled.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.bandwidth.inbound {
        config.bandwidth.base.inbound.store(b, Ordering::Relaxed);
    }
    if let Some(b) = parsed.bandwidth.outbound {
        config.bandwidth.base.outbound.store(b, Ordering::Relaxed);
    }
    if let Some(v) = parsed.bandwidth.values.get("bandwidth") {
        sync_int(v, 0, 99999, &config.bandwidth.limit, inputs.bandwidth_limit, window, cx);
    }
}
