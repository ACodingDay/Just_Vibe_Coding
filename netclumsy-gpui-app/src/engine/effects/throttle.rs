use std::collections::VecDeque;
use std::sync::atomic::Ordering;

use crate::engine::config::ThrottleParams;
use crate::engine::effects::{calc_chance, check_direction};
use crate::engine::now_ms;
use crate::engine::packet::Packet;

const KEEP_AT_MOST: usize = 1000;

#[derive(Default)]
pub struct State {
    /// 节流缓冲，front = 最新收入
    buf: VecDeque<Packet>,
    /// 节流时段开始时间（毫秒），0 = 未节流
    start_tick: u64,
    pub last_enabled: bool,
}

impl State {
    pub fn startup(&mut self) {
        debug_assert!(self.buf.is_empty());
        self.buf.clear();
        self.start_tick = 0;
    }

    /// 关闭时放回缓冲内所有包（C 原版 clearBufPackets）
    pub fn close_down(&mut self, queue: &mut VecDeque<Packet>) {
        let mut flushed: Vec<Packet> = Vec::with_capacity(self.buf.len());
        while let Some(p) = self.buf.pop_back() {
            flushed.push(p);
        }
        for p in flushed.into_iter().rev() {
            queue.push_back(p);
        }
        self.start_tick = 0;
    }

    /// 节流时段逻辑（C 原版 throttleProcess）
    pub fn process(
        &mut self,
        queue: &mut VecDeque<Packet>,
        params: &ThrottleParams,
        _now: u64,
    ) -> bool {
        let inbound = params.base.inbound.load(Ordering::Relaxed);
        let outbound = params.base.outbound.load(Ordering::Relaxed);
        let chance = params.chance.load(Ordering::Relaxed);
        let frame = params.frame.load(Ordering::Relaxed) as u64;
        let drop_throttled = params.drop_throttled.load(Ordering::Relaxed);

        let mut throttled = false;
        if self.start_tick == 0 {
            // 主队列非空（不限方向）且概率命中才开启节流时段
            if !queue.is_empty() && calc_chance(chance) {
                self.start_tick = now_ms();
                throttled = true;
            } else {
                return false;
            }
        }

        // THROTTLE_START：从队尾往前收集匹配包入缓冲
        let current = now_ms();
        let mut i = queue.len();
        while self.buf.len() < KEEP_AT_MOST && i > 0 {
            i -= 1;
            if check_direction(&queue[i], inbound, outbound) {
                self.buf.push_front(queue.remove(i).unwrap());
            }
        }

        // 缓冲满或时间窗结束：全部丢弃或放回主队列
        if self.buf.len() >= KEEP_AT_MOST || current - self.start_tick > frame {
            if drop_throttled {
                self.buf.clear();
            } else {
                let mut flushed: Vec<Packet> = Vec::with_capacity(self.buf.len());
                while let Some(p) = self.buf.pop_back() {
                    flushed.push(p);
                }
                for p in flushed.into_iter().rev() {
                    queue.push_back(p);
                }
            }
            self.start_tick = 0;
        }

        throttled
    }
}
