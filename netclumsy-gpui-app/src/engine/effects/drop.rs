use std::collections::VecDeque;
use std::sync::atomic::Ordering;

use crate::engine::config::ChanceParams;
use crate::engine::effects::{calc_chance, check_direction};
use crate::engine::packet::Packet;

#[derive(Default)]
pub struct State {
    pub last_enabled: bool,
}

impl State {
    pub fn startup(&mut self) {}

    pub fn close_down(&mut self, _queue: &mut VecDeque<Packet>) {}

    /// 按概率丢弃匹配方向的包（C 原版 dropProcess）
    pub fn process(
        &mut self,
        queue: &mut VecDeque<Packet>,
        params: &ChanceParams,
        _now: u64,
    ) -> bool {
        let inbound = params.base.inbound.load(Ordering::Relaxed);
        let outbound = params.base.outbound.load(Ordering::Relaxed);
        let chance = params.chance.load(Ordering::Relaxed);

        let before = queue.len();
        queue.retain(|p| !(check_direction(p, inbound, outbound) && calc_chance(chance)));
        queue.len() != before
    }
}
