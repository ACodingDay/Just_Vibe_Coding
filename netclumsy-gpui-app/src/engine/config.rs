use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU32, AtomicU64, AtomicU8};

/// 发送状态（与 C 原版 SEND_STATUS_* 对应）
pub const SEND_STATUS_NONE: u8 = 0;
pub const SEND_STATUS_SEND: u8 = 1;
pub const SEND_STATUS_FAIL: u8 = 2;

/// 所有效果共有的开关与方向配置（UI 线程写，引擎线程读）
#[derive(Debug)]
pub struct BaseParams {
    pub enabled: Arc<AtomicBool>,
    pub inbound: Arc<AtomicBool>,
    pub outbound: Arc<AtomicBool>,
}

impl BaseParams {
    pub fn new() -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(false)),
            inbound: Arc::new(AtomicBool::new(true)),
            outbound: Arc::new(AtomicBool::new(true)),
        }
    }
}

impl Default for BaseParams {
    fn default() -> Self {
        Self::new()
    }
}

/// 概率（chance），范围 [0, 10000]，10000 = 必触发（百分比 × 100）
#[derive(Debug)]
pub struct ChanceParams {
    pub base: BaseParams,
    pub chance: Arc<AtomicU32>,
}

impl ChanceParams {
    pub fn new(default_chance: u32) -> Self {
        Self {
            base: BaseParams::new(),
            chance: Arc::new(AtomicU32::new(default_chance)),
        }
    }
}

/// Lag：延迟 ms，默认 50，范围 0-15000
#[derive(Debug)]
pub struct LagParams {
    pub base: BaseParams,
    pub time: Arc<AtomicU32>,
}

impl LagParams {
    pub fn new(default_time: u32) -> Self {
        Self {
            base: BaseParams::new(),
            time: Arc::new(AtomicU32::new(default_time)),
        }
    }
}

/// Throttle：触发概率 + 时间窗 ms（默认 30，范围 0-1000）+ 丢弃节流包
#[derive(Debug)]
pub struct ThrottleParams {
    pub base: BaseParams,
    pub chance: Arc<AtomicU32>,
    pub frame: Arc<AtomicU32>,
    pub drop_throttled: Arc<AtomicBool>,
}

impl ThrottleParams {
    pub fn new(default_chance: u32, default_frame: u32) -> Self {
        Self {
            base: BaseParams::new(),
            chance: Arc::new(AtomicU32::new(default_chance)),
            frame: Arc::new(AtomicU32::new(default_frame)),
            drop_throttled: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Duplicate：份数（2-50，默认 2）+ 概率
#[derive(Debug)]
pub struct DuplicateParams {
    pub base: BaseParams,
    pub chance: Arc<AtomicU32>,
    pub count: Arc<AtomicU32>,
}

impl DuplicateParams {
    pub fn new(default_chance: u32, default_count: u32) -> Self {
        Self {
            base: BaseParams::new(),
            chance: Arc::new(AtomicU32::new(default_chance)),
            count: Arc::new(AtomicU32::new(default_count)),
        }
    }
}

/// Tamper：概率 + 重算校验和（默认开）
#[derive(Debug)]
pub struct TamperParams {
    pub base: BaseParams,
    pub chance: Arc<AtomicU32>,
    pub redo_checksum: Arc<AtomicBool>,
}

impl TamperParams {
    pub fn new(default_chance: u32) -> Self {
        Self {
            base: BaseParams::new(),
            chance: Arc::new(AtomicU32::new(default_chance)),
            redo_checksum: Arc::new(AtomicBool::new(true)),
        }
    }
}

/// Reset：概率（默认 0）+ "RST 下一包" 计数
#[derive(Debug)]
pub struct ResetParams {
    pub base: BaseParams,
    pub chance: Arc<AtomicU32>,
    pub set_next_count: Arc<AtomicU16>,
}

impl ResetParams {
    pub fn new(default_chance: u32) -> Self {
        Self {
            base: BaseParams::new(),
            chance: Arc::new(AtomicU32::new(default_chance)),
            set_next_count: Arc::new(AtomicU16::new(0)),
        }
    }
}

/// Bandwidth：上限 KB/s（0-99999，默认 10）
#[derive(Debug)]
pub struct BandwidthParams {
    pub base: BaseParams,
    pub limit: Arc<AtomicU32>,
}

impl BandwidthParams {
    pub fn new(default_limit: u32) -> Self {
        Self {
            base: BaseParams::new(),
            limit: Arc::new(AtomicU32::new(default_limit)),
        }
    }
}

/// 引擎共享配置：UI 线程写（Atomic），引擎线程无锁读取快照
#[derive(Debug)]
pub struct EngineConfig {
    pub lag: LagParams,
    pub drop: ChanceParams,
    pub throttle: ThrottleParams,
    pub duplicate: DuplicateParams,
    pub ood: ChanceParams,
    pub tamper: TamperParams,
    pub reset: ResetParams,
    pub bandwidth: BandwidthParams,
    /// 发送状态（SEND_STATUS_*），引擎写、UI 轮询读后清零
    pub send_state: Arc<AtomicU8>,
    /// 模块触发位掩码（bit i = 模块 i 在上个轮询周期内触发过）
    pub triggered_mask: Arc<AtomicU32>,
    /// 匹配包总数（capture / start 均计数）
    pub matched_count: Arc<AtomicU64>,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            lag: LagParams::new(50),
            drop: ChanceParams::new(1000),
            throttle: ThrottleParams::new(1000, 30),
            duplicate: DuplicateParams::new(1000, 2),
            ood: ChanceParams::new(1000),
            tamper: TamperParams::new(1000),
            reset: ResetParams::new(0),
            bandwidth: BandwidthParams::new(10),
            send_state: Arc::new(AtomicU8::new(SEND_STATUS_NONE)),
            triggered_mask: Arc::new(AtomicU32::new(0)),
            matched_count: Arc::new(AtomicU64::new(0)),
        }
    }
}
