//! 自定义标题栏（design/DESIGN.md §3.1）。
//!
//! 左侧：logo（圆角方形 + network 图标）+ 英文名 + 运行中 Badge。
//! 窗口控制按钮（最小化/最大化/关闭）由 TitleBar 组件在 Windows 下自动渲染，
//! 拖拽移动由组件内置处理。
//!
//! 注意：标题栏内容区整体是 OS 级 Drag 控制区，内部按钮收不到点击
//! （见 .workbuddy/skills/gpui-component-ui/SKILL.md），因此可交互控件
//! （如主题切换按钮）不得放在 TitleBar 内。

use gpui::{div, px, svg, AnyElement, App, Context, FontWeight, IntoElement, ParentElement, Styled};
use gpui::prelude::FluentBuilder as _;
use gpui_component::{h_flex, ActiveTheme as _, TitleBar};
use rust_i18n::t;

use crate::ui::main_window::MainWindow;

/// 品牌 logo：主色圆角方块 + 内嵌 network 图标
fn logo(cx: &App) -> AnyElement {
    div()
        .size(px(20.))
        .rounded_md()
        .bg(cx.theme().primary)
        .flex()
        .items_center()
        .justify_center()
        .child(
            svg()
                .path("icons/network.svg")
                .size(px(13.))
                .text_color(cx.theme().primary_foreground),
        )
        .into_any_element()
}

pub fn render(view: &MainWindow, cx: &mut Context<MainWindow>) -> TitleBar {
    let running = view.engine.is_some();

    TitleBar::new()
        // 左侧：logo + 英文名 + 运行 Badge
        .child(
            h_flex()
                .items_center()
                .gap_2()
                .child(logo(cx))
                .child(
                    div()
                        .text_size(px(13.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(t!("netclumsy.app.title").into_owned()),
                )
                .when(running, |this| {
                    this.child(
                        div()
                            .ml_2()
                            .px_2()
                            .py_0p5()
                            .rounded_md()
                            .text_xs()
                            .text_color(cx.theme().success)
                            .bg(cx.theme().success.opacity(0.12))
                            .border_1()
                            .border_color(cx.theme().success.opacity(0.6))
                            .child(t!("netclumsy.status.running").into_owned()),
                    )
                }),
        )
}
