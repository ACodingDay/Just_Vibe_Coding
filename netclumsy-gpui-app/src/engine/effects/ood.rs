use std::collections::VecDeque;
use std::sync::atomic::Ordering;

use crate::engine::config::ChanceParams;
use crate::engine::effects::{calc_chance, check_direction};
use crate::engine::packet::Packet;

const KEEP_TURNS_MAX: u32 = 10;

#[derive(Default)]
pub struct State {
    /// 暂存的单包（等下一个匹配包或超步数后放回队首）
    held: Option<Packet>,
    give_up_cnt: u32,
    pub last_enabled: bool,
}

impl State {
    pub fn startup(&mut self) {
        debug_assert!(self.held.is_none());
        self.held = None;
        self.give_up_cnt = KEEP_TURNS_MAX;
    }

    pub fn close_down(&mut self, queue: &mut VecDeque<Packet>) {
        if let Some(p) = self.held.take() {
            queue.push_front(p);
        }
    }

    /// 乱序逻辑（C 原版 oodProcess）
    pub fn process(
        &mut self,
        queue: &mut VecDeque<Packet>,
        params: &ChanceParams,
        _now: u64,
    ) -> bool {
        let inbound = params.base.inbound.load(Ordering::Relaxed);
        let outbound = params.base.outbound.load(Ordering::Relaxed);
        let chance = params.chance.load(Ordering::Relaxed);

        if self.held.is_some() {
            if !queue.is_empty() {
                let p = self.held.take().unwrap();
                queue.push_front(p);
                self.give_up_cnt = KEEP_TURNS_MAX;
            } else {
                self.give_up_cnt = self.give_up_cnt.saturating_sub(1);
                if self.give_up_cnt == 0 {
                    let p = self.held.take().unwrap();
                    queue.push_front(p);
                    self.give_up_cnt = KEEP_TURNS_MAX;
                }
            }
            // 暂存期间不再取新包，且释放不算触发
            return false;
        }

        if queue.is_empty() {
            return false;
        }

        if queue.len() == 1 {
            // 单包：抽出暂存，下次 process 放回队首
            if check_direction(&queue[0], inbound, outbound) && calc_chance(chance) {
                self.held = queue.pop_front();
                return true;
            }
            return false;
        }

        // 多包：外层概率命中后，对相邻匹配方向包两两交换
        if calc_chance(chance) {
            let mut first: Option<usize> = None;
            loop {
                first = next_correct_direction(queue, first, inbound, outbound);
                let second = next_correct_direction(queue, first, inbound, outbound);
                let (Some(f), Some(s)) = (first, second) else {
                    break;
                };
                if calc_chance(chance) {
                    queue.swap(f, s);
                }
                // 交换后 first 节点位于 s；未交换则前进到 second
                first = Some(s);
            }
            return true;
        }

        false
    }
}

/// 找 after 之后第一个匹配方向的包下标（C 原版 nextCorrectDirectionNode）
fn next_correct_direction(
    queue: &VecDeque<Packet>,
    after: Option<usize>,
    inbound: bool,
    outbound: bool,
) -> Option<usize> {
    let start = after.map_or(0, |i| i + 1);
    (start..queue.len()).find(|&i| check_direction(&queue[i], inbound, outbound))
}
