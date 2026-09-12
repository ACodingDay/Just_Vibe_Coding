//! 效果行组件（design/DESIGN.md §3.4）。
//!
//! 行结构（左 → 右）：触发 LED（10px 圆点 + 2px 柔光外圈，带 tooltip）→
//! Switch → 名称（定宽列内单行居中，14px/500）→ 方向复选框（紧跟名称列，
//! 每行落位相同）→ 弹性留白 → 附加选项 + 参数控件（右对齐收口，「概率」
//! 输入框在所有行共享最右 lane，可比较数字对齐）。
//! 行高 3.25rem（= 52px @16px 基准字号），行间 1px 分隔线，hover 背景
//! fg 4%，禁用行控件区降透明度。
//! 尺寸一律走 rem helper / 官方字号体系，px 仅保留 1px hairline。
//!
//! 按职责分四层：
//! 1. `EFFECTS` spec 表 —— 每个效果一条声明（id / 引擎触发布 / 名称 / 配置段 /
//!    参数区构建函数）。新增效果 = 表里加一个条目 + 写一个 `*_controls` 构建函数，
//!    行渲染逻辑零改动。
//! 2. `render_effect_list` —— 遍历 spec 表组装全部行（方向列 + 参数区 + 开关回调）。
//!    滚动容器不在这里：页面层（main_window::render_degrade_page）负责固定
//!    过滤区/统计栏、仅列表区滚动。
//! 3. 行骨架 `effect_row` 与状态灯 `status_dot*`。
//! 4. 控件 helper（param_field / direction_pair / toggle_handler 等）。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use gpui_kit::{
    div, rems, AnyElement, App, Context, ElementId, Entity, FontWeight, Hsla,
    InteractiveElement, IntoElement, ParentElement, SharedString, StatefulInteractiveElement,
    Styled, Window,
};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::component::button::Button;
use gpui_kit::component::checkbox::Checkbox;
use gpui_kit::component::input::{Input, InputState};
use gpui_kit::component::switch::Switch;
use gpui_kit::component::tooltip::Tooltip;
use gpui_kit::component::{h_flex, v_flex, ActiveTheme as _, Disableable, Sizable as _};
use rust_i18n::t;

use crate::engine::{
    BaseParams, EngineConfig, BIT_BANDWIDTH, BIT_DROP, BIT_DUPLICATE, BIT_LAG, BIT_OOD,
    BIT_RESET, BIT_TAMPER, BIT_THROTTLE,
};
use crate::ui::inputs::EffectInputs;
use crate::ui::main_window::MainWindow;

/// 禁用行（Switch off）控件区不透明度（设计稿 .is-off 40-55%）
const DISABLED_OPACITY: f32 = 0.45;

// ---------------------------------------------------------------------------
// 1. 效果声明表：新增效果只动这里 + 对应的 *_controls 构建函数
// ---------------------------------------------------------------------------

/// 各效果参数区构建函数的统一签名。
///
/// 生命周期全部独立量化（gpui 的 `Context<'e, _>` 内部生命周期不变，
/// 若与 cfg/inputs 绑在同一生命周期上，借用会横跨整个调用点无法结束）。
/// cfg / inputs 是只读借用，cx 的两层生命周期按调用点统一，各效果
/// 构建函数照常写省略形式即可。
type ControlsFn = for<'a, 'b, 'c, 'd, 'e> fn(
    &'a EngineConfig,
    &'b EffectInputs<'c>,
    bool,
    &'d mut Context<'e, MainWindow>,
) -> Vec<AnyElement>;

/// 效果声明条目。顺序 = 引擎处理顺序（与 C 原版一致）。
struct EffectSpec {
    /// 元素 id 前缀（LED / Switch / 方向复选框均由它派生）
    id: &'static str,
    /// 引擎 triggered_mask 对应的触发布
    bit: u32,
    /// 效果名（i18n key 本身即英文名，语言切换直接生效）
    title: fn() -> SharedString,
    /// 该效果的 BaseParams 配置段（enabled / inbound / outbound）
    base: for<'a> fn(&'a EngineConfig) -> &'a BaseParams,
    /// 右端参数区（附加选项在前，参数组右对齐收口）
    controls: ControlsFn,
}

const EFFECTS: [EffectSpec; 8] = [
    EffectSpec {
        id: "lag",
        bit: BIT_LAG,
        title: || t!("netclumsy.effect.lag").into_owned().into(),
        base: |cfg| &cfg.lag.base,
        controls: lag_controls,
    },
    EffectSpec {
        id: "drop",
        bit: BIT_DROP,
        title: || t!("netclumsy.effect.drop").into_owned().into(),
        base: |cfg| &cfg.drop.base,
        controls: drop_controls,
    },
    EffectSpec {
        id: "throttle",
        bit: BIT_THROTTLE,
        title: || t!("netclumsy.effect.throttle").into_owned().into(),
        base: |cfg| &cfg.throttle.base,
        controls: throttle_controls,
    },
    EffectSpec {
        id: "duplicate",
        bit: BIT_DUPLICATE,
        title: || t!("netclumsy.effect.duplicate").into_owned().into(),
        base: |cfg| &cfg.duplicate.base,
        controls: duplicate_controls,
    },
    EffectSpec {
        id: "ood",
        bit: BIT_OOD,
        title: || t!("netclumsy.effect.ood").into_owned().into(),
        base: |cfg| &cfg.ood.base,
        controls: ood_controls,
    },
    EffectSpec {
        id: "tamper",
        bit: BIT_TAMPER,
        title: || t!("netclumsy.effect.tamper").into_owned().into(),
        base: |cfg| &cfg.tamper.base,
        controls: tamper_controls,
    },
    EffectSpec {
        id: "reset",
        bit: BIT_RESET,
        title: || t!("netclumsy.effect.reset").into_owned().into(),
        base: |cfg| &cfg.reset.base,
        controls: reset_controls,
    },
    EffectSpec {
        id: "bandwidth",
        bit: BIT_BANDWIDTH,
        title: || t!("netclumsy.effect.bandwidth").into_owned().into(),
        base: |cfg| &cfg.bandwidth.base,
        controls: bandwidth_controls,
    },
];

// ---------------------------------------------------------------------------
// 2. 列表组装入口：遍历 spec 表，行渲染逻辑对新增效果零感知
// ---------------------------------------------------------------------------

/// 全部效果行（顺序 = EFFECTS 表声明顺序）。滚动容器由页面层负责。
pub fn render_effect_list(
    cfg: &EngineConfig,
    inputs: &EffectInputs<'_>,
    triggered_mask: u32,
    cx: &mut Context<MainWindow>,
) -> AnyElement {
    v_flex()
        .children(EFFECTS.iter().map(|spec| {
            let base = (spec.base)(cfg);
            let enabled = base.enabled.load(Ordering::Relaxed);
            let directions = direction_pair(spec.id, base, enabled, cx);
            let controls = (spec.controls)(cfg, inputs, enabled, cx);
            let on_toggle = toggle_handler(base.enabled.clone(), cx);
            effect_row(
                spec.id,
                (spec.title)(),
                triggered_mask & spec.bit != 0,
                enabled,
                directions,
                controls,
                on_toggle,
                cx,
            )
        }))
        .into_any_element()
}

// ---------------------------------------------------------------------------
// 3. 行骨架与状态灯
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 4. 控件 helper：方向列 / 参数输入 / 开关回调
// ---------------------------------------------------------------------------

/// 参数小标签（12px muted）
fn param_label(text: impl Into<SharedString>, cx: &App) -> AnyElement {
    div()
        .text_xs()
        .text_color(cx.theme().muted_foreground)
        .child(text.into())
        .into_any_element()
}

/// 参数输入框（64px 等宽数字输入）
fn param_input(state: &Entity<InputState>, enabled: bool) -> AnyElement {
    Input::new(state)
        .w_16()
        .small()
        .disabled(!enabled)
        .into_any_element()
}

/// 「标签 + 输入框」参数对（右端参数区的基本单元，标签紧贴自己的输入框）
fn param_field(
    label: impl Into<SharedString>,
    state: &Entity<InputState>,
    enabled: bool,
    cx: &App,
) -> Vec<AnyElement> {
    vec![param_label(label, cx), param_input(state, enabled)]
}

/// 方向复选框（inbound / outbound 共用构建逻辑）
fn direction_checkbox(
    id: ElementId,
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

fn direction_pair(
    id: &'static str,
    base: &BaseParams,
    enabled: bool,
    cx: &mut Context<MainWindow>,
) -> [AnyElement; 2] {
    [
        direction_checkbox(
            ElementId::Name(format!("{id}-in").into()),
            t!("netclumsy.window.direction.inbound").into_owned(),
            base,
            true,
            !enabled,
            cx,
        ),
        direction_checkbox(
            ElementId::Name(format!("{id}-out").into()),
            t!("netclumsy.window.direction.outbound").into_owned(),
            base,
            false,
            !enabled,
            cx,
        ),
    ]
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

// ---------------------------------------------------------------------------
// 5. 各效果参数区构建函数（对应 EFFECTS 表的 controls 字段）
// ---------------------------------------------------------------------------

fn lag_controls(
    _cfg: &EngineConfig,
    inputs: &EffectInputs<'_>,
    enabled: bool,
    cx: &mut Context<'_, MainWindow>,
) -> Vec<AnyElement> {
    param_field(t!("netclumsy.effect.lag.delay").into_owned(), inputs.lag_time, enabled, cx)
}

fn drop_controls(
    _cfg: &EngineConfig,
    inputs: &EffectInputs<'_>,
    enabled: bool,
    cx: &mut Context<'_, MainWindow>,
) -> Vec<AnyElement> {
    param_field(t!("netclumsy.effect.drop.chance").into_owned(), inputs.drop_chance, enabled, cx)
}

fn throttle_controls(
    cfg: &EngineConfig,
    inputs: &EffectInputs<'_>,
    enabled: bool,
    cx: &mut Context<'_, MainWindow>,
) -> Vec<AnyElement> {
    let drop_throttled = cfg.throttle.drop_throttled.clone();
    let mut controls = vec![
        Checkbox::new("throttle-drop")
            .label(t!("netclumsy.effect.throttle.drop_throttled").into_owned())
            .checked(cfg.throttle.drop_throttled.load(Ordering::Relaxed))
            .disabled(!enabled)
            .on_click(cx.listener(move |_, checked, _, cx| {
                drop_throttled.store(*checked, Ordering::Relaxed);
                cx.notify();
            }))
            .into_any_element(),
    ];
    controls.extend(param_field(
        t!("netclumsy.effect.throttle.timeframe").into_owned(),
        inputs.throttle_frame,
        enabled,
        cx,
    ));
    controls.extend(param_field(
        t!("netclumsy.effect.throttle.chance").into_owned(),
        inputs.throttle_chance,
        enabled,
        cx,
    ));
    controls
}

fn duplicate_controls(
    _cfg: &EngineConfig,
    inputs: &EffectInputs<'_>,
    enabled: bool,
    cx: &mut Context<'_, MainWindow>,
) -> Vec<AnyElement> {
    let mut controls = param_field(
        t!("netclumsy.effect.duplicate.count").into_owned(),
        inputs.duplicate_count,
        enabled,
        cx,
    );
    controls.extend(param_field(
        t!("netclumsy.effect.duplicate.chance").into_owned(),
        inputs.duplicate_chance,
        enabled,
        cx,
    ));
    controls
}

fn ood_controls(
    _cfg: &EngineConfig,
    inputs: &EffectInputs<'_>,
    enabled: bool,
    cx: &mut Context<'_, MainWindow>,
) -> Vec<AnyElement> {
    param_field(t!("netclumsy.effect.ood.chance").into_owned(), inputs.ood_chance, enabled, cx)
}

fn tamper_controls(
    cfg: &EngineConfig,
    inputs: &EffectInputs<'_>,
    enabled: bool,
    cx: &mut Context<'_, MainWindow>,
) -> Vec<AnyElement> {
    let redo_checksum = cfg.tamper.redo_checksum.clone();
    let mut controls = vec![
        Checkbox::new("tamper-checksum")
            .label(t!("netclumsy.effect.tamper.redo_checksum").into_owned())
            .checked(cfg.tamper.redo_checksum.load(Ordering::Relaxed))
            .disabled(!enabled)
            .on_click(cx.listener(move |_, checked, _, cx| {
                redo_checksum.store(*checked, Ordering::Relaxed);
                cx.notify();
            }))
            .into_any_element(),
    ];
    controls.extend(param_field(
        t!("netclumsy.effect.tamper.chance").into_owned(),
        inputs.tamper_chance,
        enabled,
        cx,
    ));
    controls
}

fn reset_controls(
    cfg: &EngineConfig,
    inputs: &EffectInputs<'_>,
    enabled: bool,
    cx: &mut Context<'_, MainWindow>,
) -> Vec<AnyElement> {
    let cfg_clone = cfg.reset.set_next_count.clone();
    let enabled_flag = cfg.reset.base.enabled.clone();
    let mut controls = vec![
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
    ];
    controls.extend(param_field(
        t!("netclumsy.effect.reset.chance").into_owned(),
        inputs.reset_chance,
        enabled,
        cx,
    ));
    controls
}

fn bandwidth_controls(
    _cfg: &EngineConfig,
    inputs: &EffectInputs<'_>,
    enabled: bool,
    cx: &mut Context<'_, MainWindow>,
) -> Vec<AnyElement> {
    param_field(t!("netclumsy.effect.bandwidth.limit").into_owned(), inputs.bandwidth_limit, enabled, cx)
}
