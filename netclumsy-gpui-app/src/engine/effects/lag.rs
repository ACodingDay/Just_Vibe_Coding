use std::collections::VecDeque;
use std::sync::atomic::Ordering;

use crate::engine::config::LagParams;
use crate::engine::effects::check_direction;
use crate::engine::now_ms;
use crate::engine::packet::Packet;

const KEEP_AT_MOST: usize = 2000;
const FLUSH_WHEN_FULL: usize = 800;

#[derive(Default)]
pub struct State {
    /// 私有缓冲，front = 最新收入（与 C 原版 bufHead 语义一致）
    buf: VecDeque<Packet>,
    pub last_enabled: bool,
}

impl State {
    pub fn startup(&mut self) {
        debug_assert!(self.buf.is_empty());
        self.buf.clear();
    }

    /// 关闭时把缓冲内所有包放回主队列（C 原版 lagCloseDown：
    /// 逐个 pop 最旧包、插回主队列 oldLast 之后 → 最终按时间顺序放回）
    pub fn close_down(&mut self, queue: &mut VecDeque<Packet>) {
        let mut flushed: Vec<Packet> = Vec::with_capacity(self.buf.len());
        while let Some(p) = self.buf.pop_back() {
            flushed.push(p);
        }
        for p in flushed.into_iter().rev() {
            queue.push_back(p);
        }
    }

    /// 收集匹配包入缓冲、放行超时包（C 原版 lagProcess）
    pub fn process(
        &mut self,
        queue: &mut VecDeque<Packet>,
        params: &LagParams,
        now: u64,
    ) -> bool {
        let inbound = params.base.inbound.load(Ordering::Relaxed);
        let outbound = params.base.outbound.load(Ordering::Relaxed);
        let time = params.time.load(Ordering::Relaxed) as u64;

        // 1) 从队尾往前收集匹配包入私有缓冲
        let mut i = queue.len();
        while self.buf.len() < KEEP_AT_MOST && i > 0 {
            i -= 1;
            if check_direction(&queue[i], inbound, outbound) {
                let mut p = queue.remove(i).unwrap();
                p.timestamp = now_ms();
                self.buf.push_front(p);
            }
        }

        // 2) 放行超时的包（buf back = 最旧）
        while let Some(p) = self.buf.back() {
            if now > p.timestamp.saturating_add(time) {
                let p = self.buf.pop_back().unwrap();
                queue.push_front(p);
            } else {
                break;
            }
        }

        // 3) 缓冲满时冲刷最旧的 FLUSH_WHEN_FULL 个
        if self.buf.len() >= KEEP_AT_MOST {
            let mut n = FLUSH_WHEN_FULL;
            while n > 0 {
                let Some(p) = self.buf.pop_back() else { break };
                queue.push_front(p);
                n -= 1;
            }
        }

        !self.buf.is_empty()
    }
}
