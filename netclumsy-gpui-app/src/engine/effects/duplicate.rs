use std::collections::VecDeque;
use std::sync::atomic::Ordering;

use crate::engine::config::DuplicateParams;
use crate::engine::effects::{calc_chance, check_direction};
use crate::engine::packet::Packet;

#[derive(Default)]
pub struct State {
    pub last_enabled: bool,
}

impl State {
    pub fn startup(&mut self) {}

    pub fn close_down(&mut self, _queue: &mut VecDeque<Packet>) {}

    /// 按概率把匹配包复制成 count 份（C 原版 dupProcess）
    pub fn process(
        &mut self,
        queue: &mut VecDeque<Packet>,
        params: &DuplicateParams,
        _now: u64,
    ) -> bool {
        let inbound = params.base.inbound.load(Ordering::Relaxed);
        let outbound = params.base.outbound.load(Ordering::Relaxed);
        let chance = params.chance.load(Ordering::Relaxed);
        let copies = params.count.load(Ordering::Relaxed).saturating_sub(1) as usize;

        let mut triggered = false;
        let mut i = 0usize;
        while i < queue.len() {
            if check_direction(&queue[i], inbound, outbound) && calc_chance(chance) {
                let p = queue[i].clone();
                for _ in 0..copies {
                    queue.insert(i, p.clone());
                }
                // 跳过副本，下一个原包在 copies + 1 之后
                i += copies + 1;
                triggered = true;
            } else {
                i += 1;
            }
        }
        triggered
    }
}
