use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

use gpui::*;
use gpui::prelude::FluentBuilder as _;
use gpui_component::button::{Button, ButtonVariants};
use gpui_component::checkbox::Checkbox;
use gpui_component::input::{Input, InputEvent, InputState};
use gpui_component::select::{SearchableVec, Select, SelectEvent, SelectState};
use gpui_component::text::Text;
use gpui_component::{
    h_flex, v_flex, ActiveTheme as _, Disableable, IndexPath, Sizable as _,
};
use rust_i18n::t;

use crate::engine::{
    Engine, EngineConfig, EngineMode, SEND_STATUS_FAIL, SEND_STATUS_SEND, BIT_BANDWIDTH, BIT_DROP,
    BIT_DUPLICATE, BIT_LAG, BIT_OOD, BIT_RESET, BIT_TAMPER, BIT_THROTTLE,
};
use crate::ui::effect_panel::{effect_row, status_dot_color};
use crate::ui::presets::PRESETS;

/// 指示灯轮询周期（与 C 原版 ICON_UPDATE_MS 一致）
const POLL_INTERVAL_MS: u64 = 200;

pub struct MainWindow {
    config: Arc<EngineConfig>,
    engine: Option<Engine>,
    filter_input: Entity<InputState>,
    preset_select: Entity<SelectState<SearchableVec<SharedString>>>,
    lag_time_input: Entity<InputState>,
    drop_chance_input: Entity<InputState>,
    throttle_chance_input: Entity<InputState>,
    throttle_frame_input: Entity<InputState>,
    duplicate_count_input: Entity<InputState>,
    duplicate_chance_input: Entity<InputState>,
    ood_chance_input: Entity<InputState>,
    tamper_chance_input: Entity<InputState>,
    reset_chance_input: Entity<InputState>,
    bandwidth_limit_input: Entity<InputState>,
    matched_count: u64,
    packet_rate: u32,
    send_state: u8,
    triggered_mask: u32,
    status_text: SharedString,
    _subscriptions: Vec<Subscription>,
}

impl MainWindow {
    pub fn new(window: &mut Window, cx: &mut Context<Self>, config: Arc<EngineConfig>) -> Self {
        let filter_input = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder(t!("netclumsy.window.filter.placeholder"))
                .default_value(PRESETS[0].1)
        });

        let preset_items: Vec<SharedString> =
            PRESETS.iter().map(|(name, _)| (*name).into()).collect();
        let preset_select = cx.new(|cx| {
            SelectState::new(
                SearchableVec::new(preset_items),
                Some(IndexPath::default()),
                window,
                cx,
            )
        });

        let lag_time_input = make_input(window, cx, "50");
        let drop_chance_input = make_input(window, cx, "10.0");
        let throttle_chance_input = make_input(window, cx, "10.0");
        let throttle_frame_input = make_input(window, cx, "30");
        let duplicate_count_input = make_input(window, cx, "2");
        let duplicate_chance_input = make_input(window, cx, "10.0");
        let ood_chance_input = make_input(window, cx, "10.0");
        let tamper_chance_input = make_input(window, cx, "10.0");
        let reset_chance_input = make_input(window, cx, "0");
        let bandwidth_limit_input = make_input(window, cx, "10");

        let mut subscriptions = Vec::new();

        subscriptions.push(cx.subscribe_in(
            &preset_select,
            window,
            |this: &mut Self, _, event, window, cx| {
                if let SelectEvent::Confirm(Some(value)) = event {
                    if let Some((_, expr)) = PRESETS.iter().find(|(n, _)| *n == value.as_ref()) {
                        this.filter_input
                            .update(cx, |s, cx| s.set_value(*expr, window, cx));
                    }
                }
            },
        ));

        // 参数输入：解析 → 限幅 → 写入共享配置（空输入按 C 原版存下限值）
        let cfg = config.clone();
        subscriptions.push(cx.subscribe_in(
            &lag_time_input,
            window,
            move |_, state, event: &InputEvent, window, cx| {
                if let InputEvent::Change = event {
                    let v = state.read(cx).value();
                    sync_int(v.as_ref(), 0, 15000, &cfg.lag.time, state, window, cx);
                }
            },
        ));
        let cfg = config.clone();
        subscriptions.push(cx.subscribe_in(
            &drop_chance_input,
            window,
            move |_, state, event: &InputEvent, window, cx| {
                if let InputEvent::Change = event {
                    let v = state.read(cx).value();
                    sync_chance(v.as_ref(), &cfg.drop.chance, state, window, cx);
                }
            },
        ));
        let cfg = config.clone();
        subscriptions.push(cx.subscribe_in(
            &throttle_chance_input,
            window,
            move |_, state, event: &InputEvent, window, cx| {
                if let InputEvent::Change = event {
                    let v = state.read(cx).value();
                    sync_chance(v.as_ref(), &cfg.throttle.chance, state, window, cx);
                }
            },
        ));
        let cfg = config.clone();
        subscriptions.push(cx.subscribe_in(
            &throttle_frame_input,
            window,
            move |_, state, event: &InputEvent, window, cx| {
                if let InputEvent::Change = event {
                    let v = state.read(cx).value();
                    sync_int(v.as_ref(), 0, 1000, &cfg.throttle.frame, state, window, cx);
                }
            },
        ));
        let cfg = config.clone();
        subscriptions.push(cx.subscribe_in(
            &duplicate_count_input,
            window,
            move |_, state, event: &InputEvent, window, cx| {
                if let InputEvent::Change = event {
                    let v = state.read(cx).value();
                    sync_int(v.as_ref(), 2, 50, &cfg.duplicate.count, state, window, cx);
                }
            },
        ));
        let cfg = config.clone();
        subscriptions.push(cx.subscribe_in(
            &duplicate_chance_input,
            window,
            move |_, state, event: &InputEvent, window, cx| {
                if let InputEvent::Change = event {
                    let v = state.read(cx).value();
                    sync_chance(v.as_ref(), &cfg.duplicate.chance, state, window, cx);
                }
            },
        ));
        let cfg = config.clone();
        subscriptions.push(cx.subscribe_in(
            &ood_chance_input,
            window,
            move |_, state, event: &InputEvent, window, cx| {
                if let InputEvent::Change = event {
                    let v = state.read(cx).value();
                    sync_chance(v.as_ref(), &cfg.ood.chance, state, window, cx);
                }
            },
        ));
        let cfg = config.clone();
        subscriptions.push(cx.subscribe_in(
            &tamper_chance_input,
            window,
            move |_, state, event: &InputEvent, window, cx| {
                if let InputEvent::Change = event {
                    let v = state.read(cx).value();
                    sync_chance(v.as_ref(), &cfg.tamper.chance, state, window, cx);
                }
            },
        ));
        let cfg = config.clone();
        subscriptions.push(cx.subscribe_in(
            &reset_chance_input,
            window,
            move |_, state, event: &InputEvent, window, cx| {
                if let InputEvent::Change = event {
                    let v = state.read(cx).value();
                    sync_chance(v.as_ref(), &cfg.reset.chance, state, window, cx);
                }
            },
        ));
        let cfg = config.clone();
        subscriptions.push(cx.subscribe_in(
            &bandwidth_limit_input,
            window,
            move |_, state, event: &InputEvent, window, cx| {
                if let InputEvent::Change = event {
                    let v = state.read(cx).value();
                    sync_int(v.as_ref(), 0, 99999, &cfg.bandwidth.limit, state, window, cx);
                }
            },
        ));

        // 指示灯轮询：读取原子状态并刷新界面
        cx.spawn(|view: WeakEntity<Self>, cx: &mut AsyncApp| {
            let cx = cx.clone();
            async move {
                let mut cx = cx;
                loop {
                    cx.background_executor()
                        .timer(Duration::from_millis(POLL_INTERVAL_MS))
                        .await;
                    if view
                        .update(&mut cx, |this, cx| this.poll_status(cx))
                        .is_err()
                    {
                        break;
                    }
                }
            }
        })
        .detach();

        Self {
            config,
            engine: None,
            filter_input,
            preset_select,
            lag_time_input,
            drop_chance_input,
            throttle_chance_input,
            throttle_frame_input,
            duplicate_count_input,
            duplicate_chance_input,
            ood_chance_input,
            tamper_chance_input,
            reset_chance_input,
            bandwidth_limit_input,
            matched_count: 0,
            packet_rate: 0,
            send_state: 0,
            triggered_mask: 0,
            status_text: t!("netclumsy.status.idle").into_owned().into(),
            _subscriptions: subscriptions,
        }
    }

    fn start_engine(&mut self, mode: EngineMode, cx: &mut Context<Self>) {
        let filter = self.filter_input.read(cx).value().to_string();
        match Engine::new(&filter, mode, self.config.clone()) {
            Ok(engine) => {
                self.engine = Some(engine);
                self.status_text = t!("netclumsy.status.started").into_owned().into();
                self.matched_count = 0;
                self.packet_rate = 0;
                self.send_state = 0;
                self.triggered_mask = 0;
            }
            Err(e) => {
                self.status_text = format!("{}: {e}", t!("netclumsy.status.start_failed")).into();
            }
        }
        cx.notify();
    }

    fn stop_engine(&mut self, cx: &mut Context<Self>) {
        if let Some(mut engine) = self.engine.take() {
            engine.stop();
        }
        self.status_text = t!("netclumsy.status.stopped").into_owned().into();
        self.packet_rate = 0;
        self.send_state = 0;
        self.triggered_mask = 0;
        cx.notify();
    }

    fn poll_status(&mut self, cx: &mut Context<Self>) {
        self.matched_count = self.config.matched_count.load(Ordering::Relaxed);
        self.packet_rate = self.config.rate_pps.load(Ordering::Relaxed);
        self.send_state = self.config.send_state.swap(0, Ordering::SeqCst);
        self.triggered_mask = self.config.triggered_mask.swap(0, Ordering::SeqCst);
        cx.notify();
    }
}

impl Drop for MainWindow {
    fn drop(&mut self) {
        if let Some(mut engine) = self.engine.take() {
            engine.stop();
        }
    }
}

fn make_input(window: &mut Window, cx: &mut App, default: &'static str) -> Entity<InputState> {
    cx.new(|cx| InputState::new(window, cx).default_value(default))
}

/// 参数标签（禁用时置灰）
fn param_label(text: impl Into<SharedString>, disabled: bool, cx: &App) -> AnyElement {
    div()
        .text_sm()
        .when(disabled, |this| this.text_color(cx.theme().muted_foreground))
        .child(text.into())
        .into_any_element()
}

/// 整数输入同步：解析 → 限幅 → 写原子 → 越界回写文本（空输入按 C 原版存下限值）
fn sync_int(
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
fn sync_chance(
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

impl Render for MainWindow {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let running = self.engine.is_some();
        let config = self.config.clone();

        let lag_enabled = config.lag.base.enabled.load(Ordering::Relaxed);
        let drop_enabled = config.drop.base.enabled.load(Ordering::Relaxed);
        let throttle_enabled = config.throttle.base.enabled.load(Ordering::Relaxed);
        let duplicate_enabled = config.duplicate.base.enabled.load(Ordering::Relaxed);
        let ood_enabled = config.ood.base.enabled.load(Ordering::Relaxed);
        let tamper_enabled = config.tamper.base.enabled.load(Ordering::Relaxed);
        let reset_enabled = config.reset.base.enabled.load(Ordering::Relaxed);
        let bandwidth_enabled = config.bandwidth.base.enabled.load(Ordering::Relaxed);

        let send_dot = match self.send_state {
            SEND_STATUS_SEND => status_dot_color(rgb(0x6DAA2C).into()),
            SEND_STATUS_FAIL => status_dot_color(rgb(0xD04648).into()),
            _ => status_dot_color(rgb(0xE0E0E0).into()),
        };

        v_flex()
            .p_4()
            .gap_2()
            .size_full()
            .bg(cx.theme().background)
            // 过滤器输入
            .child(Input::new(&self.filter_input).disabled(running))
            // 控制行：状态灯 + Capture/Start + 预设
            .child(
                h_flex()
                    .items_center()
                    .gap_2()
                    .child(send_dot)
                    .child(
                        Button::new("btn-capture")
                            .label(t!("netclumsy.window.capture").into_owned())
                            .disabled(running)
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.start_engine(EngineMode::Capture, cx)
                            })),
                    )
                    .child(if running {
                        Button::new("btn-stop")
                            .danger()
                            .label(t!("netclumsy.window.stop").into_owned())
                            .on_click(cx.listener(|this, _, _, cx| this.stop_engine(cx)))
                    } else {
                        Button::new("btn-start")
                            .primary()
                            .label(t!("netclumsy.window.start").into_owned())
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.start_engine(EngineMode::Start, cx)
                            }))
                    })
                    .child(div().flex_1())
                    .child(t!("netclumsy.window.presets").into_owned())
                    .child(div().w(px(230.)).child(Select::new(&self.preset_select).disabled(running))),
            )
            // ---- 效果行（顺序与 C 原版一致：lag → drop → throttle → dup → ood → tamper → reset → bandwidth）----
            .child({
                let cfg = config.clone();
                effect_row(
                    "effect-lag",
                    t!("netclumsy.effect.lag").into_owned().into(),
                    self.triggered_mask & BIT_LAG != 0,
                    lag_enabled,
                    vec![
                        direction_checkbox("lag-in", t!("netclumsy.window.direction.inbound").into_owned(), &cfg.lag.base, true, !lag_enabled, cx),
                        direction_checkbox("lag-out", t!("netclumsy.window.direction.outbound").into_owned(), &cfg.lag.base, false, !lag_enabled, cx),
                        param_label(t!("netclumsy.effect.lag.delay").into_owned(), !lag_enabled, cx),
                        Input::new(&self.lag_time_input).w(px(64.)).disabled(!lag_enabled).into_any_element(),
                    ],
                    toggle_handler(cfg.lag.base.enabled.clone(), cx),
                )
            })
            .child({
                let cfg = config.clone();
                effect_row(
                    "effect-drop",
                    t!("netclumsy.effect.drop").into_owned().into(),
                    self.triggered_mask & BIT_DROP != 0,
                    drop_enabled,
                    vec![
                        direction_checkbox("drop-in", t!("netclumsy.window.direction.inbound").into_owned(), &cfg.drop.base, true, !drop_enabled, cx),
                        direction_checkbox("drop-out", t!("netclumsy.window.direction.outbound").into_owned(), &cfg.drop.base, false, !drop_enabled, cx),
                        param_label(t!("netclumsy.effect.drop.chance").into_owned(), !drop_enabled, cx),
                        Input::new(&self.drop_chance_input).w(px(64.)).disabled(!drop_enabled).into_any_element(),
                    ],
                    toggle_handler(cfg.drop.base.enabled.clone(), cx),
                )
            })
            .child({
                let cfg = config.clone();
                effect_row(
                    "effect-throttle",
                    t!("netclumsy.effect.throttle").into_owned().into(),
                    self.triggered_mask & BIT_THROTTLE != 0,
                    throttle_enabled,
                    vec![
                        {
                            let cfg = cfg.clone();
                            let disabled = !throttle_enabled;
                            Checkbox::new("throttle-drop")
                                .label(t!("netclumsy.effect.throttle.drop_throttled").into_owned())
                                .checked(cfg.throttle.drop_throttled.load(Ordering::Relaxed))
                                .disabled(disabled)
                                .on_click(cx.listener(move |_, checked, _, cx| {
                                    cfg.throttle.drop_throttled.store(*checked, Ordering::Relaxed);
                                    cx.notify();
                                }))
                                .into_any_element()
                        },
                        param_label(t!("netclumsy.effect.throttle.timeframe").into_owned(), !throttle_enabled, cx),
                        Input::new(&self.throttle_frame_input).w(px(64.)).disabled(!throttle_enabled).into_any_element(),
                        direction_checkbox("throttle-in", t!("netclumsy.window.direction.inbound").into_owned(), &cfg.throttle.base, true, !throttle_enabled, cx),
                        direction_checkbox("throttle-out", t!("netclumsy.window.direction.outbound").into_owned(), &cfg.throttle.base, false, !throttle_enabled, cx),
                        param_label(t!("netclumsy.effect.throttle.chance").into_owned(), !throttle_enabled, cx),
                        Input::new(&self.throttle_chance_input).w(px(64.)).disabled(!throttle_enabled).into_any_element(),
                    ],
                    toggle_handler(cfg.throttle.base.enabled.clone(), cx),
                )
            })
            .child({
                let cfg = config.clone();
                effect_row(
                    "effect-duplicate",
                    t!("netclumsy.effect.duplicate").into_owned().into(),
                    self.triggered_mask & BIT_DUPLICATE != 0,
                    duplicate_enabled,
                    vec![
                        param_label(t!("netclumsy.effect.duplicate.count").into_owned(), !duplicate_enabled, cx),
                        Input::new(&self.duplicate_count_input).w(px(64.)).disabled(!duplicate_enabled).into_any_element(),
                        direction_checkbox("dup-in", t!("netclumsy.window.direction.inbound").into_owned(), &cfg.duplicate.base, true, !duplicate_enabled, cx),
                        direction_checkbox("dup-out", t!("netclumsy.window.direction.outbound").into_owned(), &cfg.duplicate.base, false, !duplicate_enabled, cx),
                        param_label(t!("netclumsy.effect.duplicate.chance").into_owned(), !duplicate_enabled, cx),
                        Input::new(&self.duplicate_chance_input).w(px(64.)).disabled(!duplicate_enabled).into_any_element(),
                    ],
                    toggle_handler(cfg.duplicate.base.enabled.clone(), cx),
                )
            })
            .child({
                let cfg = config.clone();
                effect_row(
                    "effect-ood",
                    t!("netclumsy.effect.ood").into_owned().into(),
                    self.triggered_mask & BIT_OOD != 0,
                    ood_enabled,
                    vec![
                        direction_checkbox("ood-in", t!("netclumsy.window.direction.inbound").into_owned(), &cfg.ood.base, true, !ood_enabled, cx),
                        direction_checkbox("ood-out", t!("netclumsy.window.direction.outbound").into_owned(), &cfg.ood.base, false, !ood_enabled, cx),
                        param_label(t!("netclumsy.effect.ood.chance").into_owned(), !ood_enabled, cx),
                        Input::new(&self.ood_chance_input).w(px(64.)).disabled(!ood_enabled).into_any_element(),
                    ],
                    toggle_handler(cfg.ood.base.enabled.clone(), cx),
                )
            })
            .child({
                let cfg = config.clone();
                effect_row(
                    "effect-tamper",
                    t!("netclumsy.effect.tamper").into_owned().into(),
                    self.triggered_mask & BIT_TAMPER != 0,
                    tamper_enabled,
                    vec![
                        {
                            let cfg = cfg.clone();
                            let disabled = !tamper_enabled;
                            Checkbox::new("tamper-checksum")
                                .label(t!("netclumsy.effect.tamper.redo_checksum").into_owned())
                                .checked(cfg.tamper.redo_checksum.load(Ordering::Relaxed))
                                .disabled(disabled)
                                .on_click(cx.listener(move |_, checked, _, cx| {
                                    cfg.tamper.redo_checksum.store(*checked, Ordering::Relaxed);
                                    cx.notify();
                                }))
                                .into_any_element()
                        },
                        direction_checkbox("tamper-in", t!("netclumsy.window.direction.inbound").into_owned(), &cfg.tamper.base, true, !tamper_enabled, cx),
                        direction_checkbox("tamper-out", t!("netclumsy.window.direction.outbound").into_owned(), &cfg.tamper.base, false, !tamper_enabled, cx),
                        param_label(t!("netclumsy.effect.tamper.chance").into_owned(), !tamper_enabled, cx),
                        Input::new(&self.tamper_chance_input).w(px(64.)).disabled(!tamper_enabled).into_any_element(),
                    ],
                    toggle_handler(cfg.tamper.base.enabled.clone(), cx),
                )
            })
            .child({
                let cfg = config.clone();
                effect_row(
                    "effect-reset",
                    t!("netclumsy.effect.reset").into_owned().into(),
                    self.triggered_mask & BIT_RESET != 0,
                    reset_enabled,
                    vec![
                        {
                            let cfg = cfg.clone();
                            let disabled = !reset_enabled;
                            Button::new("reset-next")
                                .label(t!("netclumsy.effect.reset.now").into_owned())
                                .small()
                                .disabled(disabled)
                                .on_click(cx.listener(move |_, _, _, _| {
                                    // C 原版：仅在效果启用时计数
                                    if cfg.reset.base.enabled.load(Ordering::Relaxed) {
                                        let _ = cfg.reset.set_next_count.fetch_update(
                                            Ordering::SeqCst,
                                            Ordering::SeqCst,
                                            |v| if v < 60000 { Some(v + 1) } else { Some(v) },
                                        );
                                    }
                                }))
                                .into_any_element()
                        },
                        direction_checkbox("reset-in", t!("netclumsy.window.direction.inbound").into_owned(), &cfg.reset.base, true, !reset_enabled, cx),
                        direction_checkbox("reset-out", t!("netclumsy.window.direction.outbound").into_owned(), &cfg.reset.base, false, !reset_enabled, cx),
                        param_label(t!("netclumsy.effect.reset.chance").into_owned(), !reset_enabled, cx),
                        Input::new(&self.reset_chance_input).w(px(64.)).disabled(!reset_enabled).into_any_element(),
                    ],
                    toggle_handler(cfg.reset.base.enabled.clone(), cx),
                )
            })
            .child({
                let cfg = config.clone();
                effect_row(
                    "effect-bandwidth",
                    t!("netclumsy.effect.bandwidth").into_owned().into(),
                    self.triggered_mask & BIT_BANDWIDTH != 0,
                    bandwidth_enabled,
                    vec![
                        direction_checkbox("bandwidth-in", t!("netclumsy.window.direction.inbound").into_owned(), &cfg.bandwidth.base, true, !bandwidth_enabled, cx),
                        direction_checkbox("bandwidth-out", t!("netclumsy.window.direction.outbound").into_owned(), &cfg.bandwidth.base, false, !bandwidth_enabled, cx),
                        param_label(t!("netclumsy.effect.bandwidth.limit").into_owned(), !bandwidth_enabled, cx),
                        Input::new(&self.bandwidth_limit_input).w(px(64.)).disabled(!bandwidth_enabled).into_any_element(),
                    ],
                    toggle_handler(cfg.bandwidth.base.enabled.clone(), cx),
                )
            })
            // 状态栏
            .child(
                h_flex()
                    .items_center()
                    .gap_2()
                    .child(self.status_text.clone())
                    .child(div().flex_1())
                    .child(format!(
                        "{}: {} {}",
                        t!("netclumsy.window.stats.rate"),
                        self.packet_rate,
                        t!("netclumsy.window.stats.rate.unit")
                    ))
                    .child(format!("{}: {}", t!("netclumsy.status.matched"), self.matched_count)),
            )
    }
}

/// 方向复选框（inbound / outbound 共用构建逻辑）
fn direction_checkbox(
    id: &'static str,
    label: impl Into<Text>,
    base: &crate::engine::BaseParams,
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
        .label(label)
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
    enabled: std::sync::Arc<std::sync::atomic::AtomicBool>,
    cx: &mut Context<MainWindow>,
) -> impl Fn(&bool, &mut Window, &mut App) + 'static {
    cx.listener(move |_, checked, _, cx| {
        enabled.store(*checked, Ordering::Relaxed);
        cx.notify();
    })
}
