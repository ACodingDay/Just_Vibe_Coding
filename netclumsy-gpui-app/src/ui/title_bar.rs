//! 自定义标题栏（design/DESIGN.md §3.1）。
//!
//! 左侧：logo（主色圆角方形 + network 图标）+ 英文名。
//! 运行状态不再在标题栏重复展示——统计栏的状态行（状态点 + 状态文案）
//! 离读数更近且信息更完整，避免同一状态三处强调（官方设计指南：一个局部
//! 区域只需要一个清晰重点）。
//! 窗口控制按钮（最小化/最大化/关闭）由 TitleBar 组件在 Windows 下自动渲染，
//! 拖拽移动由组件内置处理。
//!
//! 注意：标题栏内容区整体是 OS 级 Drag 控制区，内部按钮收不到点击
//! （见 .workbuddy/skills/gpui-component-ui/SKILL.md），因此可交互控件
//! （如主题切换按钮）不得放在 TitleBar 内。

use gpui::{div, svg, AnyElement, App, Context, FontWeight, IntoElement, ParentElement, Styled};
use gpui_component::{h_flex, ActiveTheme as _, TitleBar};
use rust_i18n::t;

use crate::ui::main_window::MainWindow;

/// 品牌 logo：主色圆角方块 + 内嵌 network 图标
fn logo(cx: &App) -> AnyElement {
    div()
        .size_5()
        .rounded_md()
        .bg(cx.theme().primary)
        .flex()
        .items_center()
        .justify_center()
        .child(
            svg()
                .path("icons/network.svg")
                .size_3p5()
                .text_color(cx.theme().primary_foreground),
        )
        .into_any_element()
}

pub fn render(_view: &MainWindow, cx: &mut Context<MainWindow>) -> TitleBar {
    TitleBar::new()
        // 左侧：logo + 英文名（14px / 600，官方字号体系 text_sm）
        .child(
            h_flex()
                .items_center()
                .gap_2()
                .child(logo(cx))
                .child(
                    div()
                        .text_sm()
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(t!("netclumsy.app.title").into_owned()),
                ),
        )
}
