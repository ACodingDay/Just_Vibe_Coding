use std::collections::VecDeque;
use std::sync::atomic::Ordering;

use crate::engine::config::ThrottleParams;
use crate::engine::effects::{calc_chance, check_direction};
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
        // 修复：buf 是 front=最新 / back=最旧，drain(..).rev() 即按到达顺序尾插。
        // 原实现的 `rev()` + push_back 是绕着 send_all 的 pop_back（LIFO）写的
        // 补偿，方向约定统一为 FIFO 后一起去掉，否则整组再次倒序。
        queue.extend(self.buf.drain(..).rev());
        self.start_tick = 0;
    }

    /// 节流时段逻辑（C 原版 throttleProcess）
    pub fn process(
        &mut self,
        queue: &mut VecDeque<Packet>,
        params: &ThrottleParams,
        now: u64,
    ) -> bool {
        let inbound = params.base.inbound.load(Ordering::Relaxed);
        let outbound = params.base.outbound.load(Ordering::Relaxed);
        let chance = params.chance.load(Ordering::Relaxed);
        let frame = params.frame.load(Ordering::Relaxed) as u64;
        let drop_throttled = params.drop_throttled.load(Ordering::Relaxed);

        // 修复：处于节流时段内即算触发（对齐 C 的 processTriggered 语义）。
        // 原实现只在"开启时段"的那一步返回 true，时段进行中的每一步都返回
        // false → UI 200ms 轮询时 Throttle 触发灯闪断。
        let mut throttled = self.start_tick != 0;
        if self.start_tick == 0 {
            // 主队列非空（不限方向）且概率命中才开启节流时段
            if !queue.is_empty() && calc_chance(chance) {
                // 修复：改用调用方注入的 now（一个 consume step 只读一次时钟，
                // 打点与判定同一时刻，且本模块可用模拟时钟单测）
                self.start_tick = now;
                throttled = true;
            } else {
                return false;
            }
        }

        // THROTTLE_START：从队尾往前收集匹配包入缓冲
        let mut i = queue.len();
        while self.buf.len() < KEEP_AT_MOST && i > 0 {
            i -= 1;
            if check_direction(&queue[i], inbound, outbound) {
                self.buf.push_front(queue.remove(i).unwrap());
            }
        }

        // 缓冲满或时间窗结束：全部丢弃或放回主队列
        if self.buf.len() >= KEEP_AT_MOST || now.saturating_sub(self.start_tick) > frame {
            if drop_throttled {
                self.buf.clear();
            } else {
                // 修复：同上，按到达顺序（最旧→最新）尾插，去掉绕 LIFO 的补偿
                queue.extend(self.buf.drain(..).rev());
            }
            self.start_tick = 0;
        }

        throttled
    }
}
