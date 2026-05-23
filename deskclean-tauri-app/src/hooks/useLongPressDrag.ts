/**
 * useLongPressDrag.ts — 长按拖拽 Hook
 *
 * 核心约束（来自项目规范）：
 * - 禁止使用 HTML5 原生 Drag API（dragstart 在 mousedown 后首次移动即触发，
 *   preventDefault 取消后整个按下周期内无法再次发起拖拽）
 * - 必须使用自定义 mousedown/mousemove/mouseup 事件
 *
 * 交互流程：
 * 1. 用户左键按下卡片 → 启动 500ms 定时器
 * 2. 500ms 内未移动超过阈值 → 进入拖拽模式（ghost 元素跟随鼠标）
 * 3. 拖拽过程中通过 elementFromPoint 检测 drop 目标
 * 4. 同抽屉内：显示左右方向插入指示线
 * 5. 跨抽屉：显示拖拽覆盖高亮
 * 6. mouseup → 调用 onDrop 回调报告拖拽结果
 */

import { useRef, useCallback, useEffect } from 'react';

/** 拖拽结果信息 */
export interface DropResult {
  /** 被拖拽图标的 path */
  srcPath: string;
  /** 源抽屉 ID */
  srcDrawerId: string;
  /** 目标卡片 path（如果 drop 在某张卡片上） */
  targetCardPath: string | null;
  /** 目标抽屉 ID */
  targetDrawerId: string | null;
  /** 插入位置：'before' 插入到目标卡片前，'after' 插入到目标卡片后，null 表示 drop 在空白区域 */
  position: 'before' | 'after' | null;
}

interface UseLongPressDragOptions {
  /** 长按触发时间（毫秒），默认 500ms */
  longPressMs?: number;
  /** 拖拽开始回调 */
  onDragStart?: (srcPath: string, srcDrawerId: string) => void;
  /** 拖拽结束回调（包含完整的 drop 结果） */
  onDrop?: (result: DropResult) => void;
}

/**
 * 返回一个 bindDrag 函数，绑定到卡片容器的 onMouseDown。
 * 内部管理 ghost 元素、mousemove/mouseup 监听器。
 */
export function useLongPressDrag({
  longPressMs = 500,
  onDragStart,
  onDrop,
}: UseLongPressDragOptions) {
  const dragStateRef = useRef<{
    active: boolean;
    srcPath: string;
    srcDrawerId: string;
    ghostEl: HTMLDivElement | null;
    offX: number;
    offY: number;
  } | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indicatorRef = useRef<HTMLElement | null>(null);

  // 清理拖拽状态
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (dragStateRef.current?.ghostEl) {
      dragStateRef.current.ghostEl.remove();
    }
    // 移除插入指示
    if (indicatorRef.current) {
      indicatorRef.current.classList.remove('drop-before', 'drop-after');
      indicatorRef.current = null;
    }
    // 移除拖拽覆盖高亮
    document.querySelectorAll('.file-group-items.drag-over').forEach((g) =>
      g.classList.remove('drag-over'),
    );
    // 还原源卡片样式
    document.querySelectorAll('.file-item.long-press-active').forEach((c) => {
      c.classList.remove('long-press-active', 'drag-source');
    });
    dragStateRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // mousemove 处理
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state?.active || !state.ghostEl) return;

      // 移动 ghost 元素
      state.ghostEl.style.left = `${e.clientX - state.offX}px`;
      state.ghostEl.style.top = `${e.clientY - state.offY}px`;

      // 暂时隐藏 ghost 以检测下方元素
      state.ghostEl.style.display = 'none';
      const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
      state.ghostEl.style.display = '';

      // 清除旧指示
      if (indicatorRef.current) {
        indicatorRef.current.classList.remove('drop-before', 'drop-after');
        indicatorRef.current = null;
      }
      document.querySelectorAll('.file-group-items.drag-over').forEach((g) =>
        g.classList.remove('drag-over'),
      );

      if (!elemBelow) return;

      // 检测是否在某张卡片上
      const targetCard = (elemBelow as HTMLElement).closest('.file-item') as HTMLElement | null;
      if (targetCard && targetCard.dataset.path !== state.srcPath) {
        const targetDrawerId = targetCard.dataset.drawerId;
        if (state.srcDrawerId === targetDrawerId) {
          // 同抽屉：显示左右方向插入指示线
          const rect = targetCard.getBoundingClientRect();
          const pos = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
          targetCard.classList.add(pos === 'before' ? 'drop-before' : 'drop-after');
          indicatorRef.current = targetCard;
        } else {
          // 跨抽屉：高亮目标网格
          const grid = targetCard.closest('.file-group-items') as HTMLElement | null;
          if (grid) grid.classList.add('drag-over');
        }
        return;
      }

      // 在网格空白区域
      const targetGrid = (elemBelow as HTMLElement).closest('.file-group-items') as HTMLElement | null;
      if (targetGrid) {
        targetGrid.classList.add('drag-over');
      }
    },
    [],
  );

  // mouseup 处理
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state?.active) {
        cleanup();
        return;
      }

      const { srcPath, srcDrawerId } = state;

      // 先清理 ghost 和指示器
      cleanup();

      // 检测 drop 目标
      const elemBelow = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!elemBelow || !onDrop) return;

      const targetCard = elemBelow.closest('.file-item') as HTMLElement | null;
      if (targetCard && targetCard.dataset.path !== srcPath) {
        const targetDrawerId = targetCard.dataset.drawerId || null;
        const rect = targetCard.getBoundingClientRect();
        const pos: 'before' | 'after' = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';

        onDrop({
          srcPath,
          srcDrawerId,
          targetCardPath: targetCard.dataset.path || null,
          targetDrawerId,
          position: pos,
        });
        return;
      }

      const targetGrid = elemBelow.closest('.file-group-items') as HTMLElement | null;
      if (targetGrid) {
        onDrop({
          srcPath,
          srcDrawerId,
          targetCardPath: null,
          targetDrawerId: (targetGrid as HTMLElement).dataset.drawerId || null,
          position: null,
        });
      }
    },
    [cleanup, onDrop],
  );

  /**
   * 绑定到卡片的 onMouseDown 处理器。
   * @param srcPath 图标的 path
   * @param srcDrawerId 图标所在的 drawer_id
   * @param cardEl 卡片 DOM 元素（用于生成 ghost）
   */
  const bindDrag = useCallback(
    (srcPath: string, srcDrawerId: string, cardEl: HTMLElement) => {
      const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();

        const startX = e.clientX;
        const startY = e.clientY;
        const rect = cardEl.getBoundingClientRect();
        const offX = startX - rect.left;
        const offY = startY - rect.top;

        // 清除旧定时器
        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(() => {
          // 进入拖拽模式
          cardEl.classList.add('long-press-active', 'drag-source');

          // 创建 ghost 元素
          const ghost = cardEl.cloneNode(true) as HTMLDivElement;
          ghost.classList.add('drag-ghost');
          ghost.style.cssText = `
            position: fixed; left: ${startX - offX}px; top: ${startY - offY}px;
            width: ${rect.width}px; pointer-events: none; z-index: 1000;
            opacity: 0.85; box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          `;
          document.body.appendChild(ghost);

          dragStateRef.current = {
            active: true,
            srcPath,
            srcDrawerId,
            ghostEl: ghost,
            offX,
            offY,
          };

          onDragStart?.(srcPath, srcDrawerId);
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        }, longPressMs);
      };

      const handleMouseUp_ = () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };

      const handleMouseLeave = () => {
        if (timerRef.current && !dragStateRef.current?.active) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };

      return {
        onMouseDown: handleMouseDown,
        onMouseUp: handleMouseUp_,
        onMouseLeave: handleMouseLeave,
      };
    },
    [longPressMs, onDragStart, handleMouseMove, handleMouseUp],
  );

  // 组件卸载时清理
  useEffect(() => cleanup, [cleanup]);

  return { bindDrag };
}
