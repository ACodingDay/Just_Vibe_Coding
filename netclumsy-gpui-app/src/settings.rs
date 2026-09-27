//! 应用设置：exe 同目录 settings.json 持久化（与 config.txt 预设同目录约定）。
//!
//! 目前仅界面语言一项。文件缺失/损坏/含未支持的语言代码时回退默认值。
//! 语言变更不即时生效：UI 选择后仅写文件并弹窗提示重启，这里启动时读到的
//! 值才是整个进程生效的语言（main.rs 用它初始化 rust-i18n 与组件库 locale）。

use std::path::PathBuf;

/// 支持的语言（展示名 → rust-i18n locale 代码）；数组顺序即设置页 Select 顺序
pub const LANGUAGES: [(&str, &str); 2] = [("English", "en"), ("简体中文", "zh-CN")];

/// 默认语言：English
pub const DEFAULT_LANGUAGE: &str = "en";

/// 应用设置（启动时整体读入；运行期只写文件，不改已生效的运行态）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppSettings {
    pub language: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: DEFAULT_LANGUAGE.into(),
        }
    }
}

fn settings_path() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("settings.json")))
}

impl AppSettings {
    /// 读取设置；文件缺失/损坏/语言代码未支持时回退默认值（English）
    pub fn load() -> Self {
        let Some(path) = settings_path() else {
            return Self::default();
        };
        let Ok(bytes) = std::fs::read(path) else {
            return Self::default();
        };
        let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
            return Self::default();
        };
        let language = value
            .get("language")
            .and_then(|v| v.as_str())
            .unwrap_or(DEFAULT_LANGUAGE);
        Self {
            language: if LANGUAGES.iter().any(|(_, code)| *code == language) {
                language.into()
            } else {
                DEFAULT_LANGUAGE.into()
            },
        }
    }

    /// 写入设置；exe 路径不可得/序列化失败时静默放弃（无弹出错误路径）
    pub fn save(&self) {
        let Some(path) = settings_path() else {
            return;
        };
        let Ok(text) = serde_json::to_string_pretty(&serde_json::json!({
            "language": self.language,
        })) else {
            return;
        };
        let _ = std::fs::write(path, text);
    }
}

/// 语言代码 → LANGUAGES 下标；未支持代码归位到默认项（Select 初始选中项）
pub fn language_index(code: &str) -> usize {
    LANGUAGES
        .iter()
        .position(|(_, c)| *c == code)
        .unwrap_or(0)
}
