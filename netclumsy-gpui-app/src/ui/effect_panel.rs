//! 效果行组件（design/DESIGN.md §3.4）。
//!
//! 行结构（左 → 右）：触发 LED（10px 圆点 + 2px 柔光外圈，带 tooltip）→
//! Switch → 名称（定宽列内单行居中，14px/500）→ 方向复选框（紧跟名称列，
//! 每行落位相同）→ 弹性留白 → 附加选项 + 参数控件（右对齐收口，「概率」
//! 输入框在所有行共享最右 lane，可比较数字对齐）。
//! 行高 3.25rem（= 52px @16px 基准字号），行间 1px 分隔线，hover 背景
//! fg 4%，禁用行控件区降透明度。
//! 尺寸一律走 rem helper / 官方字号体系，px 仅保留 1px hairline。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use gpui::{
    div, rems, AnyElement, App, Context, ElementId, Entity, FontWeight, Hsla,
    InteractiveElement, IntoElement, ParentElement, SharedString, StatefulInteractiveElement,
    Styled, Window,
};
use gpui::prelude::FluentBuilder as _;
use gpui_component::button::Button;
use gpui_component::checkbox::Checkbox;
use gpui_component::input::{Input, InputState};
use gpui_component::switch::Switch;
use gpui_component::tooltip::Tooltip;
use gpui_component::{h_flex, v_flex, ActiveTheme as _, Disableable, Sizable as _};
use rust_i18n::t;

use crate::engine::{BaseParams, EngineConfig};
use crate::ui::main_window::MainWindow;

/// 禁用行（Switch off）控件区不透明度（设计稿 .is-off 40-55%）
const DISABLED_OPACITY: f32 = 0.45;

/// 效果行骨架：LED + Switch + 单行居中名称 + 方向列 + 右端参数区
fn effect_row(
    id: &'static str,
    title: SharedString,
    triggered: bool,
    enabled: bool,
    directions: [AnyElement; 2],
    controls: Vec<AnyElement>,
    on_toggle: impl Fn(&bool, &mut Window, &mut App) + 'static,
    cx: &App,
) -> AnyElement {
    let switch_id: SharedString = format!("{id}-switch").into();
    let fg = cx.theme().foreground;

    h_flex()
        .id(id)
        .h(rems(3.25))
        .px_4()
        .gap_3()
        .items_center()
        .border_b_1()
        .border_color(cx.theme().border)
        .hover(|s| s.bg(fg.opacity(0.04)))
        .child(status_dot(id, triggered, cx))
        .child(
            Switch::new(ElementId::Name(switch_id))
                .checked(enabled)
                .on_click(on_toggle),
        )
        // 效果名称：定宽列内单行居中（语言切换时这个 key 直接给出英文名）
        .child(
            v_flex()
                .w(rems(5.75))
                .flex_shrink_0()
                .items_center()
                .justify_center()
                .when(!enabled, |this| this.opacity(DISABLED_OPACITY))
                .child(
                    div()
                        .text_sm()
                        .font_weight(FontWeight::MEDIUM)
                        .child(title),
                ),
        )
        // 方向列：紧跟名称列，位置只由前面的定宽元素决定，每行共享同一条 lane
        .child(
            h_flex()
                .items_center()
                .gap_2()
                .when(!enabled, |this| this.opacity(DISABLED_OPACITY))
                .children(directions),
        )
        .child(div().flex_1())
        // 右端参数区：附加选项在前，参数组右对齐收口——各行的「概率」输入框
        // 右缘落在同一条线上（可比较数字对齐），标签紧贴自己的输入框
        .child(
            h_flex()
                .items_center()
                .gap_2()
                .when(!enabled, |this| this.opacity(DISABLED_OPACITY))
                .children(controls),
        )
        .into_any_element()
}

/// 触发指示灯：10px 圆点，触发时带 2px 柔光外圈（同色 35% 透明）
pub fn status_dot(id: &'static str, triggered: bool, cx: &App) -> AnyElement {
    let color: Hsla = if triggered {
        cx.theme().success
    } else {
        cx.theme().muted_foreground
    };
    let tip = if triggered {
        t!("netclumsy.effect.led.triggered").into_owned().into()
    } else {
        t!("netclumsy.effect.led.idle").into_owned().into()
    };
    status_dot_color(
        ElementId::Name(format!("{id}-led").into()),
        color,
        triggered,
        tip,
    )
}

/// 指定颜色的状态灯（发送状态灯等场景复用）；glow 控制是否带柔光外圈。
/// 状态不只靠颜色表达：圆点带 tooltip 说明当前状态。
pub fn status_dot_color(
    id: ElementId,
    color: Hsla,
    glow: bool,
    tooltip_text: SharedString,
) -> AnyElement {
    div()
        .id(id)
        .size_3p5()
        .flex()
        .items_center()
        .justify_center()
        .rounded_full()
        .when(glow, |this| this.bg(color.opacity(0.35)))
        .child(div().size_2p5().rounded_full().bg(color))
        .tooltip(move |window, cx| Tooltip::new(tooltip_text.clone()).build(window, cx))
        .into_any_element()
}

/// 参数小标签（12px muted）
fn param_label(text: impl Into<SharedString>, cx: &App) -> AnyElement {
    div()
        .text_xs()
        .text_color(cx.theme().muted_foreground)
        .child(text.into())
        .into_any_element()
}

/// 方向复选框（inbound / outbound 共用构建逻辑）
fn direction_checkbox(
    id: &'static str,
    label: impl Into<SharedString>,
    base: &BaseParams,
    is_inbound: bool,
    disabled: bool,
    cx: &mut Context<MainWindow>,
) -> AnyElement {
    let target = if is_inbound {
        base.inbound.clone()
    } else {
        base.outbound.clone()
    };
    let checked = target.load(Ordering::Relaxed);
    Checkbox::new(id)
        .label(label.into())
        .checked(checked)
        .disabled(disabled)
        .on_click(cx.listener(move |_, checked, _, cx| {
            target.store(*checked, Ordering::Relaxed);
            cx.notify();
        }))
        .into_any_element()
}

/// 效果开关回调：写 enabled 原子并刷新
fn toggle_handler(
    enabled: Arc<AtomicBool>,
    cx: &mut Context<MainWindow>,
) -> impl Fn(&bool, &mut Window, &mut App) + 'static {
    cx.listener(move |_, checked, _, cx| {
        enabled.store(*checked, Ordering::Relaxed);
        cx.notify();
    })
}

/// 参数输入框（64px 等宽数字输入）
fn param_input(state: &Entity<InputState>, enabled: bool) -> AnyElement {
    Input::new(state)
        .w_16()
        .small()
        .disabled(!enabled)
        .into_any_element()
}

fn direction_pair(
    in_id: &'static str,
    out_id: &'static str,
    base: &BaseParams,
    enabled: bool,
    cx: &mut Context<MainWindow>,
) -> [AnyElement; 2] {
    [
        direction_checkbox(
            in_id,
            t!("netclumsy.window.direction.inbound").into_owned(),
            base,
            true,
            !enabled,
            cx,
        ),
        direction_checkbox(
            out_id,
            t!("netclumsy.window.direction.outbound").into_owned(),
            base,
            false,
            !enabled,
            cx,
        ),
    ]
}

// ---- 8 个效果行（顺序与 C 原版一致：lag → drop → throttle → dup → ood → tamper → reset → bandwidth）----

pub fn lag_row(cfg: &EngineConfig, input: &Entity<InputState>, triggered: bool, cx: &mut Context<MainWindow>) -> AnyElement {
    let enabled = cfg.lag.base.enabled.load(Ordering::Relaxed);
    effect_row(
        "effect-lag",
        t!("netclumsy.effect.lag").into_owned().into(),
        triggered,
        enabled,
        direction_pair("lag-in", "lag-out", &cfg.lag.base, enabled, cx),
        vec![
            param_label(t!("netclumsy.effect.lag.delay").into_owned(), cx),
            param_input(input, enabled),
        ],
        toggle_handler(cfg.lag.base.enabled.clone(), cx),
        cx,
    )
}

pub fn drop_row(cfg: &EngineConfig, input: &Entity<InputState>, triggered: bool, cx: &mut Context<MainWindow>) -> AnyElement {
    let enabled = cfg.drop.base.enabled.load(Ordering::Relaxed);
    effect_row(
        "effect-drop",
        t!("netclumsy.effect.drop").into_owned().into(),
        triggered,
        enabled,
        direction_pair("drop-in", "drop-out", &cfg.drop.base, enabled, cx),
        vec![
            param_label(t!("netclumsy.effect.drop.chance").into_owned(), cx),
            param_input(input, enabled),
        ],
        toggle_handler(cfg.drop.base.enabled.clone(), cx),
        cx,
    )
}

pub fn throttle_row(
    cfg: &EngineConfig,
    frame_input: &Entity<InputState>,
    chance_input: &Entity<InputState>,
    triggered: bool,
    cx: &mut Context<MainWindow>,
) -> AnyElement {
    let enabled = cfg.throttle.base.enabled.load(Ordering::Relaxed);
    let drop_throttled = cfg.throttle.drop_throttled.clone();
    effect_row(
        "effect-throttle",
        t!("netclumsy.effect.throttle").into_owned().into(),
        triggered,
        enabled,
        direction_pair("throttle-in", "throttle-out", &cfg.throttle.base, enabled, cx),
        vec![
            Checkbox::new("throttle-drop")
                .label(t!("netclumsy.effect.throttle.drop_throttled").into_owned())
                .checked(cfg.throttle.drop_throttled.load(Ordering::Relaxed))
                .disabled(!enabled)
                .on_click(cx.listener(move |_, checked, _, cx| {
                    drop_throttled.store(*checked, Ordering::Relaxed);
                    cx.notify();
                }))
                .into_any_element(),
            param_label(t!("netclumsy.effect.throttle.timeframe").into_owned(), cx),
            param_input(frame_input, enabled),
            param_label(t!("netclumsy.effect.throttle.chance").into_owned(), cx),
            param_input(chance_input, enabled),
        ],
        toggle_handler(cfg.throttle.base.enabled.clone(), cx),
        cx,
    )
}

pub fn duplicate_row(
    cfg: &EngineConfig,
    count_input: &Entity<InputState>,
    chance_input: &Entity<InputState>,
    triggered: bool,
    cx: &mut Context<MainWindow>,
) -> AnyElement {
    let enabled = cfg.duplicate.base.enabled.load(Ordering::Relaxed);
    effect_row(
        "effect-duplicate",
        t!("netclumsy.effect.duplicate").into_owned().into(),
        triggered,
        enabled,
        direction_pair("dup-in", "dup-out", &cfg.duplicate.base, enabled, cx),
        vec![
            param_label(t!("netclumsy.effect.duplicate.count").into_owned(), cx),
            param_input(count_input, enabled),
            param_label(t!("netclumsy.effect.duplicate.chance").into_owned(), cx),
            param_input(chance_input, enabled),
        ],
        toggle_handler(cfg.duplicate.base.enabled.clone(), cx),
        cx,
    )
}

pub fn ood_row(cfg: &EngineConfig, input: &Entity<InputState>, triggered: bool, cx: &mut Context<MainWindow>) -> AnyElement {
    let enabled = cfg.ood.base.enabled.load(Ordering::Relaxed);
    effect_row(
        "effect-ood",
        t!("netclumsy.effect.ood").into_owned().into(),
        triggered,
        enabled,
        direction_pair("ood-in", "ood-out", &cfg.ood.base, enabled, cx),
        vec![
            param_label(t!("netclumsy.effect.ood.chance").into_owned(), cx),
            param_input(input, enabled),
        ],
        toggle_handler(cfg.ood.base.enabled.clone(), cx),
        cx,
    )
}

pub fn tamper_row(cfg: &EngineConfig, input: &Entity<InputState>, triggered: bool, cx: &mut Context<MainWindow>) -> AnyElement {
    let enabled = cfg.tamper.base.enabled.load(Ordering::Relaxed);
    let redo_checksum = cfg.tamper.redo_checksum.clone();
    effect_row(
        "effect-tamper",
        t!("netclumsy.effect.tamper").into_owned().into(),
        triggered,
        enabled,
        direction_pair("tamper-in", "tamper-out", &cfg.tamper.base, enabled, cx),
        vec![
            Checkbox::new("tamper-checksum")
                .label(t!("netclumsy.effect.tamper.redo_checksum").into_owned())
                .checked(cfg.tamper.redo_checksum.load(Ordering::Relaxed))
                .disabled(!enabled)
                .on_click(cx.listener(move |_, checked, _, cx| {
                    redo_checksum.store(*checked, Ordering::Relaxed);
                    cx.notify();
                }))
                .into_any_element(),
            param_label(t!("netclumsy.effect.tamper.chance").into_owned(), cx),
            param_input(input, enabled),
        ],
        toggle_handler(cfg.tamper.base.enabled.clone(), cx),
        cx,
    )
}

pub fn reset_row(cfg: &EngineConfig, input: &Entity<InputState>, triggered: bool, cx: &mut Context<MainWindow>) -> AnyElement {
    let enabled = cfg.reset.base.enabled.load(Ordering::Relaxed);
    let cfg_clone = cfg.reset.set_next_count.clone();
    let enabled_flag = cfg.reset.base.enabled.clone();
    effect_row(
        "effect-reset",
        t!("netclumsy.effect.reset").into_owned().into(),
        triggered,
        enabled,
        direction_pair("reset-in", "reset-out", &cfg.reset.base, enabled, cx),
        vec![
            Button::new("reset-next")
                .label(t!("netclumsy.effect.reset.now").into_owned())
                .small()
                .disabled(!enabled)
                .on_click(cx.listener(move |_, _, _, _| {
                    // C 原版：仅在效果启用时计数
                    if enabled_flag.load(Ordering::Relaxed) {
                        let _ = cfg_clone.fetch_update(
                            Ordering::SeqCst,
                            Ordering::SeqCst,
                            |v| if v < 60000 { Some(v + 1) } else { Some(v) },
                        );
                    }
                }))
                .into_any_element(),
            param_label(t!("netclumsy.effect.reset.chance").into_owned(), cx),
            param_input(input, enabled),
        ],
        toggle_handler(cfg.reset.base.enabled.clone(), cx),
        cx,
    )
}

pub fn bandwidth_row(cfg: &EngineConfig, input: &Entity<InputState>, triggered: bool, cx: &mut Context<MainWindow>) -> AnyElement {
    let enabled = cfg.bandwidth.base.enabled.load(Ordering::Relaxed);
    effect_row(
        "effect-bandwidth",
        t!("netclumsy.effect.bandwidth").into_owned().into(),
        triggered,
        enabled,
        direction_pair("bandwidth-in", "bandwidth-out", &cfg.bandwidth.base, enabled, cx),
        vec![
            param_label(t!("netclumsy.effect.bandwidth.limit").into_owned(), cx),
            param_input(input, enabled),
        ],
        toggle_handler(cfg.bandwidth.base.enabled.clone(), cx),
        cx,
    )
}
