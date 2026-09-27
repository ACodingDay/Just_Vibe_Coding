use std::collections::VecDeque;
use std::sync::atomic::Ordering;

use crate::engine::config::BandwidthParams;
use crate::engine::effects::check_direction;
use crate::engine::packet::Packet;
use crate::engine::stats::RateStats;

#[derive(Default)]
pub struct State {
    stats: Option<RateStats>,
    pub last_enabled: bool,
}

impl State {
    pub fn startup(&mut self) {
        self.stats = Some(RateStats::new(1000, 1000.0));
    }

    pub fn close_down(&mut self, _queue: &mut VecDeque<Packet>) {
        self.stats = None;
    }

    /// 滑动窗口限带宽：超限包丢弃（C 原版 bandwidthProcess）
    pub fn process(
        &mut self,
        queue: &mut VecDeque<Packet>,
        params: &BandwidthParams,
        now: u64,
    ) -> bool {
        let inbound = params.base.inbound.load(Ordering::Relaxed);
        let outbound = params.base.outbound.load(Ordering::Relaxed);
        let limit = params
            .limit
            .load(Ordering::Relaxed)
            .saturating_mul(1024) as i32;

        let Some(stats) = self.stats.as_mut() else {
            return false;
        };
        if limit < 0 {
            return false;
        }

        let mut dropped = false;
        let mut i = 0usize;
        while i < queue.len() {
            if check_direction(&queue[i], inbound, outbound) {
                let rate = stats.calculate(now);
                let size = queue[i].data.len() as i32;
                if rate + size > limit {
                    queue.remove(i);
                    dropped = true;
                    continue;
                } else {
                    stats.update(size, now);
                }
            }
            i += 1;
        }
        dropped
    }
}
