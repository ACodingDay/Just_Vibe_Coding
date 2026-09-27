use windivert_sys::address::WINDIVERT_ADDRESS;

#[derive(Clone, Debug)]
pub struct Packet {
    pub data: Vec<u8>,
    pub addr: WINDIVERT_ADDRESS,
    /// 进入 lag 缓冲的时间（毫秒），仅 lag 模块使用
    pub timestamp: u64,
}

impl Packet {
    pub fn new(data: Vec<u8>, addr: WINDIVERT_ADDRESS) -> Self {
        Self {
            data,
            addr,
            timestamp: 0,
        }
    }

    pub fn is_outbound(&self) -> bool {
        self.addr.outbound()
    }
}
