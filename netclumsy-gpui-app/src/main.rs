use gpui::*;
use gpui_component::Root;
use rust_i18n::t;
use std::sync::Arc;

mod assets;
mod elevate;
mod engine;
mod ui;

use assets::Assets;
use engine::EngineConfig;
use ui::main_window::MainWindow;

rust_i18n::i18n!("locales", fallback = "en");

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

        let config = Arc::new(EngineConfig::default());

        cx.spawn(async move |cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds {
                        origin: point(px(100.), px(100.)),
                        size: size(px(640.), px(620.)),
                    })),
                    titlebar: Some(TitlebarOptions {
                        title: Some(t!("netclumsy.app.title").into_owned().into()),
                        ..Default::default()
                    }),
                    ..Default::default()
                },
                move |window, cx| {
                    let view = cx.new(|cx| MainWindow::new(window, cx, config));
                    cx.new(|cx| Root::new(view, window, cx))
                },
            )?;

            Ok::<_, anyhow::Error>(())
        })
        .detach();
    });
}
