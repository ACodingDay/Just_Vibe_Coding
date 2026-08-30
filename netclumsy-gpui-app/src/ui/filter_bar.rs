//! 过滤器与控制区（design/DESIGN.md §3.3，两行结构）。
//!
//! 第一行：过滤器标签 + 只读输入框（含复制按钮；运行中追加「引擎运行中」锁定标签）。
//! 第二行：预设 Select + 发送状态灯 + 捕获/启动/停止按钮 + 说明文字 + 管理员徽标。

use gpui::{div, px, AnyElement, App, Context, Hsla, IntoElement, ParentElement, Styled};
use gpui::prelude::FluentBuilder as _;
use gpui_component::button::{Button, ButtonVariants};
use gpui_component::clipboard::Clipboard;
use gpui_component::input::Input;
use gpui_component::select::Select;
use gpui_component::{h_flex, v_flex, ActiveTheme as _, Disableable, IconName, Sizable as _};
use rust_i18n::t;

use crate::engine::{EngineMode, SEND_STATUS_FAIL, SEND_STATUS_SEND};
use crate::ui::effect_panel::status_dot_color;
use crate::ui::main_window::MainWindow;

/// 区块标签（12px muted）
fn bar_label(text: impl Into<gpui::SharedString>, cx: &App) -> AnyElement {
    div()
        .text_xs()
        .text_color(cx.theme().muted_foreground)
        .child(text.into())
        .into_any_element()
}

/// 语义色徽标（12% 浅底 + 同色描边 + 同色文字/图标）
fn badge_chip(icon: IconName, text: String, color: Hsla, _cx: &App) -> AnyElement {
    h_flex()
        .items_center()
        .gap_1()
        .px_2()
        .py_0p5()
        .rounded_md()
        .bg(color.opacity(0.12))
        .border_1()
        .border_color(color.opacity(0.6))
        .text_xs()
        .text_color(color)
        .child(icon)
        .child(text)
        .into_any_element()
}

pub fn render(view: &MainWindow, cx: &mut Context<MainWindow>) -> AnyElement {
    let running = view.engine.is_some();
    let theme = cx.theme();

    // 发送状态灯（三态，对齐 C 原版 sendState）
    let send_dot = match view.send_state {
        SEND_STATUS_SEND => status_dot_color(theme.success, true),
        SEND_STATUS_FAIL => status_dot_color(theme.danger, true),
        _ => status_dot_color(theme.muted_foreground, false),
    };

    // 管理员 / 引擎状态徽标
    let admin_badge = if !view.is_admin {
        badge_chip(
            IconName::CircleX,
            t!("netclumsy.window.admin.not_admin").into_owned(),
            theme.danger,
            cx,
        )
    } else if view.engine_failed {
        badge_chip(
            IconName::CircleX,
            t!("netclumsy.window.admin.failed").into_owned(),
            theme.danger,
            cx,
        )
    } else if running {
        badge_chip(
            IconName::CircleCheck,
            t!("netclumsy.window.admin.badge").into_owned(),
            theme.success,
            cx,
        )
    } else {
        badge_chip(
            IconName::CircleCheck,
            t!("netclumsy.window.admin.badge").into_owned(),
            theme.warning,
            cx,
        )
    };

    v_flex()
        .px_4()
        .py_2()
        .gap_2()
        .border_b_1()
        .border_color(theme.border)
        // 第一行：过滤器
        .child(
            h_flex()
                .items_center()
                .gap_2()
                .child(bar_label(t!("netclumsy.window.filter.label").into_owned(), cx))
                .child(
                    // 修复：原先恒为 readonly(true)，过滤框只能从预设下拉里选，
                    // 自定义过滤表达式根本输不进去（start_engine 取的正是这个值）。
                    // 只在引擎运行中锁定，与下方的「引擎运行中」提示和预设 Select
                    // 的 disabled(running) 保持同一套语义。
                    Input::new(&view.filter_input)
                        .readonly(running)
                        .suffix(
                            Clipboard::new("filter-clipboard").value_fn({
                                let state = view.filter_input.clone();
                                move |_, cx| state.read(cx).value()
                            }),
                        ),
                )
                .when(running, |this| {
                    this.child(
                        div()
                            .flex_shrink_0()
                            .text_xs()
                            .text_color(theme.warning)
                            .child(t!("netclumsy.window.filter.locked").into_owned()),
                    )
                }),
        )
        // 第二行：预设 + 控制
        .child(
            h_flex()
                .items_center()
                .gap_2()
                .child(bar_label(t!("netclumsy.window.presets").into_owned(), cx))
                .child(
                    div().w(px(230.)).child(
                        Select::new(&view.preset_select)
                            .small()
                            .disabled(running),
                    ),
                )
                .child(send_dot)
                .child(bar_label(t!("netclumsy.window.send.label").into_owned(), cx))
                .child(if running {
                    Button::new("btn-capture")
                        .primary()
                        .icon(IconName::Eye)
                        .label(t!("netclumsy.window.capture").into_owned())
                        .disabled(true)
                        .into_any_element()
                } else {
                    Button::new("btn-capture")
                        .outline()
                        .icon(IconName::Play)
                        .label(t!("netclumsy.window.capture").into_owned())
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.start_engine(EngineMode::Capture, cx)
                        }))
                        .into_any_element()
                })
                .child(if running {
                    Button::new("btn-stop")
                        .danger()
                        .icon(IconName::Close)
                        .label(t!("netclumsy.window.stop").into_owned())
                        .on_click(cx.listener(|this, _, _, cx| this.stop_engine(cx)))
                        .into_any_element()
                } else {
                    Button::new("btn-start")
                        .primary()
                        .icon(IconName::Play)
                        .label(t!("netclumsy.window.start").into_owned())
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.start_engine(EngineMode::Start, cx)
                        }))
                        .into_any_element()
                })
                .child(
                    div()
                        .text_xs()
                        .text_color(theme.muted_foreground)
                        .child(t!("netclumsy.window.control.note").into_owned()),
                )
                .child(div().flex_1())
                .child(admin_badge),
        )
        .into_any_element()
}
