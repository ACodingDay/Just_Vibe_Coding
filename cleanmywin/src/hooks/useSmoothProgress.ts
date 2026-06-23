import { useState, useEffect, useRef } from "react";

/**
 * 进度值平滑追踪：用 requestAnimationFrame 让展示值持续逼近目标值。
 * - 目标快速变化时展示值快速追上（不跳变）
 * - 目标停滞时展示值仍缓慢微涨（避免用户以为卡死）
 * - 目标到达 100 时展示值直接设 100
 * - 目标重置为 0 时展示值立即归零
 *
 * @param target 真实进度 0-100
 * @returns 平滑后的展示进度
 */
export function useSmoothProgress(target: number): number {
    const [display, setDisplay] = useState(0);
    const targetRef = useRef(target);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        // 同步 ref 避免闭包过期（在 effect 中写 ref，符合 React 19 规范）
        targetRef.current = target;

        // 目标归零：立即重置
        if (target === 0) {
            setDisplay(0);
            return;
        }

        // 目标到顶：直接到位
        if (target >= 100) {
            setDisplay(100);
            return;
        }

        const step = () => {
            setDisplay((prev) => {
                const t = targetRef.current;
                if (t <= 0) {
                    cancelAnimationFrame(rafRef.current);
                    return 0;
                }
                if (t >= 100) {
                    cancelAnimationFrame(rafRef.current);
                    return 100;
                }
                const gap = t - prev;
                if (gap <= 0.3) return prev; // 太近了不动，避免抖动
                // 每帧追赶 gap 的 6%，快时追得快，慢时持续微涨
                const next = prev + gap * 0.06;
                return Math.min(next, t, 99.9);
            });
            rafRef.current = requestAnimationFrame(step);
        };

        rafRef.current = requestAnimationFrame(step);

        return () => cancelAnimationFrame(rafRef.current);
    }, [target]);

    return display;
}
