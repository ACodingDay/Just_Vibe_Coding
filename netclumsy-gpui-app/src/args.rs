//! 命令行参数解析：兼容原版 clumsy 的「--key value」成对格式。
//!
//! 与原版 parseArgs 的差异（改进）：
//! - 新增 --help；未知参数/缺值/非法值报 i18n 错误并给出 --help 提示（原版静默 exit(-1)）
//! - --bandwidth-bandwidth 保留原名的同时提供 --bandwidth-limit 别名
//! - 新增 --capture on|off（启动即进入捕获/嗅探模式，原版无）
//! - 布尔值大小写不敏感（原版依赖 IUP 的 on/off 语义）

use std::collections::BTreeMap;
use std::ffi::OsString;

use rust_i18n::t;

/// 效果模块 CLI 名（原版各模块 NAME 宏，顺序与 modules 数组一致）
pub const EFFECT_NAMES: [&str; 8] = [
    "lag", "drop", "throttle", "duplicate", "ood", "tamper", "reset", "bandwidth",
];

/// 单个效果的命令行参数
#[derive(Debug, Default)]
pub struct EffectArgs {
    /// --<name> on|off
    pub enabled: Option<bool>,
    /// --<name>-inbound on|off
    pub inbound: Option<bool>,
    /// --<name>-outbound on|off
    pub outbound: Option<bool>,
    /// 参数名（原版后缀，如 time/chance/count/bandwidth）→ 原始值
    pub values: BTreeMap<&'static str, String>,
}

/// 解析后的命令行参数
#[derive(Debug, Default)]
pub struct ParsedArgs {
    pub help: bool,
    pub filter: Option<String>,
    pub timeout_secs: Option<u64>,
    /// --capture on|off
    pub capture: Option<bool>,
    pub lag: EffectArgs,
    pub drop: EffectArgs,
    pub throttle: EffectArgs,
    pub duplicate: EffectArgs,
    pub ood: EffectArgs,
    pub tamper: EffectArgs,
    pub reset: EffectArgs,
    pub bandwidth: EffectArgs,
    /// 是否带任何参数（原版 parameterized：带参即自动开始过滤）
    pub has_any: bool,
}

impl ParsedArgs {
    fn effect_mut(&mut self, name: &str) -> &mut EffectArgs {
        match name {
            "lag" => &mut self.lag,
            "drop" => &mut self.drop,
            "throttle" => &mut self.throttle,
            "duplicate" => &mut self.duplicate,
            "ood" => &mut self.ood,
            "tamper" => &mut self.tamper,
            "reset" => &mut self.reset,
            "bandwidth" => &mut self.bandwidth,
            _ => unreachable!("effect name from EFFECT_NAMES"),
        }
    }

    fn apply(&mut self, key: &str, value: String) -> Result<(), String> {
        match key {
            "filter" => self.filter = Some(value),
            "timeout" => {
                self.timeout_secs = Some(value.trim().parse().map_err(|_| {
                    t!(
                        "netclumsy.cli.error.invalid_number",
                        option = "--timeout",
                        value = value
                    )
                    .to_string()
                })?);
            }
            "capture" => self.capture = Some(parse_bool("--capture", &value)?),
            _ => {
                // 效果相关：<name> / <name>-inbound / <name>-outbound / <name>-<param>
                let opt = format!("--{key}");
                let mut matched = None;
                for name in EFFECT_NAMES {
                    if key == name {
                        matched = Some((name, ""));
                        break;
                    }
                    if let Some(suffix) = key.strip_prefix(&format!("{name}-")) {
                        matched = Some((name, suffix));
                        break;
                    }
                }
                let Some((name, suffix)) = matched else {
                    return Err(t!(
                        "netclumsy.cli.error.unknown_option",
                        option = opt
                    )
                    .to_string());
                };
                let effect = self.effect_mut(name);
                match suffix {
                    "" => effect.enabled = Some(parse_bool(&opt, &value)?),
                    "inbound" => effect.inbound = Some(parse_bool(&opt, &value)?),
                    "outbound" => effect.outbound = Some(parse_bool(&opt, &value)?),
                    "time" if name == "lag" => {
                        effect.values.insert("time", value);
                    }
                    "chance"
                        if matches!(name, "drop" | "throttle" | "duplicate" | "ood" | "tamper" | "reset") =>
                    {
                        effect.values.insert("chance", value);
                    }
                    "frame" if name == "throttle" => {
                        effect.values.insert("frame", value);
                    }
                    "count" if name == "duplicate" => {
                        effect.values.insert("count", value);
                    }
                    "checksum" if name == "tamper" => {
                        let v = parse_bool(&opt, &value)?;
                        effect.values.insert("checksum", if v { "on" } else { "off" }.into());
                    }
                    // 原版键名 --bandwidth-bandwidth 与别名 --bandwidth-limit
                    "bandwidth" | "limit" if name == "bandwidth" => {
                        effect.values.insert("bandwidth", value);
                    }
                    _ => {
                        return Err(
                            t!("netclumsy.cli.error.unknown_option", option = opt).to_string()
                        );
                    }
                }
            }
        }
        self.has_any = true;
        Ok(())
    }
}

/// 解析命令行（不含 argv[0]）
pub fn parse<I>(args: I) -> Result<ParsedArgs, String>
where
    I: IntoIterator<Item = OsString>,
{
    let mut parsed = ParsedArgs::default();
    let mut it = args.into_iter();
    while let Some(k) = it.next() {
        let k = k.to_string_lossy().into_owned();
        if k == "--help" || k == "-h" {
            parsed.help = true;
            continue;
        }
        if !k.starts_with("--") || k.len() <= 2 {
            return Err(t!("netclumsy.cli.error.unknown_option", option = k).to_string());
        }
        let value = it
            .next()
            .ok_or_else(|| t!("netclumsy.cli.error.missing_value", option = k).to_string())?;
        let value = value.to_string_lossy().into_owned();
        parsed.apply(&k[2..], value)?;
    }
    Ok(parsed)
}

/// 布尔值解析：on/off（大小写不敏感）
fn parse_bool(option: &str, value: &str) -> Result<bool, String> {
    if value.eq_ignore_ascii_case("on") {
        Ok(true)
    } else if value.eq_ignore_ascii_case("off") {
        Ok(false)
    } else {
        Err(t!(
            "netclumsy.cli.error.invalid_bool",
            option = option,
            value = value
        )
        .to_string())
    }
}

/// --help 文本（i18n）
pub fn help_text() -> String {
    t!("netclumsy.cli.help").into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_strs(args: &[&str]) -> Result<ParsedArgs, String> {
        parse(args.iter().map(OsString::from))
    }

    #[test]
    fn parses_filter_timeout_capture() {
        let a = parse_strs(&["--filter", "udp", "--timeout", "5", "--capture", "on"]).unwrap();
        assert_eq!(a.filter.as_deref(), Some("udp"));
        assert_eq!(a.timeout_secs, Some(5));
        assert_eq!(a.capture, Some(true));
        assert!(a.has_any);
    }

    #[test]
    fn parses_effect_keys() {
        let a = parse_strs(&[
            "--lag", "on", "--lag-time", "200", "--lag-inbound", "off",
            "--drop-chance", "20.5", "--bandwidth-bandwidth", "100",
            "--bandwidth-limit", "200", "--tamper-checksum", "OFF",
        ]).unwrap();
        assert_eq!(a.lag.enabled, Some(true));
        assert_eq!(a.lag.values.get("time").map(String::as_str), Some("200"));
        assert_eq!(a.lag.inbound, Some(false));
        assert_eq!(a.drop.values.get("chance").map(String::as_str), Some("20.5"));
        // 别名与原名同槽，后者覆盖前者
        assert_eq!(a.bandwidth.values.get("bandwidth").map(String::as_str), Some("200"));
        assert_eq!(a.tamper.values.get("checksum").map(String::as_str), Some("off"));
    }

    #[test]
    fn rejects_unknown_option() {
        let err = parse_strs(&["--nope", "on"]).unwrap_err();
        assert!(err.contains("--nope"));
    }

    #[test]
    fn rejects_missing_value() {
        let err = parse_strs(&["--lag"]).unwrap_err();
        assert!(err.contains("--lag"));
    }

    #[test]
    fn rejects_invalid_bool() {
        let err = parse_strs(&["--lag", "yes"]).unwrap_err();
        assert!(err.contains("on/off"));
    }

    #[test]
    fn rejects_invalid_timeout() {
        assert!(parse_strs(&["--timeout", "abc"]).is_err());
    }

    #[test]
    fn help_flag() {
        let a = parse_strs(&["--help"]).unwrap();
        assert!(a.help);
        assert!(!a.has_any);
    }

    #[test]
    fn empty_args() {
        let a = parse_strs(&[]).unwrap();
        assert!(!a.has_any);
        assert!(!a.help);
    }
}
