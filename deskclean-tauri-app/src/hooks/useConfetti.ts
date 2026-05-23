import { useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';

/**
 * Hook that wraps canvas-confetti with a two-layer animation:
 * - Layer A: multi-point burst sequence
 * - Layer B: sustained side streams
 *
 * @param durationMs - Total animation duration (default 1500ms)
 */
export function useConfetti(durationMs = 1500) {
  const activeRef = useRef(false);
  const animIdRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (animIdRef.current !== null) {
      cancelAnimationFrame(animIdRef.current);
      animIdRef.current = null;
    }
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;

    const colors = ['#bb0000', '#ffffff'];

    // Layer A: multi-point burst sequence
    const positions = [
      { x: 0.5, y: 0.6 },
      { x: 0.25, y: 0.4 },
      { x: 0.75, y: 0.3 },
    ];

    positions.forEach((pos, i) => {
      const t = window.setTimeout(() => {
        if (!activeRef.current) return;
        confetti({ particleCount: 55, origin: pos });
      }, i * 250);
      timersRef.current.push(t);
    });

    // Layer B: sustained side streams
    const endTime = Date.now() + durationMs;
    function frame() {
      if (!activeRef.current || Date.now() >= endTime) {
        activeRef.current = false;
        return;
      }
      confetti({ particleCount: 1, angle: 60, spread: 65, decay: 0.84, origin: { x: 0 }, colors });
      confetti({ particleCount: 1, angle: 120, spread: 65, decay: 0.84, origin: { x: 1 }, colors });
      animIdRef.current = requestAnimationFrame(frame);
    }
    animIdRef.current = requestAnimationFrame(frame);
  }, [durationMs]);

  useEffect(() => stop, [stop]);

  return { start, stop };
}
