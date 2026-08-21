use gpui::*;
use gpui_component::{Root, TitleBar};
use rust_i18n::t;
use std::sync::Arc;

mod args;
mod assets;
mod elevate;
mod engine;
mod presets;
mod ui;

use assets::Assets;
use engine::EngineConfig;
use ui::main_window::MainWindow;

rust_i18n::i18n!("locales", fallback = "en");

fn main() {
    // 控制台输出统一 UTF-8，避免中文 --help/错误在 GBK 控制台乱码
    unsafe {
        let _ = windows::Win32::System::Console::SetConsoleOutputCP(65001);
    }
    rust_i18n::set_locale("zh-CN");

    // 解析命令行（原版 clumsy parseArgs 兼容 + 增强；提权前解析，
    // 提权重启由 elevate_self 透传参数，修复原版丢参 bug）
    let parsed = match args::parse(std::env::args_os().skip(1)) {
        Ok(a) => a,
        Err(msg) => {
            eprintln!("{msg}");
            eprintln!("{}", t!("netclumsy.cli.error.hint"));
            std::process::exit(1);
        }
    };
    if parsed.help {
        print!("{}", args::help_text());
        return;
    }

    if !elevate::is_run_as_admin() {
        elevate::elevate_self();
        return;
    }

    // 加载 exe 同目录 config.txt 预设（缺失时回退原版式 loopback 预设）
    let presets = presets::load();

    let app = gpui_platform::application().with_assets(Assets);

    app.run(move |cx| {
        gpui_component::set_locale("zh-CN");
        rust_i18n::set_locale("zh-CN");
        gpui_component::init(cx);
        // 注册深/浅两套 seed token 主题，默认深色（design/DESIGN.md §4）
        ui::theme::init(cx);

        let config = Arc::new(EngineConfig::default());

        cx.spawn(async move |cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds {
                        origin: point(px(100.), px(100.)),
                        size: size(px(920.), px(720.)),
                    })),
                    // 自适应布局的最小尺寸限制（再小效果行参数区无法容纳）
                    window_min_size: Some(size(px(800.), px(600.))),
                    titlebar: Some(TitlebarOptions {
                        title: Some(t!("netclumsy.app.title").into_owned().into()),
                        ..TitleBar::title_bar_options()
                    }),
                    app_owns_titlebar_drag: true,
                    ..Default::default()
                },
                move |window, cx| {
                    let view = cx.new(|cx| MainWindow::new(window, cx, config, presets, parsed));
                    cx.new(|cx| Root::new(view, window, cx))
                },
            )?;

            Ok::<_, anyhow::Error>(())
        })
        .detach();
    });
}
