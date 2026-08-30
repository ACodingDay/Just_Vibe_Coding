use std::collections::VecDeque;
use std::sync::atomic::Ordering;

use crate::engine::config::LagParams;
use crate::engine::effects::check_direction;
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

    /// 关闭时把缓冲内所有包放回主队列（C 原版 lagCloseDown）
    pub fn close_down(&mut self, queue: &mut VecDeque<Packet>) {
        // 修复：buf 是 front=最新 / back=最旧，`drain(..).rev()` 即按到达顺序
        // （最旧→最新）尾插回主队列，在 FIFO 回注下保持时间先后。原实现先
        // `rev()` 再 push_back 是绕着 send_all 的 pop_back（LIFO）写的补偿，
        // 方向约定统一后必须一起去掉，否则整组再次倒序。
        queue.extend(self.buf.drain(..).rev());
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
                // 修复：改用调用方传入的 now（原先在循环里又读一次 now_ms()，
                // 时间戳会晚于用于超时判定的 now，且本模块无法用模拟时钟单测）
                p.timestamp = now;
                self.buf.push_front(p);
            }
        }

        // 2) 放行超时的包（buf back = 最旧）
        let mut released: Vec<Packet> = Vec::new();
        while let Some(p) = self.buf.back() {
            if now > p.timestamp.saturating_add(time) {
                let p = self.buf.pop_back().unwrap();
                released.push(p);
            } else {
                break;
            }
        }
        push_front_ordered(queue, released);

        // 3) 缓冲满时冲刷最旧的 FLUSH_WHEN_FULL 个
        if self.buf.len() >= KEEP_AT_MOST {
            let mut released: Vec<Packet> = Vec::with_capacity(FLUSH_WHEN_FULL);
            while released.len() < FLUSH_WHEN_FULL {
                let Some(p) = self.buf.pop_back() else { break };
                released.push(p);
            }
            push_front_ordered(queue, released);
        }

        !self.buf.is_empty()
    }
}

/// 把一组「已按到达顺序（最旧→最新）排好」的包整体插到队首（队首 = 最先回注）。
///
/// 修复：原先两处调用都是逐个 `queue.push_front(p)`，那样后弹出的较新包会插到
/// 更前面，整组顺序反过来 —— 在 send_all 改为 FIFO 后会让最后放行的包最先回注。
fn push_front_ordered(queue: &mut VecDeque<Packet>, released: Vec<Packet>) {
    queue.reserve(released.len());
    for p in released.into_iter().rev() {
        queue.push_front(p);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windivert_sys::address::WINDIVERT_ADDRESS;

    fn pkt(tag: u8) -> Packet {
        Packet::new(vec![tag], WINDIVERT_ADDRESS::default())
    }

    /// 按 send_all 的约定模拟回注序列：队首 → 队尾依次发出
    fn emission_order(mut q: VecDeque<Packet>) -> Vec<u8> {
        let mut out = Vec::new();
        while let Some(p) = q.pop_front() {
            out.push(p.data[0]);
        }
        out
    }

    fn lag(time: u32) -> LagParams {
        LagParams::new(time)
    }

    /// 回归：被 lag 延迟的包必须排在它之后到达的包前面回注。
    /// send_all 用 pop_back 时这条断言是反的（延迟包被压到最后）。
    #[test]
    fn expired_packet_precedes_later_arrival() {
        let params = lag(50);
        let mut s = State::default();
        s.startup();
        let mut q = VecDeque::new();

        q.push_back(pkt(1));
        assert!(s.process(&mut q, &params, 0));
        assert!(q.is_empty(), "未超时的包应留在 lag 缓冲");

        q.push_back(pkt(2));
        assert!(s.process(&mut q, &params, 60));
        s.close_down(&mut q);

        assert_eq!(emission_order(q), vec![1, 2]);
    }

    /// 回归：同一步内整组放行时不能倒序（逐个 push_front 会反）。
    #[test]
    fn batch_release_keeps_arrival_order() {
        let params = lag(50);
        let mut s = State::default();
        s.startup();
        let mut q = VecDeque::new();

        for (tag, at) in [(1u8, 0u64), (2, 10)] {
            q.push_back(pkt(tag));
            s.process(&mut q, &params, at);
            assert!(q.is_empty());
        }
        // t=61：两个包同时超时（61 > 50 且 61 > 60）
        s.process(&mut q, &params, 61);
        assert_eq!(emission_order(q), vec![1, 2]);
    }

    #[test]
    fn close_down_flushes_in_arrival_order() {
        let params = lag(5000);
        let mut s = State::default();
        s.startup();
        let mut q = VecDeque::new();
        for (tag, at) in [(1u8, 0u64), (2, 100), (3, 200)] {
            q.push_back(pkt(tag));
            s.process(&mut q, &params, at);
        }
        assert!(q.is_empty(), "远未超时的包都还在缓冲里");

        s.close_down(&mut q);
        assert_eq!(emission_order(q), vec![1, 2, 3]);
        assert!(s.buf.is_empty(), "close_down 应清空私有缓冲");
    }
}
