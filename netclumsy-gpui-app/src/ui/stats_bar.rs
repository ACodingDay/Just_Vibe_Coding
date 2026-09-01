//! 统计栏（design/DESIGN.md §3.5，5.25rem 三段式）。
//!
//! 左：状态文案 + 过滤条件摘要；中：224×36 速率曲线（AreaChart，30 秒环形缓冲）；
//! 右：包速率 / 匹配包两个大读数。
//! 曲线历史由 UI 侧 200ms 轮询 push（引擎只暴露当前 rate_pps）。

use std::collections::VecDeque;

use gpui::{
    div, linear_color_stop, linear_gradient, px, rems, AnyElement, App, FontWeight, IntoElement,
    ParentElement, SharedString, Styled,
};
use gpui_component::chart::AreaChart;
use gpui_component::{h_flex, v_flex, ActiveTheme as _};
use rust_i18n::t;

use crate::ui::main_window::MainWindow;

/// 轮询周期 200ms × 150 点 = 30 秒窗口
const HISTORY_CAPACITY: usize = 150;

/// 包速率历史（UI 侧环形缓冲）
pub struct RateHistory {
    samples: VecDeque<f64>,
}

impl RateHistory {
    pub fn new() -> Self {
        Self {
            samples: VecDeque::with_capacity(HISTORY_CAPACITY),
        }
    }

    pub fn push(&mut self, rate_pps: u32) {
        if self.samples.len() >= HISTORY_CAPACITY {
            self.samples.pop_front();
        }
        self.samples.push_back(rate_pps as f64);
    }

    /// 缓冲是否已全为 0：曲线里最后一根非零柱已滚出窗口，可停止重绘
    pub fn is_flat_zero(&self) -> bool {
        self.samples.iter().all(|v| *v == 0.0)
    }

    /// (序号, 速率) 序列，供 AreaChart 消费
    fn points(&self) -> Vec<(usize, f64)> {
        self.samples
            .iter()
            .enumerate()
            .map(|(i, v)| (i, *v))
            .collect()
    }
}

/// 千分位分组（设计稿读数 12,958 样式）
fn format_thousands(v: u64) -> String {
    let s = v.to_string();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}

/// 大读数块：标签（12px muted）+ 数值（text_lg = 18px / 600 等宽）+ 单位
fn readout(label: SharedString, value: String, unit: SharedString, cx: &App) -> AnyElement {
    v_flex()
        .gap_0p5()
        .justify_center()
        .child(
            div()
                .text_xs()
                .text_color(cx.theme().muted_foreground)
                .child(label),
        )
        .child(
            h_flex()
                .items_baseline()
                .gap_1()
                .child(
                    div()
                        .text_lg()
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(value),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(cx.theme().muted_foreground)
                        .child(unit),
                ),
        )
        .into_any_element()
}

pub fn render(view: &MainWindow, cx: &App) -> AnyElement {
    let theme = cx.theme();
    let running = view.engine.is_some();

    // 状态文案着色：出错 danger / 运行中 success / 其他默认前景
    let status_color = if view.engine_failed {
        theme.danger
    } else if running {
        theme.success
    } else {
        theme.foreground
    };

    let filter_summary = view.filter_input.read(cx).value();

    // 速率曲线（数据不足 2 点时只渲染空容器，避免 ScalePoint 空域）
    let chart_color = theme.chart_1;
    let sparkline: AnyElement = if view.rate_history.samples.len() >= 2 {
        div()
            .absolute()
            .inset_0()
            .child(
                AreaChart::new(view.rate_history.points())
                    .x(|d| d.0.to_string())
                    .y(|d| d.1)
                    .stroke(chart_color)
                    .fill(linear_gradient(
                        180.,
                        linear_color_stop(chart_color.opacity(0.35), 0.),
                        linear_color_stop(chart_color.opacity(0.02), 1.),
                    ))
                    .natural()
                    .x_axis(false)
                    .grid(false),
            )
            .into_any_element()
    } else {
        div().absolute().inset_0().into_any_element()
    };

    h_flex()
        .h(rems(5.25))
        .flex_shrink_0()
        .px_4()
        .gap_4()
        .items_center()
        .bg(theme.status_bar)
        .border_t_1()
        .border_color(theme.border)
        // 左：状态 + 过滤条件摘要
        .child(
            v_flex()
                .w_64()
                .flex_shrink_0()
                .gap_1()
                .justify_center()
                .child(
                    h_flex()
                        .items_center()
                        .gap_2()
                        .child(div().size_2().rounded_full().bg(status_color))
                        .child(
                            div()
                                .text_sm()
                                .text_color(status_color)
                                .child(view.status_text.clone()),
                        ),
                )
                .child(
                    div()
                        .text_xs()
                        .text_color(theme.muted_foreground)
                        .text_ellipsis()
                        .overflow_hidden()
                        .whitespace_nowrap()
                        .child(filter_summary),
                ),
        )
        .child(div().flex_1())
        // 中：速率曲线（224×36，左上窗口标注 + 右上当前值锚点）
        .child(
            div()
                .w_56()
                .h_9()
                .flex_shrink_0()
                .relative()
                .child(sparkline)
                .child(
                    div()
                        .absolute()
                        .top_0()
                        .left_0()
                        .text_xs()
                        .text_color(theme.muted_foreground)
                        .child(t!("netclumsy.stats.window_hint").into_owned()),
                )
                .child(
                    div()
                        .absolute()
                        .top_0()
                        .right_0()
                        .text_xs()
                        .text_color(chart_color)
                        .child(view.packet_rate.to_string()),
                ),
        )
        // 右：两个大读数
        .child(readout(
            t!("netclumsy.stats.rate.label").into_owned().into(),
            format_thousands(view.packet_rate as u64),
            t!("netclumsy.stats.rate.unit").into_owned().into(),
            cx,
        ))
        .child(div().w(px(1.)).h_9().bg(theme.border))
        .child(readout(
            t!("netclumsy.stats.matched.label").into_owned().into(),
            format_thousands(view.matched_count),
            "".into(),
            cx,
        ))
        .into_any_element()
}
