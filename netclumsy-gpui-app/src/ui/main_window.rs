//! 主窗口：状态持有 + 订阅 + 引擎生命周期 + 200ms 轮询 + 区块组装。
//!
//! 渲染全部委托给按设计稿区块拆分的模块：
//! title_bar / filter_bar / effect_panel / stats_bar，本文件只做组合。

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use gpui::*;
use gpui_component::button::{Button, ButtonVariants};
use gpui_component::input::{InputEvent, InputState};
use gpui_component::select::{SearchableVec, SelectEvent, SelectState};
use gpui_component::tab::{Tab, TabBar};
use gpui_component::{h_flex, v_flex, ActiveTheme as _, IconName, IndexPath, Sizable as _};
use rust_i18n::t;

use crate::args::ParsedArgs;
use crate::elevate::is_run_as_admin;
use crate::engine::{
    Engine, EngineConfig, EngineMode, BIT_BANDWIDTH, BIT_DROP, BIT_DUPLICATE, BIT_LAG, BIT_OOD,
    BIT_RESET, BIT_TAMPER, BIT_THROTTLE,
};
use crate::presets::Preset;
use crate::ui::inputs::{self, EffectInputs};
use crate::ui::stats_bar::RateHistory;
use crate::ui::{effect_panel, filter_bar, stats_bar, theme, title_bar};

/// 指示灯轮询周期（与 C 原版 ICON_UPDATE_MS 一致）
const POLL_INTERVAL_MS: u64 = 200;

pub struct MainWindow {
    pub(crate) config: Arc<EngineConfig>,
    pub(crate) engine: Option<Engine>,
    pub(crate) presets: Vec<Preset>,
    pub(crate) filter_input: Entity<InputState>,
    pub(crate) preset_select: Entity<SelectState<SearchableVec<SharedString>>>,
    pub(crate) lag_time_input: Entity<InputState>,
    pub(crate) drop_chance_input: Entity<InputState>,
    pub(crate) throttle_chance_input: Entity<InputState>,
    pub(crate) throttle_frame_input: Entity<InputState>,
    pub(crate) duplicate_count_input: Entity<InputState>,
    pub(crate) duplicate_chance_input: Entity<InputState>,
    pub(crate) ood_chance_input: Entity<InputState>,
    pub(crate) tamper_chance_input: Entity<InputState>,
    pub(crate) reset_chance_input: Entity<InputState>,
    pub(crate) bandwidth_limit_input: Entity<InputState>,
    pub(crate) matched_count: u64,
    pub(crate) packet_rate: u32,
    pub(crate) send_state: u8,
    pub(crate) triggered_mask: u32,
    pub(crate) status_text: SharedString,
    pub(crate) active_tab: usize,
    pub(crate) is_admin: bool,
    pub(crate) engine_failed: bool,
    pub(crate) rate_history: RateHistory,
    _subscriptions: Vec<Subscription>,
}

impl MainWindow {
    pub fn new(
        window: &mut Window,
        cx: &mut Context<Self>,
        config: Arc<EngineConfig>,
        presets: Vec<Preset>,
        parsed: ParsedArgs,
    ) -> Self {
        let default_filter = presets.first().map_or(String::new(), |p| p.filter.clone());
        let filter_input = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder(t!("netclumsy.window.filter.placeholder"))
                .default_value(default_filter)
        });

        let preset_items: Vec<SharedString> =
            presets.iter().map(|p| p.name.clone().into()).collect();
        let preset_select = cx.new(|cx| {
            SelectState::new(
                SearchableVec::new(preset_items),
                Some(IndexPath::default()),
                window,
                cx,
            )
            .searchable(true)
        });

        let lag_time_input = inputs::make_input(window, cx, "50");
        let drop_chance_input = inputs::make_input(window, cx, "10.0");
        let throttle_chance_input = inputs::make_input(window, cx, "10.0");
        let throttle_frame_input = inputs::make_input(window, cx, "30");
        let duplicate_count_input = inputs::make_input(window, cx, "2");
        let duplicate_chance_input = inputs::make_input(window, cx, "10.0");
        let ood_chance_input = inputs::make_input(window, cx, "10.0");
        let tamper_chance_input = inputs::make_input(window, cx, "10.0");
        let reset_chance_input = inputs::make_input(window, cx, "0");
        let bandwidth_limit_input = inputs::make_input(window, cx, "10");

        let mut subscriptions = Vec::new();

        subscriptions.push(cx.subscribe_in(
            &preset_select,
            window,
            |this: &mut Self, _, event, window, cx| {
                if let SelectEvent::Confirm(Some(value)) = event {
                    if let Some(preset) = this.presets.iter().find(|p| p.name == value.as_ref()) {
                        let expr = preset.filter.clone();
                        this.filter_input
                            .update(cx, |s, cx| s.set_value(expr, window, cx));
                    }
                }
            },
        ));

        // 参数输入订阅：解析 → 限幅 → 写入共享配置（空输入按 C 原版存下限值）
        // $target 在调用点求值（config 字段的 Arc 克隆），避开宏卫生性问题
        macro_rules! subscribe_input {
            ($input:expr, $sync:ident, $target:expr $(, $bounds:expr)*) => {{
                let target = $target;
                subscriptions.push(cx.subscribe_in(
                    &$input,
                    window,
                    move |_, state, event: &InputEvent, window, cx| {
                        if let InputEvent::Change = event {
                            let v = state.read(cx).value();
                            inputs::$sync(v.as_ref() $(, $bounds)*, &target, state, window, cx);
                        }
                    },
                ));
            }};
        }
        subscribe_input!(lag_time_input, sync_int, config.lag.time.clone(), 0, 15000);
        subscribe_input!(drop_chance_input, sync_chance, config.drop.chance.clone());
        subscribe_input!(throttle_chance_input, sync_chance, config.throttle.chance.clone());
        subscribe_input!(throttle_frame_input, sync_int, config.throttle.frame.clone(), 0, 1000);
        subscribe_input!(duplicate_count_input, sync_int, config.duplicate.count.clone(), 2, 50);
        subscribe_input!(duplicate_chance_input, sync_chance, config.duplicate.chance.clone());
        subscribe_input!(ood_chance_input, sync_chance, config.ood.chance.clone());
        subscribe_input!(tamper_chance_input, sync_chance, config.tamper.chance.clone());
        subscribe_input!(reset_chance_input, sync_chance, config.reset.chance.clone());
        subscribe_input!(bandwidth_limit_input, sync_int, config.bandwidth.limit.clone(), 0, 99999);

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

        // —— 应用命令行参数（原版 parseArgs + setFromParameter 行为）——
        let effect_inputs = EffectInputs {
            lag_time: &lag_time_input,
            drop_chance: &drop_chance_input,
            throttle_chance: &throttle_chance_input,
            throttle_frame: &throttle_frame_input,
            duplicate_count: &duplicate_count_input,
            duplicate_chance: &duplicate_chance_input,
            ood_chance: &ood_chance_input,
            tamper_chance: &tamper_chance_input,
            reset_chance: &reset_chance_input,
            bandwidth_limit: &bandwidth_limit_input,
        };
        if let Some(f) = &parsed.filter {
            filter_input.update(cx, |s, cx| s.set_value(f.clone(), window, cx));
        }
        inputs::apply_cli_args(&config, &parsed, &effect_inputs, window, cx);

        let mut this = Self {
            config,
            engine: None,
            presets,
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
            active_tab: 0,
            is_admin: is_run_as_admin(),
            engine_failed: false,
            rate_history: RateHistory::new(),
            _subscriptions: subscriptions,
        };

        // --timeout：N 秒后自动退出（原版 uiTimeoutCb：秒 → 定时器 → 关闭程序）
        if let Some(secs) = parsed.timeout_secs {
            cx.spawn(move |_: WeakEntity<Self>, cx: &mut AsyncApp| {
                let cx = cx.clone();
                async move {
                    let cx = cx;
                    cx.background_executor()
                        .timer(Duration::from_secs(secs))
                        .await;
                    let _ = cx.update(|cx| cx.quit());
                }
            })
            .detach();
        }

        // 带参数启动 → 自动开始过滤（原版 parameterized 行为）；--capture on → 嗅探模式
        if parsed.has_any {
            let mode = if parsed.capture == Some(true) {
                EngineMode::Capture
            } else {
                EngineMode::Start
            };
            this.start_engine(mode, cx);
        }

        this
    }

    pub(crate) fn start_engine(&mut self, mode: EngineMode, cx: &mut Context<Self>) {
        let filter = self.filter_input.read(cx).value().to_string();
        match Engine::new(&filter, mode, self.config.clone()) {
            Ok(engine) => {
                self.engine = Some(engine);
                self.engine_failed = false;
                self.status_text = t!("netclumsy.status.started").into_owned().into();
                self.matched_count = 0;
                self.packet_rate = 0;
                self.send_state = 0;
                self.triggered_mask = 0;
                self.rate_history = RateHistory::new();
            }
            Err(e) => {
                self.engine_failed = true;
                self.status_text = t!(
                    "netclumsy.status.start_failed.format",
                    error = e.to_string()
                )
                .into_owned()
                .into();
            }
        }
        cx.notify();
    }

    pub(crate) fn stop_engine(&mut self, cx: &mut Context<Self>) {
        if let Some(mut engine) = self.engine.take() {
            engine.stop();
        }
        // 修复：clock 线程收尾时也会归零 rate_pps，但如果它在到达收尾代码前就异常退出，
        // 原子里留着最后一个非 0 速率，下一次轮询会把它读回界面（速率条永久卡住）。
        self.config.rate_pps.store(0, Ordering::Relaxed);
        self.engine_failed = false;
        self.status_text = t!("netclumsy.status.stopped").into_owned().into();
        self.packet_rate = 0;
        self.send_state = 0;
        self.triggered_mask = 0;
        cx.notify();
    }

    fn poll_status(&mut self, cx: &mut Context<Self>) {
        // 修复：引擎线程自行退出（recv 连续错误放弃后自动收尾）时，原先只闪一次红色
        // 发送灯，界面仍停留在「运行中」。检测到 clock 线程收尾完成就接管：join 已退出
        // 的线程、清零读数，状态行升级为与 start_failed 同级的错误提示。
        // 用户主动停止时引擎已被 take 走，这里天然跳过。
        if self.engine.is_some() && self.config.engine_exited.load(Ordering::Relaxed) {
            if let Some(mut engine) = self.engine.take() {
                engine.stop();
            }
            self.config.rate_pps.store(0, Ordering::Relaxed);
            self.engine_failed = true;
            self.status_text = t!("netclumsy.status.engine_exited").into_owned().into();
            self.packet_rate = 0;
            self.send_state = 0;
            self.triggered_mask = 0;
            cx.notify();
            return;
        }
        let matched_count = self.config.matched_count.load(Ordering::Relaxed);
        let packet_rate = self.config.rate_pps.load(Ordering::Relaxed);
        let send_state = self.config.send_state.swap(0, Ordering::SeqCst);
        let triggered_mask = self.config.triggered_mask.swap(0, Ordering::SeqCst);
        self.rate_history.push(packet_rate);

        // 修复：原先无条件 cx.notify()，引擎未启动时四个读数恒定不变，仍以 5Hz
        // 重绘整棵 UI 树（空闲也白耗 CPU/GPU）。仅在读数确实变化时通知重绘。
        // 注意还要带上「曲线仍在滚出旧数据」这一条件：速率归零后，30 秒 AreaChart
        // 只有靠重绘才会把最后的非零柱向左滚出窗口，否则图形会冻结在半空。
        let changed = matched_count != self.matched_count
            || packet_rate != self.packet_rate
            || send_state != self.send_state
            || triggered_mask != self.triggered_mask
            || !self.rate_history.is_flat_zero();

        self.matched_count = matched_count;
        self.packet_rate = packet_rate;
        self.send_state = send_state;
        self.triggered_mask = triggered_mask;

        if changed {
            cx.notify();
        }
    }

    /// 劣化页：FilterBar + 效果列表（高度不足时内部滚动）
    fn render_degrade_page(&mut self, cx: &mut Context<Self>) -> impl IntoElement {
        let mask = self.triggered_mask;
        v_flex()
            .flex_1()
            .overflow_hidden()
            .child(filter_bar::render(self, cx))
            .child(
                div()
                    .id("effect-list-scroll")
                    .flex_1()
                    .overflow_y_scroll()
                    .child(
                        v_flex()
                            .child(effect_panel::lag_row(&self.config, &self.lag_time_input, mask & BIT_LAG != 0, cx))
                            .child(effect_panel::drop_row(&self.config, &self.drop_chance_input, mask & BIT_DROP != 0, cx))
                            .child(effect_panel::throttle_row(&self.config, &self.throttle_frame_input, &self.throttle_chance_input, mask & BIT_THROTTLE != 0, cx))
                            .child(effect_panel::duplicate_row(&self.config, &self.duplicate_count_input, &self.duplicate_chance_input, mask & BIT_DUPLICATE != 0, cx))
                            .child(effect_panel::ood_row(&self.config, &self.ood_chance_input, mask & BIT_OOD != 0, cx))
                            .child(effect_panel::tamper_row(&self.config, &self.tamper_chance_input, mask & BIT_TAMPER != 0, cx))
                            .child(effect_panel::reset_row(&self.config, &self.reset_chance_input, mask & BIT_RESET != 0, cx))
                            .child(effect_panel::bandwidth_row(&self.config, &self.bandwidth_limit_input, mask & BIT_BANDWIDTH != 0, cx)),
                    ),
            )
    }

    fn render_about_page(&self, cx: &mut Context<Self>) -> impl IntoElement {
        v_flex()
            .px_4()
            .flex_1()
            .items_center()
            .justify_center()
            .gap_2()
            .child(
                div()
                    .text_lg()
                    .child(t!("netclumsy.about.app_name").into_owned()),
            )
            .child(
                div()
                    .text_sm()
                    .text_color(cx.theme().muted_foreground)
                    .child(t!("netclumsy.about.description").into_owned()),
            )
    }
}

impl Drop for MainWindow {
    fn drop(&mut self) {
        if let Some(mut engine) = self.engine.take() {
            engine.stop();
        }
    }
}

impl Render for MainWindow {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        v_flex()
            .size_full()
            .bg(cx.theme().background)
            // ① 自定义标题栏（品牌区 + 运行 Badge + 主题切换 + 窗口控制）
            .child(title_bar::render(self, cx))
            // ② 分段 Tabs + 右侧主题切换
            .child(
                h_flex()
                    .px_4()
                    // 页签改用默认字号（更大更醒目），这里把纵向 padding 收一档，
                    // 让整条高度仍贴近 DESIGN.md §3.2 的 36px 预算
                    .py_1()
                    .items_center()
                    .gap_2()
                    .border_b_1()
                    .border_color(cx.theme().border)
                    .child(
                        TabBar::new("main-tabs")
                            .segmented()
                            .selected_index(self.active_tab)
                            .on_click(cx.listener(|this, index: &usize, _, cx| {
                                this.active_tab = *index;
                                cx.notify();
                            }))
                            .child(Tab::new().label(t!("netclumsy.tab.degrade").into_owned()))
                            .child(Tab::new().label(t!("netclumsy.tab.about").into_owned())),
                    )
                    .child(div().flex_1())
                    // 主题切换（标题栏是 OS 级 Drag 区，按钮放这里才能收到点击）
                    .child(
                        Button::new("btn-theme-toggle")
                            .ghost()
                            .small()
                            .icon(if cx.theme().is_dark() {
                                IconName::Sun
                            } else {
                                IconName::Moon
                            })
                            .tooltip(t!("netclumsy.window.theme.toggle").into_owned())
                            .on_click(cx.listener(|_, _, _, cx| {
                                theme::toggle(cx);
                            })),
                    ),
            )
            // ③ 页面内容（按 active_tab 分发）
            .child(match self.active_tab {
                0 => self.render_degrade_page(cx).into_any_element(),
                _ => self.render_about_page(cx).into_any_element(),
            })
            // ④ 统计栏（所有页面共享）
            .child(stats_bar::render(self, cx))
    }
}
