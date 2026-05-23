// 规则引擎：数据结构、内置规则、分类逻辑、规则 CRUD Commands

use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "settings.json";
const RULES_STORE_KEY: &str = "custom_rules";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub match_target: MatchTarget,
    pub match_type: MatchType,
    pub pattern: String,
    pub category: String,
    pub priority: i32,
    pub enabled: bool,
    #[serde(default)]
    pub is_builtin: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MatchTarget {
    FileName,
    FileExtension,
    LnkTargetPath,
    LnkTargetName,
    FilePath,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MatchType {
    Exact,
    Contains,
    StartsWith,
    EndsWith,
    Regex,
}

#[derive(Clone, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub extension: String,
    pub path: String,
    pub is_dir: bool,
    pub is_lnk: bool,
    pub lnk_target_path: Option<String>,
    pub lnk_target_name: Option<String>,
}

pub fn builtin_rules() -> Vec<Rule> {
    let mut rules = Vec::new();
    let mut add = |target: MatchTarget, pattern: &str, category: &str| {
        rules.push(Rule {
            id: format!("builtin_{}", rules.len()),
            name: format!("{category}: {pattern}"),
            match_target: target,
            match_type: MatchType::Exact,
            pattern: pattern.to_lowercase(),
            category: category.to_string(),
            priority: 100,
            enabled: true,
            is_builtin: true,
        });
    };

    for exe in &["chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "brave.exe", "vivaldi.exe"] {
        add(MatchTarget::LnkTargetName, exe, "browser");
    }
    for exe in &[
        "code.exe", "cursor.exe", "windsurf.exe", "devenv.exe", "rider.exe",
        "clion64.exe", "idea64.exe", "webstorm64.exe", "datagrip64.exe",
        "goland64.exe", "pycharm64.exe", "sublime_text.exe", "notepad++.exe",
    ] {
        add(MatchTarget::LnkTargetName, exe, "dev_tool");
    }
    for exe in &[
        "winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe", "onenote.exe",
        "wps.exe", "wpp.exe", "et.exe", "soffice.exe",
    ] {
        add(MatchTarget::LnkTargetName, exe, "office");
    }
    for exe in &[
        "wechat.exe", "wechatbeta.exe", "qq.exe", "tim.exe", "dingtalk.exe",
        "lark.exe", "feishu.exe", "teams.exe", "discord.exe", "telegram.exe", "slack.exe",
    ] {
        add(MatchTarget::LnkTargetName, exe, "communication");
    }
    for exe in &[
        "potplayermini64.exe", "vlc.exe", "foobar2000.exe", "spotify.exe",
        "netease_music.exe", "qqmusic.exe", "bilibili.exe",
    ] {
        add(MatchTarget::LnkTargetName, exe, "media");
    }
    for exe in &[
        "steam.exe", "epicgameslauncher.exe", "battle.net.exe", "ea.exe",
        "ubisoftconnect.exe", "gog.exe", "xboxpcapp.exe", "wegame.exe",
    ] {
        add(MatchTarget::LnkTargetName, exe, "game");
    }
    for exe in &[
        "photoshop.exe", "illustrator.exe", "afterfx.exe", "premiere.exe",
        "lightroom.exe", "blender.exe", "c4d.exe", "maya.exe", "coreldrw.exe",
    ] {
        add(MatchTarget::LnkTargetName, exe, "design");
    }
    for exe in &[
        "taskmgr.exe", "regedit.exe", "control.exe", "msconfig.exe",
        "cmd.exe", "powershell.exe", "wt.exe",
    ] {
        add(MatchTarget::LnkTargetName, exe, "system_tool");
    }
    for exe in &[
        "idman.exe", "xunlei.exe", "baidunetdisk.exe", "aliyundrive.exe",
        "quark.exe", "thunder.exe", "motrix.exe",
    ] {
        add(MatchTarget::LnkTargetName, exe, "downloader");
    }
    for exe in &[
        "winrar.exe", "bandizip.exe", "7zfm.exe", "7z.exe", "peazip.exe", "haozip.exe",
    ] {
        add(MatchTarget::LnkTargetName, exe, "compressor");
    }
    for exe in &[
        "360safe.exe", "360sd.exe", "qqpcrtp.exe", "huorong.exe",
        "kis.exe", "avast.exe", "avg.exe", "mcafee.exe",
    ] {
        add(MatchTarget::LnkTargetName, exe, "security");
    }

    rules.push(Rule {
        id: "builtin_url".to_string(),
        name: "网页快捷方式".to_string(),
        match_target: MatchTarget::FileExtension,
        match_type: MatchType::Exact,
        pattern: "url".to_string(),
        category: "webpage".to_string(),
        priority: 90,
        enabled: true,
        is_builtin: true,
    });

    rules.push(Rule {
        id: "builtin_lnk_other".to_string(),
        name: "快捷方式".to_string(),
        match_target: MatchTarget::FileExtension,
        match_type: MatchType::Exact,
        pattern: "lnk".to_string(),
        category: "shortcut".to_string(),
        priority: 9999,
        enabled: true,
        is_builtin: true,
    });

    rules
}

pub fn classify_with_rules(info: &FileInfo, custom_rules: &[Rule]) -> String {
    let mut all_rules: Vec<Rule> = Vec::new();

    for r in custom_rules {
        if r.enabled {
            all_rules.push(r.clone());
        }
    }

    for r in builtin_rules() {
        all_rules.push(r);
    }

    let default_cat = classify_by_extension(&info.extension);
    all_rules.push(Rule {
        id: "builtin_default_ext".to_string(),
        name: "默认扩展名分类".to_string(),
        match_target: MatchTarget::FileExtension,
        match_type: MatchType::Exact,
        pattern: info.extension.clone(),
        category: default_cat.to_string(),
        priority: 10000,
        enabled: true,
        is_builtin: true,
    });

    all_rules.sort_by_key(|r| r.priority);

    for rule in &all_rules {
        if !rule.enabled {
            continue;
        }
        let haystack = match &rule.match_target {
            MatchTarget::FileName => &info.name,
            MatchTarget::FileExtension => &info.extension,
            MatchTarget::LnkTargetPath => info.lnk_target_path.as_deref().unwrap_or(""),
            MatchTarget::LnkTargetName => info.lnk_target_name.as_deref().unwrap_or(""),
            MatchTarget::FilePath => &info.path,
        };

        let matched = match &rule.match_type {
            MatchType::Exact => haystack.eq_ignore_ascii_case(&rule.pattern),
            MatchType::Contains => haystack.to_lowercase().contains(&rule.pattern.to_lowercase()),
            MatchType::StartsWith => haystack.to_lowercase().starts_with(&rule.pattern.to_lowercase()),
            MatchType::EndsWith => haystack.to_lowercase().ends_with(&rule.pattern.to_lowercase()),
            MatchType::Regex => Regex::new(&rule.pattern)
                .map(|re| re.is_match(haystack))
                .unwrap_or(false),
        };

        if matched {
            return rule.category.clone();
        }
    }

    "other".to_string()
}

pub fn classify_by_extension(ext: &str) -> &str {
    match ext {
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "svg" | "webp" | "ico" | "tiff" | "tif"
        | "psd" | "eps" => "image",
        "pdf" | "doc" | "docx" | "docm" | "dot" | "dotx" | "wbk"
        | "xls" | "xlsx" | "xlsm" | "xlt" | "xltx" | "csv"
        | "ppt" | "pptx" | "pptm" | "pot" | "potx" | "pps" | "ppsx"
        | "vsd" | "vsdx" | "accdb" | "mdb"
        | "txt" | "md" | "rtf" | "json" | "xml" | "html" | "htm" => "document",
        "mp4" | "avi" | "mkv" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "mpeg" | "mpg"
        | "vob" => "video",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "wma" | "m4a" | "aif" | "aiff" | "aifc"
        | "mid" | "midi" | "cda" => "music",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "tgz" | "cab" | "iso" => "archive",
        "c" | "cpp" | "cc" | "cxx" | "h" | "hpp" | "hxx" | "cs"
        | "java" | "kt" | "kts" | "scala" | "groovy"
        | "py" | "pyw" | "pyi" | "rs" | "go" | "rb" | "php"
        | "js" | "jsx" | "mjs" | "cjs" | "ts" | "tsx" | "dart"
        | "swift" | "m" | "mm" | "r" | "pl" | "pm" | "lua"
        | "erl" | "hrl" | "ex" | "exs" | "hs" | "clj" | "cljs"
        | "fs" | "fsx" | "fsi" | "jl" | "nim" | "zig" | "d"
        | "sh" | "bash" | "zsh" | "fish" | "ps1" | "bat" | "cmd"
        | "sql" | "css" | "scss" | "sass" | "less"
        | "yaml" | "yml" | "toml" | "ini" | "conf" | "cfg"
        | "asm" | "s" | "pas" | "dpr" | "vba" | "vbs" | "vb"
        | "ml" | "mli" | "re" | "rei" | "elm" | "coffee" | "wat" => "source",
        _ => "other",
    }
}

pub async fn load_rules_from_store(app: &AppHandle) -> Result<Vec<Rule>, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    if let Some(value) = store.get(RULES_STORE_KEY) {
        serde_json::from_value(value).map_err(|e| format!("解析规则失败: {e}"))
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn get_rules(app: AppHandle) -> Result<Vec<Rule>, String> {
    load_rules_from_store(&app).await
}

#[tauri::command]
pub async fn save_rules(app: AppHandle, rules: Vec<Rule>) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(&rules).map_err(|e| e.to_string())?;
    store.set(RULES_STORE_KEY, value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn reset_rules(app: AppHandle) -> Result<Vec<Rule>, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.delete(RULES_STORE_KEY);
    store.save().map_err(|e| e.to_string())?;
    Ok(Vec::new())
}
