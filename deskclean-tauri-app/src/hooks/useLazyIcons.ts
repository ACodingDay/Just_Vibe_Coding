/**
 * useLazyIcons.ts — 批量懒加载文件图标 Hook
 *
 * 对 .lnk 和普通文件（非文件夹）延迟加载系统图标：
 * - 通过 Tauri IPC get_file_icon 获取 base64 PNG
 * - 每批加载 4 个，批间间隔 16ms，避免阻塞 UI
 * - 加载失败时保持占位符图标不变
 */

import { useEffect, useRef, useCallback } from 'react';
import { getFileIcon } from '@/services/ipc';

interface IconQueueItem {
  /** 图标容器的 DOM 元素 */
  el: HTMLElement;
  /** 文件路径 */
  path: string;
}

export function useLazyIcons() {
  const queueRef = useRef<IconQueueItem[]>([]);
  const runningRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    const BATCH = 4;
    const DELAY = 16;

    const queue = queueRef.current;
    queueRef.current = [];

    for (let i = 0; i < queue.length; i += BATCH) {
      const batch = queue.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async ({ el, path }) => {
          try {
            const b64 = await getFileIcon(path);
            if (b64 && el.isConnected) {
              el.innerHTML = `<img class="file-icon-img" src="data:image/png;base64,${b64}" alt="" />`;
            }
          } catch {
            // 加载失败，保持占位符图标
          }
        }),
      );
      if (i + BATCH < queue.length) {
        await new Promise((r) => setTimeout(r, DELAY));
      }
    }

    runningRef.current = false;

    // 如果在处理期间有新项目入队，继续处理
    if (queueRef.current.length > 0) {
      processQueue();
    }
  }, []);

  /**
   * 将需要加载图标的元素加入队列。
   * @param items - 图标队列项数组
   */
  const enqueueIcons = useCallback(
    (items: IconQueueItem[]) => {
      if (items.length === 0) return;
      queueRef.current.push(...items);
      processQueue();
    },
    [processQueue],
  );

  return { enqueueIcons };
}
