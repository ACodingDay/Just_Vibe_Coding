//! CRateStats 的 Rust 移植（C 原版 bandwidth.c 的 crate_stats_*）
//!
//! 滑动窗口速率统计：按毫秒分桶的环形缓冲。\`update\` 把样本累加到
//! \`now\` 所在毫秒桶，\`calculate\` 先逐出窗口外的旧样本，再按窗口
//! 换算成"每秒"速率（\`accumulated_count * scale / window_size\`）。
//!
//! 用途：
//! - bandwidth 效果：\`RateStats::new(1000, 1000.0)\`，count = 包字节数
//! - 全局包速率统计：\`RateStats::default()\`，count = 包数（1/包）

/// 滑动窗口速率统计（窗口按毫秒分桶，行为与 C 原版 CRateStats 一致）
pub(crate) struct RateStats {
    initialized: bool,
    oldest_index: u32,
    oldest_ts: u64,
    accumulated_count: i64,
    sample_num: i32,
    window_size: u32,
    scale: f32,
    array_sum: Vec<u32>,
    array_sample: Vec<u32>,
}

impl Default for RateStats {
    /// 默认 1000ms 窗口、按"每秒"换算（用于全局包速率统计）
    fn default() -> Self {
        Self::new(1000, 1000.0)
    }
}

impl RateStats {
    /// \`window_size\`：窗口毫秒数（分桶数）；\`scale\`：\`calculate\` 的换算
    /// 系数，\`scale = 1000\` 时返回"每秒"速率（C 原版 crate_stats_new）
    pub(crate) fn new(window_size: u32, scale: f32) -> Self {
        let mut s = Self {
            initialized: false,
            oldest_index: 0,
            oldest_ts: 0,
            accumulated_count: 0,
            sample_num: 0,
            window_size,
            scale,
            array_sum: vec![0; window_size as usize],
            array_sample: vec![0; window_size as usize],
        };
        s.reset();
        s
    }

    fn reset(&mut self) {
        for v in self.array_sum.iter_mut() {
            *v = 0;
        }
        for v in self.array_sample.iter_mut() {
            *v = 0;
        }
        self.initialized = false;
        self.sample_num = 0;
        self.accumulated_count = 0;
        self.oldest_ts = 0;
        self.oldest_index = 0;
    }

    /// 逐出窗口外的最旧历史（C 原版 crate_stats_evict）
    fn evict(&mut self, now: u64) {
        if !self.initialized {
            return;
        }
        // 修复：原写法 `now - window_size + 1` 在 now < window_size - 1 时下溢。
        // now_ms() 从进程首次调用处起算为 0，所以引擎启动后的第一个包必然落入
        // 该区间：debug 构建（overflow-checks 默认开）直接 panic，而 panic 发生在
        // recv 线程持有引擎 Mutex 时 → 锁被 poison → clock 线程连带 panic →
        // 收尾的 close_down + send_all + WinDivertClose 全部跳过。
        // 语义上 now < window_size - 1 就意味着窗口尚未填满、无可逐出，直接返回。
        let Some(new_oldest_ts) = now.checked_sub(self.window_size as u64 - 1) else {
            return;
        };
        if (new_oldest_ts as i64) - (self.oldest_ts as i64) < 0 {
            return;
        }
        while (self.oldest_ts as i64) - (new_oldest_ts as i64) < 0 {
            let ix = self.oldest_index as usize;
            if self.sample_num == 0 {
                break;
            }
            self.sample_num -= self.array_sample[ix] as i32;
            self.accumulated_count -= self.array_sum[ix] as i64;
            self.array_sample[ix] = 0;
            self.array_sum[ix] = 0;
            self.oldest_index = (self.oldest_index + 1) % self.window_size;
            self.oldest_ts += 1;
        }
        self.oldest_ts = new_oldest_ts;
    }

    /// 样本到达时记录（C 原版 crate_stats_update）
    pub(crate) fn update(&mut self, count: i32, now: u64) {
        if !self.initialized {
            self.oldest_ts = now;
            self.oldest_index = 0;
            self.accumulated_count = 0;
            self.sample_num = 0;
            self.initialized = true;
        }
        if (now as i64) - (self.oldest_ts as i64) < 0 {
            return;
        }
        self.evict(now);
        let offset = (now - self.oldest_ts) as usize;
        let ix = (self.oldest_index as usize + offset) % self.window_size as usize;
        self.sample_num += 1;
        self.accumulated_count += count as i64;
        self.array_sum[ix] += count as u32;
        self.array_sample[ix] += 1;
    }

    /// 计算当前速率（C 原版 crate_stats_calculate）；窗口未满返回 -1
    pub(crate) fn calculate(&mut self, now: u64) -> i32 {
        self.evict(now);
        let active_size = (now - self.oldest_ts + 1) as i64;
        if !self.initialized
            || self.sample_num <= 0
            || active_size <= 1
            || (active_size as u64) < self.window_size as u64
        {
            return -1;
        }
        let r = (self.accumulated_count as f32 * self.scale) / self.window_size as f32 + 0.5;
        r as i32
    }
}

#[cfg(test)]
mod tests {
    use super::RateStats;

    /// 回归：now_ms() 从 0 起算，引擎启动后的第一批样本必然落在窗口长度之内。
    /// 修复前 evict 的 `now - window_size + 1` 在这里直接下溢。
    #[test]
    fn sample_before_window_fills_does_not_underflow() {
        let mut s = RateStats::new(1000, 1000.0);
        s.update(1, 0);
        assert_eq!(s.calculate(0), -1, "窗口未满应返回 -1");
        s.update(1, 999);
        assert!(s.calculate(999) > 0, "窗口填满后应能算出速率");
    }

    #[test]
    fn calculate_scales_to_per_second() {
        let mut s = RateStats::new(1000, 1000.0);
        s.update(5, 0);
        s.update(5, 999);
        // 窗口 1000ms、scale 1000 → 累计值即"每秒"值
        assert_eq!(s.calculate(999), 10);
    }

    #[test]
    fn evict_drops_samples_outside_window() {
        let mut s = RateStats::new(1000, 1000.0);
        s.update(100, 0);
        s.update(100, 2000);
        // t=0 的样本已滑出 [1001, 2000] 窗口，只剩 100
        assert_eq!(s.calculate(2000), 100);
    }

    #[test]
    fn update_ignores_clock_regression() {
        let mut s = RateStats::new(1000, 1000.0);
        s.update(7, 500);
        s.update(7, 400);
        assert_eq!(s.calculate(500), -1, "仅一个时刻有样本（active_size <= 1）应为 -1");
        s.update(7, 1499);
        assert_eq!(s.calculate(1499), 14);
    }

    #[test]
    fn empty_window_after_traffic_stop_reports_zero_samples() {
        let mut s = RateStats::new(1000, 1000.0);
        s.update(10, 0);
        s.update(10, 500);
        s.update(10, 999);
        // 流量停止：窗口滑空后累计样本归零
        assert_eq!(s.calculate(5000), -1);
        assert_eq!(s.sample_num, 0);
        assert_eq!(s.accumulated_count, 0);
    }
}
