/// WSL2 场景预设（源自 config.txt 的 4 个 8012 预设，P2 将改为 exe 同目录加载）
pub const PRESETS: &[(&str, &str)] = &[
    (
        "wsl2 ws 8012 both",
        "tcp and (tcp.DstPort == 8012 or tcp.SrcPort == 8012)",
    ),
    ("wsl2 ws 8012 uplink", "tcp and tcp.DstPort == 8012"),
    ("wsl2 ws 8012 downlink", "tcp and tcp.SrcPort == 8012"),
    (
        "wsl2 ws 8012 no-loopback",
        "tcp and not loopback and (tcp.DstPort == 8012 or tcp.SrcPort == 8012)",
    ),
];
