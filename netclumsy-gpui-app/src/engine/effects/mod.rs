pub mod bandwidth;
pub mod drop;
pub mod duplicate;
pub mod lag;
pub mod ood;
pub mod reset;
pub mod tamper;
pub mod throttle;

use crate::engine::packet::Packet;

/// Whether the packet should be processed given the direction settings.
pub fn check_direction(packet: &Packet, inbound: bool, outbound: bool) -> bool {
    (inbound && !packet.is_outbound()) || (outbound && packet.is_outbound())
}

/// chance in range of [0, 10000]
pub fn calc_chance(chance: u32) -> bool {
    use rand::prelude::*;
    chance >= 10000 || rand::thread_rng().gen_range(0..10000) < chance
}
