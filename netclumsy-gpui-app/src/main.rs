use gpui::*;
use gpui_component::{button::*, *};
use rust_i18n::t;

mod assets;
mod elevate;

use assets::Assets;

rust_i18n::i18n!("locales", fallback = "en");

pub struct HelloWorld;

impl Render for HelloWorld {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .v_flex()
            .gap_2()
            .size_full()
            .items_center()
            .justify_center()
            .child(SharedString::from(t!("netclumsy.app.title")))
            .child(IconName::Globe)
            .child(
                Button::new("ok")
                    .primary()
                    .label(t!("netclumsy.window.start"))
                    .on_click(|_, _, _| println!("Clicked!")),
            )
    }
}

fn main() {
    if !elevate::is_run_as_admin() {
        elevate::elevate_self();
        return;
    }

    let app = Application::new().with_assets(Assets);

    app.run(move |cx| {
        gpui_component::set_locale("zh-CN");
        rust_i18n::set_locale("zh-CN");
        gpui_component::init(cx);

        cx.spawn(async move |cx| {
            cx.open_window(WindowOptions::default(), |window, cx| {
                let view = cx.new(|_| HelloWorld);
                cx.new(|cx| Root::new(view, window, cx))
            })?;

            Ok::<_, anyhow::Error>(())
        })
        .detach();
    });
}
