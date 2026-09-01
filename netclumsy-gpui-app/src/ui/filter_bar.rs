//! 过滤器与控制区（design/DESIGN.md §3.3，两行结构）。
//!
//! 第一行：过滤器标签 + 只读输入框（含复制按钮；运行中追加「引擎运行中」锁定标签）。
//! 第二行：预设 Select + 发送状态灯（带 tooltip）+ 捕获/启动/停止按钮
//! （按钮 tooltip 自动展示快捷键）+ 说明文字 + 管理员状态章（Tag 组件）。

use gpui::{div, AnyElement, App, Context, IntoElement, ParentElement, SharedString, Styled};
use gpui::prelude::FluentBuilder as _;
use gpui_component::button::{Button, ButtonVariants};
use gpui_component::clipboard::Clipboard;
use gpui_component::input::Input;
use gpui_component::select::Select;
use gpui_component::tag::Tag;
use gpui_component::{h_flex, v_flex, ActiveTheme as _, Disableable, IconName, Sizable as _};
use rust_i18n::t;

use crate::engine::{EngineMode, SEND_STATUS_FAIL, SEND_STATUS_SEND};
use crate::ui::effect_panel::status_dot_color;
use crate::ui::main_window::{CaptureFilter, MainWindow, StartFilter, StopFilter};

/// 区块标签（12px muted）
fn bar_label(text: impl Into<gpui::SharedString>, cx: &App) -> AnyElement {
    div()
        .text_xs()
        .text_color(cx.theme().muted_foreground)
        .child(text.into())
        .into_any_element()
}

/// 状态章（Tag 组件）：图标 + 文字。语义变体只表达真实状态，
/// 「管理员已就绪」用中性 secondary——就绪不是警告，warning 留给真实告警
/// （官方设计指南：大多数 Badge 保持 neutral）。
fn status_tag(icon: IconName, text: String, tag: Tag) -> AnyElement {
    tag.small()
        .child(icon)
        .child(text)
        .into_any_element()
}

pub fn render(view: &MainWindow, cx: &mut Context<MainWindow>) -> AnyElement {
    let running = view.engine.is_some();
    let theme = cx.theme();

    // 发送状态灯（三态，对齐 C 原版 sendState）；颜色之外附 tooltip 文字备胎
    let send_tip: SharedString = match view.send_state {
        SEND_STATUS_SEND => t!("netclumsy.send.ok").into_owned().into(),
        SEND_STATUS_FAIL => t!("netclumsy.send.fail").into_owned().into(),
        _ => t!("netclumsy.send.idle").into_owned().into(),
    };
    let send_dot = match view.send_state {
        SEND_STATUS_SEND => {
            status_dot_color("send-dot".into(), theme.success, true, send_tip)
        }
        SEND_STATUS_FAIL => {
            status_dot_color("send-dot".into(), theme.danger, true, send_tip)
        }
        _ => status_dot_color("send-dot".into(), theme.muted_foreground, false, send_tip),
    };

    // 管理员 / 引擎状态章
    let admin_tag = if !view.is_admin {
        status_tag(
            IconName::CircleX,
            t!("netclumsy.window.admin.not_admin").into_owned(),
            Tag::danger(),
        )
    } else if view.engine_failed {
        status_tag(
            IconName::CircleX,
            t!("netclumsy.window.admin.failed").into_owned(),
            Tag::danger(),
        )
    } else if running {
        status_tag(
            IconName::CircleCheck,
            t!("netclumsy.window.admin.badge").into_owned(),
            Tag::success(),
        )
    } else {
        status_tag(
            IconName::CircleCheck,
            t!("netclumsy.window.admin.badge").into_owned(),
            Tag::secondary(),
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
                    div().w_56().child(
                        Select::new(&view.preset_select)
                            .small()
                            .disabled(running),
                    ),
                )
                .child(send_dot)
                .child(bar_label(t!("netclumsy.window.send.label").into_owned(), cx))
                // 捕获（嗅探）：outline 变体不随状态切换，运行中仅禁用，
                // 避免 disabled 的主按钮成为视觉噪音
                .child(
                    Button::new("btn-capture")
                        .outline()
                        .icon(IconName::Eye)
                        .label(t!("netclumsy.window.capture").into_owned())
                        .disabled(running)
                        .tooltip_with_action(
                            t!("netclumsy.window.capture.tip").into_owned(),
                            &CaptureFilter,
                            None,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.start_engine(EngineMode::Capture, cx)
                        })),
                )
                .child(if running {
                    Button::new("btn-stop")
                        .danger()
                        .icon(IconName::Close)
                        .label(t!("netclumsy.window.stop").into_owned())
                        .tooltip_with_action(
                            t!("netclumsy.window.stop.tip").into_owned(),
                            &StopFilter,
                            None,
                        )
                        .on_click(cx.listener(|this, _, _, cx| this.stop_engine(cx)))
                        .into_any_element()
                } else {
                    Button::new("btn-start")
                        .primary()
                        .icon(IconName::Play)
                        .label(t!("netclumsy.window.start").into_owned())
                        .tooltip_with_action(
                            t!("netclumsy.window.start.tip").into_owned(),
                            &StartFilter,
                            None,
                        )
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
                .child(admin_tag),
        )
        .into_any_element()
}
