//! 参数输入同步与命令行参数应用（从 main_window 拆出）。
//!
//! 语义对齐 C 原版：空/非法输入按下限值写入共享配置且不动文本；
//! 越上界钳位后回写文本纠正；越下界只钳位写原子、不回写文本（逐键回写会打断输入）。

use std::sync::atomic::{AtomicU32, Ordering};

use gpui::{App, AppContext as _, Entity, Window};
use gpui_component::input::InputState;

use crate::args::ParsedArgs;
use crate::engine::EngineConfig;

/// 创建带默认值的参数输入框
pub fn make_input(window: &mut Window, cx: &mut App, default: &'static str) -> Entity<InputState> {
    cx.new(|cx| InputState::new(window, cx).default_value(default))
}

/// 整数输入同步：解析 → 限幅 → 写原子（仅越上界时回写文本纠正）
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
            // 修复：下限钳位不能回写文本。订阅点是逐键 InputEvent::Change，
            // duplicate count 下限 2 时，输入 "15" 的第一键 "1" 会被改成 "2"，
            // 第二键后就变成 "25" —— 合法前缀被当成非法值。
            // 上限越界不是任何数的前缀，回写纠正仍然有价值，保留。
            // 副作用：命令行传超下界值（如 --duplicate-count 1）时输入框保留原值、
            // 引擎按钳位后的 2 运行（与 C 原版 IUP 控件的显示语义一致）。
            if v > max {
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
        // 修复：Rust 的 parse 会把 "NaN"/"nan" 当合法浮点数，而 NaN.clamp() 原样返回
        // NaN，(NaN * 100.0).round() as u32 饱和成 0，且 NaN != NaN 让下面的回写判断
        // 永不触发 —— 结果是输入框显示 "NaN"、引擎按 0% 静默运行。显式判掉。
        Ok(v) if v.is_nan() => {
            target.store(0, Ordering::Relaxed);
            // NaN 不是任何合法输入的前缀，回写 "0" 纠正显示（引擎此时已按 0% 运行）
            state.update(cx, |s, cx| s.set_value("0".to_string(), window, cx));
        }
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
