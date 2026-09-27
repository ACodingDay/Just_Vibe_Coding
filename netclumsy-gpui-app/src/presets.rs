//! 过滤器预设：加载 exe 同目录 config.txt（原版 clumsy 格式「名称: 过滤表达式」）。
//!
//! 规则与 C 原版 loadConfig 一致：# 注释行、空行跳过、第一个冒号分割、
//! 行内无冒号则停止解析。安全化改进：
//! - 无 4096 字节截断；条数封顶 64（原版 CONFIG_MAX_RECORDS，超界是原版 bug）
//! - 剥 UTF-8 BOM；UTF-8 解码失败时按 GBK 兜底（老记事本 ANSI 默认）
//! - 名称/值 trim 两端；空条目跳过
//! - 文件缺失/为空 → 回退原版式 1 条 loopback 预设

use encoding_rs::GBK;

/// 单条预设
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Preset {
    pub name: String,
    pub filter: String,
}

/// 原版条数上限（C 原版 CONFIG_MAX_RECORDS）
const MAX_RECORDS: usize = 64;

impl Preset {
    /// 原版回退预设：loopback 包（只能在 outbound 方向过滤）
    pub fn fallback() -> Preset {
        Preset {
            name: "loopback packets".into(),
            filter: "outbound and ip.DstAddr >= 127.0.0.1 and ip.DstAddr <= 127.255.255.255"
                .into(),
        }
    }
}

/// 加载 exe 同目录 config.txt；缺失/为空/解析为空时回退 1 条 loopback 预设
pub fn load() -> Vec<Preset> {
    let path = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("config.txt")));

    let mut presets = path
        .as_deref()
        .and_then(|p| std::fs::read(p).ok())
        .map(|bytes| parse_bytes(&bytes))
        .unwrap_or_default();

    if presets.is_empty() {
        presets.push(Preset::fallback());
    }
    presets
}

/// 解析原始字节：UTF-8 优先，失败按 GBK 解码
fn parse_bytes(bytes: &[u8]) -> Vec<Preset> {
    match std::str::from_utf8(bytes) {
        Ok(text) => parse(text),
        Err(_) => {
            let (text, _, _) = GBK.decode(bytes);
            parse(&text)
        }
    }
}

/// 解析 config.txt 文本（规则见模块注释）
pub fn parse(text: &str) -> Vec<Preset> {
    // 剥 UTF-8 BOM（作为字符出现在首行行首）
    let text = text.strip_prefix('\u{FEFF}').unwrap_or(text);
    let mut presets: Vec<Preset> = Vec::new();
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        let trimmed = line.trim_start();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with('#') {
            continue;
        }
        // 原版：无冒号的行终止整个解析
        let Some(idx) = line.find(':') else {
            break;
        };
        let name = line[..idx].trim();
        let filter = line[idx + 1..].trim();
        if name.is_empty() || filter.is_empty() {
            // 原版会留下空条目，这里跳过（改进）
            continue;
        }
        if presets.len() >= MAX_RECORDS {
            break;
        }
        presets.push(Preset {
            name: name.to_string(),
            filter: filter.to_string(),
        });
    }
    presets
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_basic_entries() {
        let text = "a: udp\nb:tcp and outbound\n";
        assert_eq!(
            parse(text),
            vec![
                Preset { name: "a".into(), filter: "udp".into() },
                Preset { name: "b".into(), filter: "tcp and outbound".into() },
            ]
        );
    }

    #[test]
    fn skips_comments_and_blank_lines() {
        let text = "# 注释\n\n  # 缩进注释\na: udp\n";
        assert_eq!(parse(text), vec![Preset { name: "a".into(), filter: "udp".into() }]);
    }

    #[test]
    fn handles_crlf_and_bom() {
        let text = "\u{FEFF}a: udp\r\nb: tcp\r\n";
        assert_eq!(
            parse(text),
            vec![
                Preset { name: "a".into(), filter: "udp".into() },
                Preset { name: "b".into(), filter: "tcp".into() },
            ]
        );
    }

    #[test]
    fn value_may_contain_colon() {
        let text = "a: tcp.DstPort == 1 or tcp.SrcPort == 2: extra\n";
        assert_eq!(
            parse(text),
            vec![Preset {
                name: "a".into(),
                filter: "tcp.DstPort == 1 or tcp.SrcPort == 2: extra".into()
            }]
        );
    }

    #[test]
    fn line_without_colon_stops_parsing() {
        let text = "a: udp\nmalformed line\nb: tcp\n";
        assert_eq!(parse(text), vec![Preset { name: "a".into(), filter: "udp".into() }]);
    }

    #[test]
    fn skips_empty_name_or_value() {
        let text = ": udp\na:\na: udp\n";
        assert_eq!(parse(text), vec![Preset { name: "a".into(), filter: "udp".into() }]);
    }

    #[test]
    fn caps_at_64_records() {
        let text = (0..80)
            .map(|i| format!("p{i}: udp"))
            .collect::<Vec<_>>()
            .join("\n");
        assert_eq!(parse(&text).len(), MAX_RECORDS);
        assert_eq!(parse(&text).last().unwrap().name, "p63");
    }

    #[test]
    fn gbk_bytes_fall_back() {
        // 「中文名: udp」的 GBK 编码
        let gbk = [0xD6, 0xD0, 0xCE, 0xC4, 0xC3, 0xFB, b':', b' ', b'u', b'd', b'p'];
        assert_eq!(parse_bytes(&gbk), vec![Preset { name: "中文名".into(), filter: "udp".into() }]);
    }

    #[test]
    fn utf8_bom_stripped() {
        let bytes = b"\xEF\xBB\xBFa: udp";
        assert_eq!(parse_bytes(bytes), vec![Preset { name: "a".into(), filter: "udp".into() }]);
    }
}
