use windivert::layer::NetworkLayer;
use windivert::WinDivertAddress;

#[derive(Clone, Debug)]
pub struct Packet {
    pub data: Vec<u8>,
    pub addr: WinDivertAddress<NetworkLayer>,
    /// fill in by lag module when queued
    pub timestamp: u64,
}

impl Packet {
    pub fn new(data: Vec<u8>, addr: WinDivertAddress<NetworkLayer>) -> Self {
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
