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
use ui::main_window::{CaptureFilter, MainWindow, StartFilter, StopFilter};

rust_i18n::i18n!("locales", fallback = "en");

/// 轻量调试日志：始终输出到 stderr；另设 NETCLUMSY_DEBUG_LOG=<路径> 时同步追加
/// 到该文件——提权子进程会另开控制台（stderr 看不到），文件便于验证完整链路。
pub(crate) fn debug_log(msg: &str) {
    eprintln!("[netclumsy] {msg}");
    if let Ok(path) = std::env::var("NETCLUMSY_DEBUG_LOG") {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            use std::io::Write as _;
            let _ = writeln!(f, "[netclumsy] {msg}");
        }
    }
}

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

    // 测试开关：NETCLUMSY_FORCE_NOT_ADMIN=1 时跳过自动提权、以非管理员身份进 GUI，
    // 用于开发期验证提权提示对话框/红色徽标。必须跳过提权——UAC 提权子进程不继承
    // 父进程环境变量，若仍走 elevate_self，开关到不了新实例，形同虚设。
    let force_not_admin = matches!(
        std::env::var("NETCLUMSY_FORCE_NOT_ADMIN").as_deref(),
        Ok("1")
    );
    if force_not_admin {
        debug_log("NETCLUMSY_FORCE_NOT_ADMIN=1, skip auto-elevation (UI test mode)");
    } else if !elevate::is_run_as_admin() {
        debug_log("token: not admin, trying elevate_self()");
        // 修复：原实现忽略 elevate_self() 的返回值、无条件 return。用户取消 UAC 或
        // ShellExecuteW 失败时，进程静默以 0 退出：既没有任何提示，脚本调用方也
        // 误以为执行成功。现在只有确实拉起了提权新进程才退出当前进程。
        if elevate::elevate_self() {
            debug_log("elevate_self() ok, exiting for elevated instance");
            return;
        }
        debug_log("elevate_self() failed, falling back to GUI");
        eprintln!("{}", t!("netclumsy.cli.error.elevate_failed"));
        // 交互式启动继续进 GUI：界面有「未以管理员身份运行」红色徽标，start_engine
        // 也会给出「打开设备失败（请确认以管理员身份运行）」，比关闭控制台窗口更可读。
        // 带参数的自动化启动没有后续界面可看，明确以非 0 码失败退出。
        if parsed.has_any {
            std::process::exit(1);
        }
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

        // 键盘路径：启动/捕获/停止（按钮 tooltip 会自动展示对应快捷键）
        cx.bind_keys([
            KeyBinding::new("f5", StartFilter, None),
            KeyBinding::new("f6", CaptureFilter, None),
            KeyBinding::new("shift-f5", StopFilter, None),
        ]);

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
