use gpui::{
    div, App, AnyElement, ElementId, Hsla, InteractiveElement, IntoElement, ParentElement,
    SharedString, Styled, Window, px, rgb,
};
use gpui_component::switch::Switch;
use gpui_component::h_flex;

/// 效果行：指示灯 + 开关（带标题）+ 控件区
pub fn effect_row(
    id: &'static str,
    title: SharedString,
    triggered: bool,
    enabled: bool,
    controls: Vec<AnyElement>,
    on_toggle: impl Fn(&bool, &mut Window, &mut App) + 'static,
) -> AnyElement {
    let switch_id: SharedString = format!("{id}-switch").into();
    h_flex()
        .id(id)
        .items_center()
        .gap_2()
        .py_1()
        .child(status_dot(triggered))
        .child(
            Switch::new(ElementId::Name(switch_id))
                .checked(enabled)
                .label(title)
                .on_click(on_toggle),
        )
        .child(div().flex_1())
        .children(controls)
        .into_any_element()
}

/// 模块触发 / 发送状态指示灯（C 原版 8x8 图标三态：灰 224 224 224 / 绿 109 170 44 / 红 208 70 72）
pub fn status_dot(triggered: bool) -> AnyElement {
    let color: Hsla = if triggered {
        rgb(0x6DAA2C).into()
    } else {
        rgb(0xE0E0E0).into()
    };
    status_dot_color(color)
}

pub fn status_dot_color(color: Hsla) -> AnyElement {
    div()
        .size(px(10.))
        .rounded_full()
        .bg(color)
        .into_any_element()
}
