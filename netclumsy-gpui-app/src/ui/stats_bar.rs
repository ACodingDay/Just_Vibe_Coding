//! 统计栏（design/DESIGN.md §3.5 精简版）。
//!
//! 只保留统计本体：速率曲线（AreaChart，30 秒环形缓冲）+ 包速率 / 匹配包
//! 两个大读数。原先左侧的状态文案与过滤条件摘要已移除——过滤条件就在上方
//! 输入框里可见，引擎状态由过滤区的管理员章与错误通知承载。
//! 曲线历史由 UI 侧 200ms 轮询 push（引擎只暴露当前 rate_pps）。

use std::collections::VecDeque;

use gpui_kit::{
    div, linear_color_stop, linear_gradient, px, rems, AnyElement, App, FontWeight, IntoElement,
    ParentElement, SharedString, Styled,
};
use gpui_kit::component::chart::AreaChart;
use gpui_kit::component::{h_flex, v_flex, ActiveTheme as _};
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
                    // 读数用主题等宽字体：数字逐秒变化，比例字体宽度不一，
                    // 右侧两个读数会持续左右抖动（design/DESIGN.md §五）
                    div()
                        .text_lg()
                        .font_family(cx.theme().mono_font_family.clone())
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
        // 速率曲线（占满剩余宽度）
        .child(div().flex_1().h_9().relative().child(sparkline))
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
