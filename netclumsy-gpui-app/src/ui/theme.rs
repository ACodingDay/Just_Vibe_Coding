//! 主题注册与切换（design/DESIGN.md §4 seed token 双主题）。
//!
//! seed token → gpui-component ThemeConfig 映射约定：
//! - seed-primary → primary（主操作 / Switch 开 / Tabs 激活 / 焦点环）
//! - seed-accent（绿）→ success（运行中 / 触发 LED / 速率曲线 chart.1）
//! - seed-danger  → danger（停止按钮 / 错误 / 发送异常 LED）
//! - seed-warning → warning（管理员 Badge）
//! - seed-surface → title_bar / status_bar / sidebar / popover 背景
//! - seed-surface-2 → muted / accent（hover 底）/ tab.active 背景
//!
//! 未显式设置的字段由 apply_config 回退到内置 dark/light 默认值。

use gpui_kit::App;
use gpui_kit::component::theme::{Theme, ThemeConfig, ThemeMode};
use std::rc::Rc;

/// 深色主题（默认）：seed-bg #0B0E14
///
/// 等宽字体不在此显式指定（`mono_font.family` 留空）：GPUI 对缺失字体的
/// 首行排版直接 panic，且显式指定会跳过 gpui-kit 的内置回退探测。框架
/// 默认在 Windows 上解析为 Consolas（Vista 起全系自带），无缺失风险；
/// Cascadia Mono 仅 Win11 / 装有 Windows Terminal 的机器存在，init 里
/// 探测到才显式采用（见 apply_mono_font）。
const DARK_THEME_JSON: &str = r##"{
    "name": "NetClumsy Dark",
    "mode": "dark",
    "radius": 6,
    "colors": {
        "background": "#0B0E14",
        "foreground": "#E6E9EF",
        "border": "#1D2026",
        "input.border": "#262C38",
        "ring": "#4C8DFF",
        "caret": "#E6E9EF",
        "primary.background": "#4C8DFF",
        "primary.foreground": "#FFFFFF",
        "secondary.background": "#171C27",
        "secondary.foreground": "#E6E9EF",
        "muted.background": "#171C27",
        "muted.foreground": "#8A93A6",
        "accent.background": "#1D2432",
        "accent.foreground": "#E6E9EF",
        "success.background": "#3ECF8E",
        "success.foreground": "#0B0E14",
        "danger.background": "#F0564A",
        "danger.foreground": "#FFFFFF",
        "warning.background": "#E8A33D",
        "warning.foreground": "#0B0E14",
        "info.background": "#4C8DFF",
        "info.foreground": "#FFFFFF",
        "title_bar.background": "#11151E",
        "title_bar.border": "#1D2026",
        "tab_bar.background": "#0B0E14",
        "tab_bar.segmented.background": "#11151E",
        "tab.background": "#11151E",
        "tab.foreground": "#8A93A6",
        "tab.active.background": "#171C27",
        "tab.active.foreground": "#4C8DFF",
        "list.hover.background": "#171C27",
        "selection.background": "#4C8DFF",
        "popover.background": "#11151E",
        "popover.foreground": "#E6E9EF",
        "scrollbar.thumb.background": "#2A3140",
        "skeleton.background": "#171C27",
        "chart.1": "#3ECF8E"
    }
}"##;

/// 浅色主题（备选）：seed-bg #F5F6F8（等宽字体策略同深色主题）
const LIGHT_THEME_JSON: &str = r##"{
    "name": "NetClumsy Light",
    "mode": "light",
    "radius": 6,
    "colors": {
        "background": "#F5F6F8",
        "foreground": "#171B23",
        "border": "#E3E4E7",
        "input.border": "#D4D7DC",
        "ring": "#2F6FE4",
        "caret": "#171B23",
        "primary.background": "#2F6FE4",
        "primary.foreground": "#FFFFFF",
        "secondary.background": "#ECEEF2",
        "secondary.foreground": "#171B23",
        "muted.background": "#ECEEF2",
        "muted.foreground": "#5C6577",
        "accent.background": "#E2E6EC",
        "accent.foreground": "#171B23",
        "success.background": "#189E66",
        "success.foreground": "#FFFFFF",
        "danger.background": "#D5484A",
        "danger.foreground": "#FFFFFF",
        "warning.background": "#B87A1E",
        "warning.foreground": "#FFFFFF",
        "info.background": "#2F6FE4",
        "info.foreground": "#FFFFFF",
        "title_bar.background": "#FFFFFF",
        "title_bar.border": "#E3E4E7",
        "tab_bar.background": "#F5F6F8",
        "tab_bar.segmented.background": "#ECEEF2",
        "tab.background": "#ECEEF2",
        "tab.foreground": "#5C6577",
        "tab.active.background": "#FFFFFF",
        "tab.active.foreground": "#2F6FE4",
        "list.hover.background": "#ECEEF2",
        "selection.background": "#2F6FE4",
        "popover.background": "#FFFFFF",
        "popover.foreground": "#171B23",
        "scrollbar.thumb.background": "#C9CDD4",
        "skeleton.background": "#ECEEF2",
        "chart.1": "#189E66"
    }
}"##;

fn parse_config(json: &str) -> ThemeConfig {
    serde_json::from_str(json).expect("内置主题 JSON 必须可解析")
}

/// 注册深/浅两套 seed 主题，默认深色。须在 gpui_kit::init 之后调用。
pub fn init(cx: &mut App) {
    {
        let theme = Theme::global_mut(cx);
        theme.dark_theme = Rc::new(parse_config(DARK_THEME_JSON));
        theme.light_theme = Rc::new(parse_config(LIGHT_THEME_JSON));
    }
    Theme::change(ThemeMode::Dark, None, cx);
    apply_mono_font(cx);
}

/// 优先采用 Cascadia Mono（视觉对齐设计稿；仅 Win11 / 装有 Windows Terminal
/// 的机器存在）。未安装时不显式设置——框架默认 Consolas 全系自带，且
/// gpui-kit 的内置探测会再兜底 Courier New → 系统字体。两套主题 JSON 均
/// 不写 mono_font.family，因此这里的运行时覆盖在主题切换后依然保留
/// （apply_config 只覆盖配置里 Some 的字段）。
fn apply_mono_font(cx: &mut App) {
    let has_cascadia = cx
        .text_system()
        .all_font_names()
        .iter()
        .any(|name| name == "Cascadia Mono");
    if has_cascadia {
        Theme::global_mut(cx).mono_font_family = "Cascadia Mono".into();
    }
}

/// 深/浅主题切换（TitleBar 主题按钮回调）。
/// 对齐官方 story 应用的已验证路径：change 传 None + refresh_windows 全量刷新。
pub fn toggle(cx: &mut App) {
    let next = if Theme::global(cx).is_dark() {
        ThemeMode::Light
    } else {
        ThemeMode::Dark
    };
    Theme::change(next, None, cx);
    cx.refresh_windows();
}
